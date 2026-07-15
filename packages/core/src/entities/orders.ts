import { promises as fs } from "node:fs";
import path from "node:path";
import type { AssetOrder, JsonObject, OrderReference, OrderResultVersion, OrderStatus, VersionRole } from "../types.js";
import {
  exists,
  initProtocol,
  orderDir,
  orderJsonPath,
  orderReferencesDir,
  orderVersionDir,
  orderVersionsDir,
  protocolRoot,
  readJson,
  readJsonIfExists,
  relativeProtocolPath,
  requireAnalysis,
  requirePersona,
  stamp,
  stampForPath,
  writeJson,
} from "../protocol/index.js";
import { validateInput } from "../validate.js";
import {
  OrderAddRevisionParamsSchema,
  OrderCreateCandidateParamsSchema,
  OrderCreateParamsSchema,
  OrderCreateResultParamsSchema,
  OrderResultVersionSchema,
  OrderPromoteCandidateParamsSchema,
  OrderPersistVersionMetadataParamsSchema,
  OrderSetCurrentResultParamsSchema,
  OrderSetStatusParamsSchema,
  OrderUpdateParamsSchema,
} from "../schemas/index.js";
import {
  deepMerge,
  isFoundationAssetType,
  isPlainObject,
  isValidStatusTransition,
  validNextStatuses,
  normalizeOrder,
  normalizeReferences,
  requireValidStatus,
  validateOrderId,
  validateVersionId,
} from "../utils/index.js";
import { readOrder, IMAGE_EXTENSIONS } from "./shared.js";
import {
  abortOrderTransaction,
  assertOrderBytesUnchanged,
  listOrderRecoveryTransactions,
  markRecoveryRequired,
  prepareRecoveryManifest,
  recoverOrderTransaction,
  createOrderTransaction,
  removeOrderTransactionIdentity,
  withOrderMutationLock,
  type OrderRecoveryManifest,
} from "./order-transactions.js";

/**
 * For every file-type reference on the order, copy the referenced image into the
 * order's own `references/` directory and rewrite `ref.path` to be relative to
 * the order dir (e.g. `"references/hero-composite.webp"`). This makes the order
 * self-contained — it no longer depends on an external absolute path that may
 * move or disappear.
 *
 * Must run AFTER normalizeOrder (so refs are well-formed) and BEFORE writeJson
 * (so the relative path is what gets persisted). Idempotent: if a ref path is
 * already relative to references/, it is left as-is.
 */
async function materializeOrderReferences(projectRoot: string, orderId: string, order: AssetOrder): Promise<void> {
  if (!Array.isArray(order.references) || order.references.length === 0) return;
  const refsDir = orderReferencesDir(projectRoot, orderId);

  for (const ref of order.references) {
    if (ref.type !== "file") continue;

    // Skip already-materialized refs (relative to order dir, under references/)
    if (!path.isAbsolute(ref.path) && ref.path.startsWith("references/")) continue;

    const src = path.isAbsolute(ref.path) ? ref.path : path.resolve(projectRoot, ref.path);
    if (!(await exists(src))) {
      throw new Error(`Reference file '${ref.path}' does not exist (resolved: ${src}).`);
    }
    const ext = path.extname(src).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) {
      throw new Error(`Reference file '${ref.path}' is not a recognized image (extension '${ext}').`);
    }

    await fs.mkdir(refsDir, { recursive: true });
    const basename = path.basename(src);
    const dest = path.join(refsDir, basename);
    if (await exists(dest)) {
      // Deduplicate by name; if a different file already occupies this name, suffix it.
      const stem = path.basename(src, ext);
      let i = 2;
      let candidate = path.join(refsDir, `${stem}-${i}${ext}`);
      while (await exists(candidate)) { i++; candidate = path.join(refsDir, `${stem}-${i}${ext}`); }
      await fs.copyFile(src, candidate);
      ref.path = `references/${path.basename(candidate)}`;
    } else {
      await fs.copyFile(src, dest);
      ref.path = `references/${basename}`;
    }
  }
}

export async function createOrders(projectRoot: string, params: JsonObject) {
  validateInput("order.create", OrderCreateParamsSchema, params);
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);
  await requirePersona(projectRoot);
  const inputOrders = Array.isArray(params.orders) ? params.orders : params.order ? [params.order] : undefined;
  if (!inputOrders?.length) throw new Error("order.create requires params.order or params.orders.");
  const orders = inputOrders.map((order) => normalizeOrder(order as AssetOrder));
  for (const order of orders) {
    validateOrderId(order.orderId);
    if (order.status === "delivered" || order.currentVersion !== undefined || order.orderAsset !== undefined) {
      throw new Error("order.create cannot create delivered/current result state. Create the order first, then publish materialized files with order.create_result.");
    }
  }
  const overwrite = params.overwrite === true;
  for (const order of orders) {
    const file = orderJsonPath(projectRoot, order.orderId);
    if ((await exists(file)) && !overwrite) throw new Error(`Order ${order.orderId} already exists. Ask before overwrite=true.`);
  }
  const written: string[] = [];
  for (const order of orders) {
    const file = orderJsonPath(projectRoot, order.orderId);
    await fs.mkdir(orderVersionsDir(projectRoot, order.orderId), { recursive: true });
    await withOrderMutationLock(projectRoot, order.orderId, "order.create", async () => {
      if ((await exists(file)) && !overwrite) throw new Error(`Order ${order.orderId} already exists. Ask before overwrite=true.`);
      await materializeOrderReferences(projectRoot, order.orderId, order);
      await writeJson(file, order, overwrite);
    });
    written.push(relativeProtocolPath(projectRoot, file));
  }
  return { written, orders };
}

export async function listOrders(projectRoot: string) {
  const ordersDir = path.join(protocolRoot(projectRoot), "orders");
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await fs.readdir(ordersDir, { withFileTypes: true });
  } catch {
    return { files: [], orders: [] };
  }
  const orderDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const files = orderDirs.map((orderId) => `${orderId}/order.json`);
  const orders = [];
  for (const orderId of orderDirs) {
    const file = `${orderId}/order.json`;
    try {
      const order = await readJson(orderJsonPath(projectRoot, orderId));
      const results = await listOrderResults(projectRoot, orderId).catch(() => ({ results: [] as OrderResultVersion[] }));
      orders.push({
        orderId: order.orderId,
        status: order.status,
        assetType: order.assetType,
        priority: order.priority,
        currentVersion: order.currentVersion,
        resultCount: results.results.length,
        file,
      });
    } catch {
      orders.push({ orderId, file, unreadable: true });
    }
  }
  return { files, orders };
}

export async function updateOrder(projectRoot: string, params: JsonObject) {
  validateInput("order.update", OrderUpdateParamsSchema, params);
  await initProtocol(projectRoot);
  const orderId = validateOrderId(String(params.orderId ?? ""));
  const file = orderJsonPath(projectRoot, orderId);
  if (params.overwrite !== true) {
    throw new Error("order.update requires params.overwrite=true after explicit user approval. Use order.set_status or order.add_revision for narrow updates.");
  }
  const patch = isPlainObject(params.patch) ? params.patch : isPlainObject(params.order) ? params.order : undefined;
  if (!patch) throw new Error("order.update requires params.patch or params.order.");
  return withOrderMutationLock(projectRoot, orderId, "order.update", async () => {
    const current = await readJson(file);
    const next = {
      ...deepMerge(current, patch),
      orderId,
      schemaVersion: "repochan.asset-order.v1",
      createdAt: current.createdAt ?? stamp(),
      updatedAt: stamp(),
    } as AssetOrder;
    const topCurrent = next.currentVersion;
    const assetCurrent = next.orderAsset?.currentVersion;
    const currentChanged = topCurrent !== current.currentVersion || assetCurrent !== current.orderAsset?.currentVersion;
    if (next.status === "delivered" || currentChanged) {
      if (!topCurrent) throw new Error("order.update cannot produce delivered/current state without currentVersion.");
      if (assetCurrent && assetCurrent !== topCurrent) {
        throw new Error(`order.update currentVersion mismatch: order=${topCurrent}, orderAsset=${assetCurrent}.`);
      }
      await readMaterializedResultVersion(projectRoot, orderId, validateVersionId(topCurrent));
    }
    if (Array.isArray(next.references) && next.references.length) {
      next.references = normalizeReferences(next.references);
      await materializeOrderReferences(projectRoot, orderId, next);
    }
    await writeJson(file, next, true);
    return next;
  });
}

export async function setOrderStatus(projectRoot: string, orderId: string, status: OrderStatus) {
  validateInput("order.set_status", OrderSetStatusParamsSchema, { orderId, status });
  await initProtocol(projectRoot);
  validateOrderId(orderId);
  requireValidStatus(status);
  const file = orderJsonPath(projectRoot, orderId);
  return withOrderMutationLock(projectRoot, orderId, "order.set_status", async () => {
    const order = await readJson(file);
    const currentStatus = order.status as OrderStatus | undefined;
    if (currentStatus && !isValidStatusTransition(currentStatus, status)) {
      throw new Error(
        `order.set_status: illegal transition ${currentStatus}→${status} for order ${orderId}. ` +
          `Valid targets from ${currentStatus}: ${validNextStatuses(currentStatus).join(", ")}.`,
      );
    }
    if (status === "delivered") {
      const currentVersion = typeof order.currentVersion === "string" ? validateVersionId(order.currentVersion) : undefined;
      if (!currentVersion) throw new Error(`order.set_status: cannot mark ${orderId} delivered without a current result version.`);
      await readMaterializedResultVersion(projectRoot, orderId, currentVersion);
    }
    order.status = status;
    order.updatedAt = stamp();
    await writeJson(file, order, true);
    return order;
  });
}

export async function addOrderRevision(projectRoot: string, orderId: string, revisionRequest: string) {
  validateInput("order.add_revision", OrderAddRevisionParamsSchema, { orderId, revisionRequest });
  await initProtocol(projectRoot);
  validateOrderId(orderId);
  // Business rule: schema minLength:1 doesn't catch whitespace-only strings
  if (!revisionRequest.trim()) {
    throw new Error("order.add_revision: revisionRequest must contain non-whitespace text.");
  }
  const file = orderJsonPath(projectRoot, orderId);
  return withOrderMutationLock(projectRoot, orderId, "order.add_revision", async () => {
    const order = await readJson(file);
    order.revisions ??= [];
    order.revisions.push({ requestedAt: stamp(), request: revisionRequest, status: "draft" });
    order.status = "needs_revision";
    order.updatedAt = stamp();
    await writeJson(file, order, true);
    return order;
  });
}

function versionFilesFromDir(entries: string[]) {
  return entries.filter((entry) => entry !== "meta.json").sort();
}

type ResolvedResultFile = { basename: string; source: string };

function portableResultBasenameKey(basename: string): string {
  return basename.normalize("NFC").toLowerCase();
}

async function assertNoSymlinkPath(projectRoot: string, target: string, label: string): Promise<void> {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(target);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} escapes project root: ${target}`);
  }
  const parts = path.relative(root, resolved).split(path.sep).filter(Boolean);
  let current = root;
  for (const part of ["", ...parts]) {
    if (part) current = path.join(current, part);
    const stat = await fs.lstat(current).catch(() => undefined);
    if (stat?.isSymbolicLink()) throw new Error(`${label} refuses symlink path: ${current}`);
  }
}

async function preflightResultFiles(
  projectRoot: string,
  orderId: string,
  versionId: string,
  files: string[],
): Promise<ResolvedResultFile[]> {
  const destDir = orderVersionDir(projectRoot, orderId, versionId);
  const resolved: ResolvedResultFile[] = [];
  const basenames = new Set<string>();
  for (const raw of files) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const basename = path.basename(raw);
    const basenameKey = portableResultBasenameKey(basename);
    if (basenameKey === "meta.json") {
      throw new Error("Result file basename 'meta.json' is reserved for version metadata.");
    }
    if (basenames.has(basenameKey)) {
      throw new Error(`Result files must have unique basenames; '${basename}' would overwrite another input.`);
    }
    basenames.add(basenameKey);
    const dest = path.join(destDir, basename);
    const source = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(projectRoot, raw);
    if (source === path.resolve(dest)) await assertNoSymlinkPath(projectRoot, source, "Result destination reuse");
    const stat = await fs.stat(source).catch(() => undefined);
    if (!(stat?.isFile() && stat.size > 0)) {
      throw new Error(`Result file '${raw}' does not exist or is not a non-empty regular file.`);
    }
    resolved.push({ basename, source });
  }
  if (!resolved.length) {
    throw new Error("order.create_result requires at least one readable, non-empty result file.");
  }
  return resolved;
}

async function preflightStoredResultFiles(
  projectRoot: string,
  orderId: string,
  versionId: string,
  files: string[],
): Promise<void> {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("stored result version has no recorded files.");
  }
  const seen = new Set<string>();
  const versionDir = orderVersionDir(projectRoot, orderId, versionId);
  await assertNoSymlinkPath(projectRoot, versionDir, "Stored result version");
  const versionStat = await fs.lstat(versionDir).catch(() => undefined);
  if (!versionStat?.isDirectory()) throw new Error("stored result version directory is missing or is not a directory.");
  for (const raw of files) {
    if (typeof raw !== "string" || !raw.trim() || raw.includes("/") || raw.includes("\\")) {
      throw new Error(`stored result file must be a canonical basename: ${String(raw)}`);
    }
    const basenameKey = portableResultBasenameKey(raw);
    if (basenameKey === "meta.json") throw new Error("stored result file 'meta.json' is reserved for version metadata.");
    if (seen.has(basenameKey)) throw new Error(`stored result files contain duplicate '${raw}'.`);
    seen.add(basenameKey);
    const storedFile = path.join(versionDir, raw);
    await assertNoSymlinkPath(projectRoot, storedFile, "Stored result file");
    const stat = await fs.lstat(storedFile).catch(() => undefined);
    if (!(stat?.isFile() && stat.size > 0)) {
      throw new Error(`stored result file '${raw}' is missing or is not a non-empty regular file.`);
    }
  }
}

async function copyResultFiles(
  destinationDir: string,
  files: ResolvedResultFile[],
): Promise<string[]> {
  const recorded: string[] = [];
  for (const file of files) {
    const destination = path.join(destinationDir, file.basename);
    await fs.copyFile(file.source, destination);
    const copied = await fs.lstat(destination).catch(() => undefined);
    if (!(copied?.isFile() && copied.size > 0)) {
      throw new Error(`Copied result file '${file.basename}' is not a non-empty regular file.`);
    }
    recorded.push(file.basename);
  }
  return recorded;
}

async function materializeLegacyResultVersion(projectRoot: string, orderId: string, versionId: string): Promise<OrderResultVersion> {
  const versionDir = orderVersionDir(projectRoot, orderId, versionId);
  const files: string[] = [];
  for (const entry of (await fs.readdir(versionDir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "meta.json" || entry.isDirectory()) continue;
    const storedFile = path.join(versionDir, entry.name);
    await assertNoSymlinkPath(projectRoot, storedFile, "Legacy result file");
    const stat = await fs.lstat(storedFile);
    if (stat.isFile() && stat.size > 0) files.push(entry.name);
  }
  if (!files.length) throw new Error("legacy result version has no non-empty regular files to materialize.");
  const dirStat = await fs.stat(versionDir);
  const version: OrderResultVersion = {
    versionId,
    createdAt: dirStat.mtime.toISOString(),
    tool: "legacy-materialized",
    files,
    provenance: { tool: "repochan", action: "order.set_current_result.legacy_materialize" },
  };
  validateInput("order.result_version", OrderResultVersionSchema, version);
  await writeJson(path.join(versionDir, "meta.json"), version, false);
  return version;
}

async function readMaterializedResultVersion(
  projectRoot: string,
  orderId: string,
  versionId: string,
  options: { materializeLegacy?: boolean } = {},
): Promise<OrderResultVersion> {
  const versionDir = orderVersionDir(projectRoot, orderId, versionId);
  await assertNoSymlinkPath(projectRoot, versionDir, "Result version");
  const versionStat = await fs.lstat(versionDir).catch(() => undefined);
  if (!versionStat?.isDirectory()) throw new Error("stored result version directory is missing or is not a directory.");
  const metaPath = path.join(versionDir, "meta.json");
  await assertNoSymlinkPath(projectRoot, metaPath, "Result version metadata");
  const metaStat = await fs.lstat(metaPath).catch(() => undefined);
  const meta = metaStat
    ? await readJson(metaPath)
    : options.materializeLegacy ? await materializeLegacyResultVersion(projectRoot, orderId, versionId) : undefined;
  validateInput("order.result_version", OrderResultVersionSchema, meta);
  const version = meta as OrderResultVersion;
  if (version.versionId !== versionId) {
    throw new Error(`Result version metadata id '${version.versionId}' does not match directory '${versionId}'.`);
  }
  await preflightStoredResultFiles(projectRoot, orderId, versionId, version.files);
  return version;
}

async function validateRecoverySemanticSnapshot(
  projectRoot: string,
  orderId: string,
  manifest: OrderRecoveryManifest,
  snapshotPaths: Record<string, string>,
): Promise<void> {
  const orderPath = snapshotPaths["order.json"];
  if (!orderPath) throw new Error("Recovery semantic validation requires an order.json snapshot.");
  await assertNoSymlinkPath(projectRoot, orderPath, "Recovery order snapshot");
  const order = JSON.parse(await fs.readFile(orderPath, "utf8")) as AssetOrder;
  if (order.orderId !== orderId) throw new Error(`Recovery orderId mismatch: expected ${orderId}, got ${String(order.orderId)}.`);
  const topCurrent = order.currentVersion;
  const assetCurrent = order.orderAsset?.currentVersion;
  if (order.orderAsset && assetCurrent !== topCurrent) {
    throw new Error(`Recovery currentVersion mismatch: order=${String(topCurrent)}, orderAsset=${assetCurrent}.`);
  }
  if (order.status === "delivered" && !topCurrent) throw new Error("Recovery delivered order snapshot has no currentVersion.");
  if (topCurrent && order.orderAsset?.versions && !order.orderAsset.versions.some((entry) => entry.versionId === topCurrent)) {
    throw new Error(`Recovery currentVersion ${topCurrent} has no embedded version metadata.`);
  }

  const relevantIds = [manifest.versionId, manifest.previousVersionId].filter((value): value is string => Boolean(value));
  for (const versionId of relevantIds) {
    const directoryDestination = `versions/${versionId}`;
    const metadataDestination = `${directoryDestination}/meta.json`;
    const directoryEntry = manifest.entries.find((entry) => entry.destination === directoryDestination);
    const metadataEntry = manifest.entries.find((entry) => entry.destination === metadataDestination);
    const embedded = order.orderAsset?.versions?.find((entry) => entry.versionId === versionId);

    if (directoryEntry && !directoryEntry.existedBefore) {
      if (embedded) throw new Error(`Recovery order snapshot embeds ${versionId}, but the original version directory did not exist.`);
      if (topCurrent === versionId) throw new Error(`Recovery currentVersion ${versionId} points to an absent original version.`);
      continue;
    }

    const versionDir = directoryEntry ? snapshotPaths[directoryDestination] : orderVersionDir(projectRoot, orderId, versionId);
    const metaPath = directoryEntry
      ? path.join(versionDir, "meta.json")
      : metadataEntry ? snapshotPaths[metadataDestination] : path.join(versionDir, "meta.json");
    await assertNoSymlinkPath(projectRoot, versionDir, "Recovery version snapshot");
    await assertNoSymlinkPath(projectRoot, metaPath, "Recovery version metadata snapshot");
    const meta = JSON.parse(await fs.readFile(metaPath, "utf8")) as OrderResultVersion;
    validateInput("order.result_version", OrderResultVersionSchema, meta);
    if (meta.versionId !== versionId) throw new Error(`Recovery version identity mismatch: expected ${versionId}, got ${String(meta.versionId)}.`);
    await preflightStoredResultFilesAt(projectRoot, versionDir, meta.files);
    if (!embedded || JSON.stringify(embedded) !== JSON.stringify(meta)) {
      throw new Error(`Recovery embedded/stored metadata mismatch for ${versionId}.`);
    }
  }

  if (topCurrent && !relevantIds.includes(topCurrent)) {
    const current = await readMaterializedResultVersion(projectRoot, orderId, validateVersionId(topCurrent));
    const embedded = order.orderAsset?.versions?.find((entry) => entry.versionId === topCurrent);
    if (embedded && JSON.stringify(embedded) !== JSON.stringify(current)) {
      throw new Error(`Recovery current version metadata mismatch for ${topCurrent}.`);
    }
  }
}

async function preflightStoredResultFilesAt(projectRoot: string, versionDir: string, files: string[]): Promise<void> {
  if (!Array.isArray(files) || files.length === 0) throw new Error("Recovery version has no recorded files.");
  for (const file of files) {
    if (typeof file !== "string" || !file || file.includes("/") || file.includes("\\") || portableResultBasenameKey(file) === "meta.json") {
      throw new Error(`Recovery version contains invalid file name: ${String(file)}.`);
    }
    const absolute = path.join(versionDir, file);
    await assertNoSymlinkPath(projectRoot, absolute, "Recovery materialized file");
    const stat = await fs.lstat(absolute).catch(() => undefined);
    if (!(stat?.isFile() && stat.size > 0)) throw new Error(`Recovery materialized file is missing or empty: ${absolute}.`);
  }
}

class ProtocolRecoveryError extends Error {
  constructor(message: string, readonly recoveryDir: string) {
    super(`${message} Recovery directory retained at: ${recoveryDir}`);
    this.name = "ProtocolRecoveryError";
  }
}

async function assertSerializedOrderMutation(projectRoot: string, orderId: string): Promise<void> {
  const dir = orderDir(projectRoot, orderId);
  const active = (await fs.readdir(dir).catch(() => []))
    .find((entry) => entry.startsWith(".result-txn-") || entry.startsWith(".promotion-txn-") || entry.startsWith(".metadata-txn-"));
  if (active) {
    throw new Error(
      `Order ${orderId} mutations must be serialized; active transaction or retained recovery directory: ${path.join(dir, active)}. ` +
      "Retry after the active mutation completes, or recover the retained directory first.",
    );
  }
}

async function publishResultTransaction(input: {
  transactionRoot: string;
  stagedVersionDir: string;
  stagedOrderFile: string;
  versionDir: string;
  orderFile: string;
  overwrite: boolean;
  recoveryManifest: OrderRecoveryManifest;
}): Promise<void> {
  const backupVersion = path.join(input.transactionRoot, "previous-version");
  const backupOrder = path.join(input.transactionRoot, "previous-order.json");
  let movedPreviousVersion = false;
  let installedVersion = false;
  let movedPreviousOrder = false;
  let installedOrder = false;
  try {
    if (await exists(input.versionDir)) {
      if (!input.overwrite) throw new Error(`Result version already exists: ${input.versionDir}`);
      await fs.rename(input.versionDir, backupVersion);
      movedPreviousVersion = true;
    }
    await fs.rename(input.stagedVersionDir, input.versionDir);
    installedVersion = true;
    await fs.rename(input.orderFile, backupOrder);
    movedPreviousOrder = true;
    await fs.rename(input.stagedOrderFile, input.orderFile);
    installedOrder = true;
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    if (installedOrder) await fs.rm(input.orderFile, { force: true }).catch((failure) => rollbackErrors.push(failure));
    if (movedPreviousOrder) await fs.rename(backupOrder, input.orderFile).catch((failure) => rollbackErrors.push(failure));
    if (installedVersion) await fs.rm(input.versionDir, { recursive: true, force: true }).catch((failure) => rollbackErrors.push(failure));
    if (movedPreviousVersion) await fs.rename(backupVersion, input.versionDir).catch((failure) => rollbackErrors.push(failure));
    if (rollbackErrors.length) {
      const failure = `Result publish failed and rollback was incomplete: ${error instanceof Error ? error.message : String(error)}.`;
      await markRecoveryRequired(input.transactionRoot, input.recoveryManifest, failure).catch(() => undefined);
      throw new ProtocolRecoveryError(
        failure,
        input.transactionRoot,
      );
    }
    throw error;
  }
}

async function publishPromotionTransaction(
  transactionRoot: string,
  files: Array<{ destination: string; staged: string; backup: string }>,
  recoveryManifest: OrderRecoveryManifest,
): Promise<void> {
  const changed: Array<{ destination: string; backup?: string; installed: boolean }> = [];
  try {
    for (const file of files) {
      let backup: string | undefined;
      if (await exists(file.destination)) {
        backup = path.join(transactionRoot, file.backup);
        await fs.rename(file.destination, backup);
      }
      const item = { destination: file.destination, backup, installed: false };
      changed.push(item);
      await fs.rename(file.staged, file.destination);
      item.installed = true;
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const item of changed.reverse()) {
      if (item.installed) await fs.rm(item.destination, { force: true }).catch((failure) => rollbackErrors.push(failure));
      if (item.backup) await fs.rename(item.backup, item.destination).catch((failure) => rollbackErrors.push(failure));
    }
    if (rollbackErrors.length) {
      const failure = `Candidate promotion failed and rollback was incomplete: ${error instanceof Error ? error.message : String(error)}.`;
      await markRecoveryRequired(transactionRoot, recoveryManifest, failure).catch(() => undefined);
      throw new ProtocolRecoveryError(
        failure,
        transactionRoot,
      );
    }
    throw error;
  }
}

export async function createOrderResult(projectRoot: string, params: JsonObject) {
  validateInput("order.create_result", OrderCreateResultParamsSchema, params);
  return createOrderResultVersion(projectRoot, params);
}

async function createOrderResultVersion(projectRoot: string, params: JsonObject, role?: VersionRole) {
  const orderId = validateOrderId(String(params.orderId ?? ""));
  const versionId = validateVersionId(typeof params.versionId === "string" && params.versionId ? params.versionId : `v${stampForPath()}`);
  const versionDir = orderVersionDir(projectRoot, orderId, versionId);
  await assertNoSymlinkPath(projectRoot, versionDir, "Order result version");
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);
  await requirePersona(projectRoot);
  await assertSerializedOrderMutation(projectRoot, orderId);
  const orderFile = orderJsonPath(projectRoot, orderId);
  const originalOrderBytes = await fs.readFile(orderFile);
  const order = JSON.parse(originalOrderBytes.toString("utf8")) as AssetOrder;
  if (params.allowUnapprovedOrder !== true && !["approved", "in_progress"].includes(String(order.status ?? ""))) {
    throw new Error(
      `Order ${orderId} is not approved/in_progress (status=${order.status ?? "missing"}). ` +
        "Approve it first with `repochan order set-status <orderId> approved`, or pass allowUnapprovedOrder=true.",
    );
  }
  const overwrite = params.overwrite === true;
  if ((await exists(versionDir)) && !overwrite) throw new Error(`Order result ${orderId}/${versionId} already exists. Ask before overwrite=true.`);
  const inputFiles = Array.isArray(params.files) ? params.files.filter((file): file is string => typeof file === "string") : [];
  const resolvedTool = typeof params.tool === "string" ? params.tool : "repochan";
  const resolvedGenerationPrompt = typeof params.generationPrompt === "string" && params.generationPrompt.trim() ? params.generationPrompt.trim() : undefined;

  // Hard gate: if the result came from image generation, the full prompt must be recorded.
  // This prevents Painter agents from silently dropping the long assembled prompt and
  // only saving a short promptBrief — the exact full prompt is required for reproducibility.
  const isImageGeneration = resolvedTool.toLowerCase().includes("image_generate") || resolvedTool.toLowerCase().includes("image-gen");
  if (isImageGeneration && !resolvedGenerationPrompt) {
    throw new Error(
      `order.create_result: generationPrompt is REQUIRED when tool involves image generation (got tool="${resolvedTool}"). ` +
        "Pass generationPrompt=<the exact full prompt sent to image_generate>. " +
        "promptBrief is a short human summary and cannot substitute for the full prompt.",
    );
  }

  // A result version is an observable artifact, not a metadata-only declaration.
  // Resolve every input before creating the version directory so a missing file
  // cannot leave an empty version behind or move the order to `delivered`.
  const resolvedFiles = await preflightResultFiles(projectRoot, orderId, versionId, inputFiles);
  const { transactionRoot, identity: transactionIdentity } = await createOrderTransaction(projectRoot, orderId, "result_publish", versionId);
  const stagedVersionDir = path.join(transactionRoot, "version");
  const stagedOrderFile = path.join(transactionRoot, "order.json");
  let retainRecovery = false;
  try {
    await fs.mkdir(stagedVersionDir);
    const files = await copyResultFiles(stagedVersionDir, resolvedFiles);
    const version: OrderResultVersion = {
      versionId,
      createdAt: stamp(),
      tool: resolvedTool,
      files,
      role,
      promptBrief: typeof params.promptBrief === "string" ? params.promptBrief : undefined,
      generationPrompt: resolvedGenerationPrompt,
      revisedPrompt: typeof params.revisedPrompt === "string" ? params.revisedPrompt : undefined,
      notes: typeof params.notes === "string" ? params.notes : undefined,
      provenance: params.provenance ?? { tool: "repochan", action: "order.create_result" },
      meta: isPlainObject(params.meta) ? params.meta : undefined,
    };

    // Embed previous Asset info directly into order.json as orderAsset.
    const next = { ...order };
    next.currentVersion = params.setCurrent === false ? order.currentVersion : versionId;
    const embeddedVersions = [...(order.orderAsset?.versions ?? [])].filter((item: any) => item.versionId !== versionId);
    embeddedVersions.push(version);
    next.orderAsset = {
      ...(order.orderAsset ?? { meta: {} }),
      versions: embeddedVersions,
    };
    next.orderAsset.currentVersion = next.currentVersion;
    const shouldDeliver = params.markDelivered !== false && ["approved", "in_progress"].includes(String(next.status ?? ""));
    if (shouldDeliver) {
      if (!next.currentVersion) {
        throw new Error("order.create_result cannot mark an order delivered without a current result version. Use setCurrent=true or markDelivered=false.");
      }
      if (next.currentVersion !== versionId) {
        await readMaterializedResultVersion(projectRoot, orderId, next.currentVersion);
      }
      next.status = "delivered";
    }
    next.updatedAt = stamp();
    await fs.writeFile(path.join(stagedVersionDir, "meta.json"), `${JSON.stringify(version, null, 2)}\n`, "utf8");
    await fs.writeFile(stagedOrderFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await withOrderMutationLock(projectRoot, orderId, "order.create_result publish", async () => {
      await assertOrderBytesUnchanged(orderFile, originalOrderBytes, "order.create_result");
      const recoveryManifest = await prepareRecoveryManifest(projectRoot, orderId, transactionRoot, transactionIdentity, [
        { destination: versionDir, backup: "previous-version", kind: "directory" },
        { destination: orderFile, backup: "previous-order.json", kind: "file" },
      ]);
      await publishResultTransaction({ transactionRoot, stagedVersionDir, stagedOrderFile, versionDir, orderFile, overwrite, recoveryManifest });
    });
    return { order: next, version, checkedOrder: order };
  } catch (error) {
    retainRecovery = error instanceof ProtocolRecoveryError;
    throw error;
  } finally {
    if (!retainRecovery) {
      await fs.rm(transactionRoot, { recursive: true, force: true }).catch(() => undefined);
      await removeOrderTransactionIdentity(projectRoot, orderId, path.basename(transactionRoot)).catch(() => undefined);
    }
  }
}

/**
 * Create a candidate draft version — a parallel draft that is NOT promoted to
 * current and does NOT mark the order delivered. Reuses createOrderResult's
 * file-copy and meta-writing logic, then overrides the role to "candidate".
 *
 * Multiple candidates can coexist on one order. The user/AD later calls
 * promoteCandidate to select one as current; the rest stay as candidates.
 */
export async function createOrderCandidate(projectRoot: string, params: JsonObject) {
  validateInput("order.create_candidate", OrderCreateCandidateParamsSchema, params);
  // Delegate to createOrderResult with flags that prevent promotion + delivery.
  // allowUnapprovedOrder: candidates are typically added AFTER the order has been
  // delivered (user wants alternatives) — the approval gate would block that.
  // This is safe because candidates don't promote or change status.
  return createOrderResultVersion(projectRoot, {
    ...params,
    setCurrent: false,             // do NOT point currentVersion at this candidate
    markDelivered: false,          // do NOT change order status — candidates aren't deliveries
    allowUnapprovedOrder: true,    // candidates can be added to delivered orders
  }, "candidate");
}

/**
 * Promote a candidate version to current. The previous current version (if any)
 * is demoted to snapshot. At most one version is "current" at any time.
 */
export async function promoteCandidate(projectRoot: string, orderId: string, versionId: string) {
  validateInput("order.promote_candidate", OrderPromoteCandidateParamsSchema, { orderId, versionId });
  const id = validateOrderId(orderId);
  const vid = validateVersionId(versionId);
  const targetDir = orderVersionDir(projectRoot, id, vid);
  await assertNoSymlinkPath(projectRoot, targetDir, "Candidate promotion target");
  await initProtocol(projectRoot);

  const file = orderJsonPath(projectRoot, id);
  await assertSerializedOrderMutation(projectRoot, id);
  if (!(await exists(file))) throw new Error(`Order ${id} does not exist.`);
  const originalOrderBytes = await fs.readFile(file);
  const order = JSON.parse(originalOrderBytes.toString("utf8")) as AssetOrder;

  if (!order.orderAsset || !Array.isArray(order.orderAsset.versions)) {
    throw new Error(`Order ${id} has no result versions. Create a candidate first.`);
  }

  const versions = order.orderAsset.versions as OrderResultVersion[];
  const targetIndex = versions.findIndex((v) => v.versionId === vid);
  const embeddedTarget = versions[targetIndex];
  if (!embeddedTarget) {
    throw new Error(`Order ${id} has no version '${vid}'. Cannot promote.`);
  }
  if (embeddedTarget.role === "current") {
    throw new Error(`Version ${vid} is already the current version of order ${id}.`);
  }
  if (embeddedTarget.role !== "candidate") {
    throw new Error(`Version ${vid} is not a candidate. Only role=candidate versions can be promoted.`);
  }

  // The embedded version entry is not evidence by itself. Re-check the files
  // in the candidate's immutable version directory before changing any current
  // pointers or demoting the previous current version.
  let target: OrderResultVersion;
  try {
    target = await readMaterializedResultVersion(projectRoot, id, vid);
    if (target.role !== "candidate") throw new Error("stored result metadata role is not candidate.");
    if (JSON.stringify(target.files) !== JSON.stringify(embeddedTarget.files)) {
      throw new Error("embedded and stored result file lists do not match.");
    }
  } catch (error) {
    throw new Error(
      `Cannot promote candidate ${id}/${vid}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  versions[targetIndex] = target;

  // Demote the previous current (if any) to snapshot.
  let previousCurrent: OrderResultVersion | undefined;
  let previousMetaPath: string | undefined;
  const prevCurrentId = order.currentVersion;
  if (prevCurrentId) {
    const prev = versions.find((v) => v.versionId === prevCurrentId);
    if (prev && prev.versionId !== vid) {
      prev.role = "snapshot" as VersionRole;
      previousCurrent = { ...prev };
      const prevDir = orderVersionDir(projectRoot, id, prev.versionId);
      await assertNoSymlinkPath(projectRoot, prevDir, "Previous result version");
      const candidatePreviousMeta = path.join(prevDir, "meta.json");
      await assertNoSymlinkPath(projectRoot, candidatePreviousMeta, "Previous result metadata");
      if (await exists(candidatePreviousMeta)) previousMetaPath = candidatePreviousMeta;
    }
  }

  // Promote the target.
  target.role = "current" as VersionRole;
  order.currentVersion = vid;
  order.orderAsset.currentVersion = vid;
  order.updatedAt = stamp();

  const targetMetaPath = path.join(targetDir, "meta.json");
  await assertNoSymlinkPath(projectRoot, targetMetaPath, "Promoted result metadata");
  await assertNoSymlinkPath(projectRoot, file, "Promoted order state");
  const { transactionRoot, identity: transactionIdentity } = await createOrderTransaction(
    projectRoot,
    id,
    "candidate_promotion",
    vid,
    previousMetaPath ? previousCurrent?.versionId : undefined,
  );
  let retainRecovery = false;
  try {
    const publications: Array<{ destination: string; staged: string; backup: string }> = [];
    if (previousMetaPath && previousCurrent) {
      const staged = path.join(transactionRoot, "previous-meta.json");
      await fs.writeFile(staged, `${JSON.stringify(previousCurrent, null, 2)}\n`, "utf8");
      publications.push({ destination: previousMetaPath, staged, backup: "previous-meta.json.bak" });
    }
    const stagedTarget = path.join(transactionRoot, "target-meta.json");
    const stagedOrder = path.join(transactionRoot, "order.json");
    await fs.writeFile(stagedTarget, `${JSON.stringify(target, null, 2)}\n`, "utf8");
    await fs.writeFile(stagedOrder, `${JSON.stringify(order, null, 2)}\n`, "utf8");
    publications.push(
      { destination: targetMetaPath, staged: stagedTarget, backup: "target-meta.json.bak" },
      { destination: file, staged: stagedOrder, backup: "order.json.bak" },
    );
    await withOrderMutationLock(projectRoot, id, "order.promote_candidate publish", async () => {
      await assertOrderBytesUnchanged(file, originalOrderBytes, "order.promote_candidate");
      const recoveryManifest = await prepareRecoveryManifest(
        projectRoot,
        id,
        transactionRoot,
        transactionIdentity,
        publications.map((publication) => ({
          destination: publication.destination,
          backup: publication.backup,
          kind: "file" as const,
        })),
      );
      await publishPromotionTransaction(transactionRoot, publications, recoveryManifest);
    });
    return { order, promotedVersion: target, previousCurrent };
  } catch (error) {
    retainRecovery = error instanceof ProtocolRecoveryError;
    throw error;
  } finally {
    if (!retainRecovery) {
      await fs.rm(transactionRoot, { recursive: true, force: true }).catch(() => undefined);
      await removeOrderTransactionIdentity(projectRoot, id, path.basename(transactionRoot)).catch(() => undefined);
    }
  }
}

export async function listOrderResults(projectRoot: string, orderId: string) {
  const id = validateOrderId(orderId);
  const order = await readOrder(projectRoot, id).catch(() => ({} as any));

  // Prefer embedded orderAsset info in order.json (previous Asset's data now here)
  if (order.orderAsset && Array.isArray(order.orderAsset.versions)) {
    return {
      orderId: id,
      results: order.orderAsset.versions as OrderResultVersion[],
      currentVersion: order.orderAsset.currentVersion || order.currentVersion,
    };
  }

  // Fallback to dir scan + meta.json
  const dir = orderVersionsDir(projectRoot, id);
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { orderId: id, results: [] as OrderResultVersion[] };
  }
  const results: OrderResultVersion[] = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const versionId = validateVersionId(entry.name);
    const versionDir = orderVersionDir(projectRoot, id, versionId);
    const meta = (await readJsonIfExists(path.join(versionDir, "meta.json"))) as Partial<OrderResultVersion> | undefined;
    const dirFiles = versionFilesFromDir(await fs.readdir(versionDir).catch(() => []));
    results.push({
      versionId,
      createdAt: typeof meta?.createdAt === "string" ? meta.createdAt : "",
      tool: meta?.tool,
      files: Array.isArray(meta?.files) && meta.files.length ? meta.files : dirFiles,
      promptBrief: meta?.promptBrief,
      generationPrompt: meta?.generationPrompt,
      revisedPrompt: meta?.revisedPrompt,
      notes: meta?.notes,
      provenance: meta?.provenance,
      meta: meta?.meta,
    });
  }
  return { orderId: id, results };
}

export async function readOrderResult(projectRoot: string, orderId: string, versionId?: string) {
  const id = validateOrderId(orderId);
  const order = await readOrder(projectRoot, id);
  const listed = versionId ? undefined : await listOrderResults(projectRoot, id);
  const resolvedVersionId = versionId ? validateVersionId(versionId) : order.currentVersion ?? listed?.results.at(-1)?.versionId;
  if (!resolvedVersionId) throw new Error(`Order ${id} has no currentVersion. Pass versionId or create a result first.`);
  const dir = orderVersionDir(projectRoot, id, resolvedVersionId);
  if (!(await exists(dir))) throw new Error(`Order ${id} has no result version ${resolvedVersionId}.`);
  const meta = (await readJsonIfExists(path.join(dir, "meta.json"))) as Partial<OrderResultVersion> | undefined;
  const files = versionFilesFromDir(await fs.readdir(dir).catch(() => []));
  return {
    orderId: id,
    version: {
      versionId: resolvedVersionId,
      createdAt: typeof meta?.createdAt === "string" ? meta.createdAt : "",
      tool: meta?.tool,
      files: Array.isArray(meta?.files) && meta.files.length ? meta.files : files,
      promptBrief: meta?.promptBrief,
      generationPrompt: meta?.generationPrompt,
      revisedPrompt: meta?.revisedPrompt,
      notes: meta?.notes,
      provenance: meta?.provenance,
      meta: meta?.meta,
    } as OrderResultVersion,
  };
}

async function validateDerivedEvidence(projectRoot: string, versionDir: string, evidenceFiles: string[]) {
  for (const relative of evidenceFiles) {
    if (path.isAbsolute(relative) || relative.includes("\\")) throw new Error(`Evidence file must be relative to the version directory: ${relative}`);
    const absolute = path.resolve(versionDir, relative);
    if (!absolute.startsWith(`${path.resolve(versionDir)}${path.sep}`)) throw new Error(`Evidence file escapes the version directory: ${relative}`);
    await assertNoSymlinkPath(projectRoot, absolute, "Version metadata evidence");
    const stat = await fs.lstat(absolute).catch(() => undefined);
    if (!(stat?.isFile() && stat.size > 0)) throw new Error(`Version metadata evidence is missing or empty: ${relative}`);
  }
}

export async function persistOrderVersionMetadata(projectRoot: string, params: JsonObject) {
  validateInput("order.persist_version_metadata", OrderPersistVersionMetadataParamsSchema, params);
  const orderId = validateOrderId(String(params.orderId));
  const versionId = validateVersionId(String(params.versionId));
  const metadata = isPlainObject(params.metadata) ? params.metadata : {};
  const allowedMetadata = new Set(["tiles", "stickers", "stickersConfig"]);
  for (const key of Object.keys(metadata)) {
    if (!allowedMetadata.has(key)) throw new Error(`Unsupported derived version metadata key: ${key}.`);
  }
  const evidenceFiles = params.evidenceFiles as string[];
  await initProtocol(projectRoot);
  const versionDir = orderVersionDir(projectRoot, orderId, versionId);
  const metaPath = path.join(versionDir, "meta.json");
  const orderFile = orderJsonPath(projectRoot, orderId);
  await assertNoSymlinkPath(projectRoot, metaPath, "Version metadata persistence");

  await validateDerivedEvidence(projectRoot, versionDir, evidenceFiles);
  if (Array.isArray(metadata.stickers)) {
    for (const sticker of metadata.stickers) {
      const file = isPlainObject(sticker) && typeof sticker.file === "string" ? sticker.file : undefined;
      if (!file || !evidenceFiles.includes(file)) throw new Error("Every recorded sticker file must be present in evidenceFiles.");
    }
  }

  const { transactionRoot, identity } = await createOrderTransaction(projectRoot, orderId, "version_metadata", versionId);
  let retainRecovery = false;
  try {
    return await withOrderMutationLock(projectRoot, orderId, "order.persist_version_metadata", async () => {
      await validateDerivedEvidence(projectRoot, versionDir, evidenceFiles);
      const stored = await readMaterializedResultVersion(projectRoot, orderId, versionId);
      const order = await readJson(orderFile) as AssetOrder;
      const embeddedIndex = order.orderAsset?.versions?.findIndex((entry) => entry.versionId === versionId) ?? -1;
      if (embeddedIndex < 0 || !order.orderAsset?.versions) throw new Error(`Order ${orderId} does not embed result version ${versionId}.`);
      const embedded = order.orderAsset.versions[embeddedIndex];
      if (JSON.stringify(embedded) !== JSON.stringify(stored)) {
        throw new Error(`Cannot persist metadata: embedded and stored version ${versionId} disagree.`);
      }
      const updatedAt = stamp();
      const nextVersion = { ...stored, ...metadata, updatedAt } as OrderResultVersion;
      validateInput("order.result_version", OrderResultVersionSchema, nextVersion);
      const nextOrder = { ...order, orderAsset: { ...order.orderAsset, versions: [...order.orderAsset.versions] }, updatedAt };
      nextOrder.orderAsset.versions[embeddedIndex] = nextVersion;

      const stagedMeta = path.join(transactionRoot, "meta.json");
      const stagedOrder = path.join(transactionRoot, "order.json");
      await fs.writeFile(stagedMeta, `${JSON.stringify(nextVersion, null, 2)}\n`, "utf8");
      await fs.writeFile(stagedOrder, `${JSON.stringify(nextOrder, null, 2)}\n`, "utf8");
      const publications = [
        { destination: metaPath, staged: stagedMeta, backup: "meta.json.bak" },
        { destination: orderFile, staged: stagedOrder, backup: "order.json.bak" },
      ];
      const recoveryManifest = await prepareRecoveryManifest(projectRoot, orderId, transactionRoot, identity, [
        { destination: metaPath, backup: "meta.json.bak", kind: "file" },
        { destination: orderFile, backup: "order.json.bak", kind: "file" },
      ]);
      try {
        await publishPromotionTransaction(transactionRoot, publications, recoveryManifest);
      } catch (error) {
        retainRecovery = error instanceof ProtocolRecoveryError;
        throw error;
      }
      return { order: nextOrder, version: nextVersion };
    });
  } finally {
    if (!retainRecovery) {
      await fs.rm(transactionRoot, { recursive: true, force: true }).catch(() => undefined);
      await removeOrderTransactionIdentity(projectRoot, orderId, path.basename(transactionRoot)).catch(() => undefined);
    }
  }
}

export async function setCurrentOrderResult(projectRoot: string, orderId: string, versionId: string) {
  validateInput("order.set_current_result", OrderSetCurrentResultParamsSchema, { orderId, versionId });
  const id = validateOrderId(orderId);
  const version = validateVersionId(versionId);
  await assertNoSymlinkPath(projectRoot, orderVersionDir(projectRoot, id, version), "Current result version");
  await initProtocol(projectRoot);
  const file = orderJsonPath(projectRoot, id);
  return withOrderMutationLock(projectRoot, id, "order.set_current_result", async () => {
    const materialized = await readMaterializedResultVersion(projectRoot, id, version, { materializeLegacy: true });
    const order = await readJson(file);
    order.currentVersion = version;
    if (order.orderAsset) {
      order.orderAsset.currentVersion = version;
      const index = order.orderAsset.versions?.findIndex((item: OrderResultVersion) => item.versionId === version) ?? -1;
      if (index >= 0) order.orderAsset.versions[index] = materialized;
      else if (Array.isArray(order.orderAsset.versions)) order.orderAsset.versions.push(materialized);
    }
    order.updatedAt = stamp();
    await writeJson(file, order, true);
    return order;
  });
}

export async function listOrderRecoveries(projectRoot: string, orderId: string) {
  return listOrderRecoveryTransactions(projectRoot, validateOrderId(orderId));
}

export async function recoverOrderRecovery(projectRoot: string, orderId: string, transactionId: string) {
  const id = validateOrderId(orderId);
  return recoverOrderTransaction(projectRoot, id, transactionId, {
    before: (manifest, paths) => validateRecoverySemanticSnapshot(projectRoot, id, manifest, paths),
    after: (manifest, paths) => validateRecoverySemanticSnapshot(projectRoot, id, manifest, paths),
  });
}

export async function abortOrderRecovery(projectRoot: string, orderId: string, transactionId: string) {
  const id = validateOrderId(orderId);
  return abortOrderTransaction(projectRoot, id, transactionId, async () => {
    const order = await readJson(orderJsonPath(projectRoot, id)).catch(() => {
      throw new Error("Cannot abort recovery: current order.json is missing or invalid. Run recovery recover instead.");
    }) as AssetOrder;
    const topCurrent = order.currentVersion;
    const assetCurrent = order.orderAsset?.currentVersion;
    if (assetCurrent && assetCurrent !== topCurrent) {
      throw new Error("Cannot abort recovery: order currentVersion pointers disagree. Run recovery recover instead.");
    }
    if (order.status === "delivered" || topCurrent) {
      if (!topCurrent) throw new Error("Cannot abort recovery: delivered order has no currentVersion. Run recovery recover instead.");
      await readMaterializedResultVersion(projectRoot, id, validateVersionId(topCurrent));
    }
    for (const embedded of order.orderAsset?.versions ?? []) {
      const stored = await readMaterializedResultVersion(projectRoot, id, validateVersionId(embedded.versionId));
      if (JSON.stringify(stored) !== JSON.stringify(embedded)) {
        throw new Error(`Cannot abort recovery: embedded and stored metadata disagree for ${embedded.versionId}. Run recovery recover instead.`);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Visual anchor (foundation sheet) + reference resolution
// ---------------------------------------------------------------------------

/**
 * Find the project's foundation sheet order — the visual anchor for all
 * downstream assets. Returns the first delivered order whose assetType is a
 * known foundation type and that has at least one result version.
 */
export async function findFoundationSheet(projectRoot: string): Promise<{
  orderId: string;
  versionId: string;
  assetType: string;
  files: string[];
} | null> {
  const { orders } = await listOrders(projectRoot);
  for (const summary of orders) {
    if (summary.unreadable || !summary.assetType || !isFoundationAssetType(summary.assetType)) continue;
    if (!summary.currentVersion) continue;
    const orderId = validateOrderId(summary.orderId);
    const dir = orderVersionDir(projectRoot, orderId, summary.currentVersion);
    if (!(await exists(dir))) continue;
    const files = (await fs.readdir(dir).catch(() => [])).filter((f) => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()));
    if (files.length > 0) {
      return { orderId, versionId: summary.currentVersion, assetType: summary.assetType, files };
    }
  }
  return null;
}

/**
 * Resolve a list of OrderReferences into absolute image file paths.
 * Used by the Painter to inject reference images into generation.
 *
 * For each reference:
 *  1. Read the referenced order
 *  2. Determine versionId (explicit or currentVersion)
 *  3. List image files in that version directory
 *  4. Return absolute paths
 */
export async function resolveOrderReferences(
  projectRoot: string,
  references: OrderReference[],
  /** The owning order's id — needed to resolve materialized references/ paths. */
  ownerOrderId?: string,
): Promise<
  Array<{
    role: string;
    /** Present for order references; absent for file references. */
    orderId?: string;
    /** Present for order references; absent for file references. */
    versionId?: string;
    /** Resolved absolute image file path(s). */
    files: string[];
  }>
> {
  const resolved: Array<{ role: string; orderId?: string; versionId?: string; files: string[] }> = [];
  for (const ref of normalizeReferences(references)) {
    // file variant
    if (ref.type === "file") {
      // Materialized refs are relative to the owning order's dir (e.g. "references/foo.webp").
      // Absolute paths or other relative paths resolve against projectRoot.
      let abs: string;
      if (!path.isAbsolute(ref.path) && ref.path.startsWith("references/") && ownerOrderId) {
        abs = path.resolve(orderDir(projectRoot, ownerOrderId), ref.path);
      } else {
        abs = path.isAbsolute(ref.path) ? ref.path : path.resolve(projectRoot, ref.path);
      }
      if (!(await exists(abs))) throw new Error(`Reference file '${ref.path}' does not exist (resolved: ${abs}).`);
      if (!IMAGE_EXTENSIONS.includes(path.extname(abs).toLowerCase())) {
        throw new Error(`Reference file '${ref.path}' is not a recognized image (got extension '${path.extname(abs)}').`);
      }
      resolved.push({ role: ref.role, files: [abs] });
      continue;
    }

    // order variant
    const order = await readOrder(projectRoot, ref.orderId).catch(() => null);
    if (!order) throw new Error(`Reference orderId '${ref.orderId}' does not exist.`);
    const versionId = ref.versionId ?? order.currentVersion;
    if (!versionId) throw new Error(`Reference order '${ref.orderId}' has no currentVersion and no versionId was specified.`);
    const dir = orderVersionDir(projectRoot, ref.orderId, versionId);
    if (!(await exists(dir))) throw new Error(`Reference order '${ref.orderId}' has no result version '${versionId}'.`);
    const files = (await fs.readdir(dir).catch(() => []))
      .filter((f) => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .map((f) => path.resolve(dir, f));
    if (files.length === 0) throw new Error(`Reference order '${ref.orderId}' version '${versionId}' has no image files.`);
    resolved.push({ role: ref.role, orderId: ref.orderId, versionId, files });
  }
  // Sort by role priority: composition first (pose/layout anchor), then
  // character (identity), then style. This ensures the --reference flag order
  // passed to `image gen` matches what migration templates expect (FIRST =
  // composition, SECOND = character), regardless of the order references were
  // listed in order.json.
  const ROLE_PRIORITY: Record<string, number> = { composition: 0, character: 1, style: 2 };
  resolved.sort((a, b) => (ROLE_PRIORITY[a.role] ?? 99) - (ROLE_PRIORITY[b.role] ?? 99));
  return resolved;
}

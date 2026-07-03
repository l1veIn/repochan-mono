import { promises as fs } from "node:fs";
import path from "node:path";
import type { AssetOrder, JsonObject, OrderReference, OrderResultVersion, OrderStatus, VersionRole } from "../types.js";
import {
  exists,
  initProtocol,
  orderJsonPath,
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
  OrderPromoteCandidateParamsSchema,
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
import { readOrder, ensureOrderApprovedForExecution, IMAGE_EXTENSIONS } from "./shared.js";

export async function createOrders(projectRoot: string, params: JsonObject) {
  validateInput("order.create", OrderCreateParamsSchema, params);
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);
  await requirePersona(projectRoot);
  const inputOrders = Array.isArray(params.orders) ? params.orders : params.order ? [params.order] : undefined;
  if (!inputOrders?.length) throw new Error("order.create requires params.order or params.orders.");
  const orders = inputOrders.map((order) => normalizeOrder(order as AssetOrder));
  for (const order of orders) validateOrderId(order.orderId);
  const overwrite = params.overwrite === true;
  for (const order of orders) {
    const file = orderJsonPath(projectRoot, order.orderId);
    if ((await exists(file)) && !overwrite) throw new Error(`Order ${order.orderId} already exists. Ask before overwrite=true.`);
  }
  const written: string[] = [];
  for (const order of orders) {
    const file = orderJsonPath(projectRoot, order.orderId);
    await fs.mkdir(orderVersionsDir(projectRoot, order.orderId), { recursive: true });
    await writeJson(file, order, overwrite);
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
  const current = await readJson(file);
  if (params.overwrite !== true) {
    throw new Error("order.update requires params.overwrite=true after explicit user approval. Use order.set_status or order.add_revision for narrow updates.");
  }
  const patch = isPlainObject(params.patch) ? params.patch : isPlainObject(params.order) ? params.order : undefined;
  if (!patch) throw new Error("order.update requires params.patch or params.order.");
  const next = {
    ...deepMerge(current, patch),
    orderId,
    schemaVersion: "repochan.asset-order.v1",
    createdAt: current.createdAt ?? stamp(),
    updatedAt: stamp(),
  };
  await writeJson(file, next, true);
  return next;
}

export async function setOrderStatus(projectRoot: string, orderId: string, status: OrderStatus) {
  validateInput("order.set_status", OrderSetStatusParamsSchema, { orderId, status });
  await initProtocol(projectRoot);
  validateOrderId(orderId);
  requireValidStatus(status);
  const file = orderJsonPath(projectRoot, orderId);
  const order = await readJson(file);
  // Enforce state-machine transition: prevent illegal jumps like delivered→draft
  const currentStatus = order.status as OrderStatus | undefined;
  if (currentStatus && !isValidStatusTransition(currentStatus, status)) {
    throw new Error(
      `order.set_status: illegal transition ${currentStatus}→${status} for order ${orderId}. ` +
        `Valid targets from ${currentStatus}: ${validNextStatuses(currentStatus).join(", ")}.`,
    );
  }
  order.status = status;
  order.updatedAt = stamp();
  await writeJson(file, order, true);
  return order;
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
  const order = await readJson(file);
  order.revisions ??= [];
  order.revisions.push({ requestedAt: stamp(), request: revisionRequest, status: "draft" });
  order.status = "needs_revision";
  order.updatedAt = stamp();
  await writeJson(file, order, true);
  return order;
}

function versionFilesFromDir(entries: string[]) {
  return entries.filter((entry) => entry !== "meta.json").sort();
}

async function resolveResultFiles(projectRoot: string, orderId: string, versionId: string, files: string[], overwrite: boolean) {
  const destDir = orderVersionDir(projectRoot, orderId, versionId);
  const recorded: string[] = [];
  for (const raw of files) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const basename = path.basename(raw);
    const dest = path.join(destDir, basename);
    const candidates = [
      path.isAbsolute(raw) ? raw : path.resolve(projectRoot, raw),
      raw.startsWith(".repochan/") || raw.startsWith(".repochan" + path.sep) ? path.resolve(projectRoot, raw) : path.join(destDir, raw),
    ];
    let source: string | undefined;
    for (const candidate of candidates) {
      if (path.resolve(candidate) === path.resolve(dest)) continue;
      if (await exists(candidate)) {
        source = candidate;
        break;
      }
    }
    if (source) {
      if ((await exists(dest)) && !overwrite) throw new Error(`Result file ${basename} already exists in ${orderId}/${versionId}. Ask before overwrite=true.`);
      await fs.copyFile(source, dest);
      recorded.push(basename);
    } else if (await exists(dest)) {
      recorded.push(basename);
    } else {
      recorded.push(raw);
    }
  }
  return [...new Set(recorded)];
}

export async function createOrderResult(projectRoot: string, params: JsonObject) {
  validateInput("order.create_result", OrderCreateResultParamsSchema, params);
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);
  await requirePersona(projectRoot);
  const orderId = validateOrderId(String(params.orderId ?? ""));
  const order = await ensureOrderApprovedForExecution(projectRoot, orderId, params.allowUnapprovedOrder === true);
  const versionId = validateVersionId(typeof params.versionId === "string" && params.versionId ? params.versionId : `v${stampForPath()}`);
  const versionDir = orderVersionDir(projectRoot, orderId, versionId);
  const overwrite = params.overwrite === true;
  if ((await exists(versionDir)) && !overwrite) throw new Error(`Order result ${orderId}/${versionId} already exists. Ask before overwrite=true.`);
  await fs.mkdir(versionDir, { recursive: true });
  const inputFiles = Array.isArray(params.files) ? params.files.filter((file): file is string => typeof file === "string") : [];
  const files = await resolveResultFiles(projectRoot, orderId, versionId, inputFiles, overwrite);
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

  const version: OrderResultVersion = {
    versionId,
    createdAt: stamp(),
    tool: resolvedTool,
    files,
    promptBrief: typeof params.promptBrief === "string" ? params.promptBrief : undefined,
    generationPrompt: resolvedGenerationPrompt,
    revisedPrompt: typeof params.revisedPrompt === "string" ? params.revisedPrompt : undefined,
    notes: typeof params.notes === "string" ? params.notes : undefined,
    provenance: params.provenance ?? { tool: "repochan", action: "order.create_result" },
    meta: isPlainObject(params.meta) ? params.meta : undefined,
  };
  await writeJson(path.join(versionDir, "meta.json"), version, overwrite);

  // Embed previous Asset info directly into order.json as orderAsset
  const next = { ...order };
  next.currentVersion = params.setCurrent === false ? order.currentVersion : versionId;
  next.orderAsset = next.orderAsset || { versions: [], meta: {} };
  // remove previous same version if overwrite
  next.orderAsset.versions = (next.orderAsset.versions || []).filter((v: any) => v.versionId !== versionId);
  next.orderAsset.versions.push(version);
  next.orderAsset.currentVersion = next.currentVersion;
  if (params.markDelivered !== false && ["approved", "in_progress"].includes(String(next.status ?? ""))) next.status = "delivered";
  next.updatedAt = stamp();

  await writeJson(orderJsonPath(projectRoot, orderId), next, true);
  return { order: next, version, checkedOrder: order };
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
  const result = await createOrderResult(projectRoot, {
    ...params,
    setCurrent: false,             // do NOT point currentVersion at this candidate
    markDelivered: false,          // do NOT change order status — candidates aren't deliveries
    allowUnapprovedOrder: true,    // candidates can be added to delivered orders
  });

  // Override the role on the written version meta + the embedded orderAsset entry.
  const { order, version } = result;
  version.role = "candidate" as VersionRole;

  // Rewrite meta.json with role=candidate
  const versionDir = orderVersionDir(projectRoot, order.orderId, version.versionId);
  await writeJson(path.join(versionDir, "meta.json"), version, true);

  // Update the embedded orderAsset.versions entry + persist order.json
  if (order.orderAsset && Array.isArray(order.orderAsset.versions)) {
    const idx = order.orderAsset.versions.findIndex((v: any) => v.versionId === version.versionId);
    if (idx >= 0) order.orderAsset.versions[idx].role = "candidate";
  }
  await writeJson(orderJsonPath(projectRoot, order.orderId), order, true);

  return { order, version, checkedOrder: result.checkedOrder };
}

/**
 * Promote a candidate version to current. The previous current version (if any)
 * is demoted to snapshot. At most one version is "current" at any time.
 */
export async function promoteCandidate(projectRoot: string, orderId: string, versionId: string) {
  validateInput("order.promote_candidate", OrderPromoteCandidateParamsSchema, { orderId, versionId });
  await initProtocol(projectRoot);
  const id = validateOrderId(orderId);
  const vid = validateVersionId(versionId);

  const file = orderJsonPath(projectRoot, id);
  if (!(await exists(file))) throw new Error(`Order ${id} does not exist.`);
  const order: AssetOrder = await readJson(file);

  if (!order.orderAsset || !Array.isArray(order.orderAsset.versions)) {
    throw new Error(`Order ${id} has no result versions. Create a candidate first.`);
  }

  const versions = order.orderAsset.versions as OrderResultVersion[];
  const target = versions.find((v) => v.versionId === vid);
  if (!target) {
    throw new Error(`Order ${id} has no version '${vid}'. Cannot promote.`);
  }
  if (target.role === "current") {
    throw new Error(`Version ${vid} is already the current version of order ${id}.`);
  }
  if (target.role === "snapshot") {
    throw new Error(`Version ${vid} is a snapshot (retired). Only candidate versions can be promoted.`);
  }

  // Demote the previous current (if any) to snapshot.
  let previousCurrent: OrderResultVersion | undefined;
  const prevCurrentId = order.currentVersion;
  if (prevCurrentId) {
    const prev = versions.find((v) => v.versionId === prevCurrentId);
    if (prev && prev.versionId !== vid) {
      prev.role = "snapshot" as VersionRole;
      previousCurrent = { ...prev };
      // Rewrite its meta.json too, for on-disk consistency.
      const prevDir = orderVersionDir(projectRoot, id, prev.versionId);
      if (await exists(path.join(prevDir, "meta.json"))) {
        await writeJson(path.join(prevDir, "meta.json"), prev, true);
      }
    }
  }

  // Promote the target.
  target.role = "current" as VersionRole;
  order.currentVersion = vid;
  order.orderAsset.currentVersion = vid;
  order.updatedAt = stamp();

  // Rewrite the promoted version's meta.json.
  const targetDir = orderVersionDir(projectRoot, id, vid);
  await writeJson(path.join(targetDir, "meta.json"), target, true);

  await writeJson(file, order, true);
  return { order, promotedVersion: target, previousCurrent };
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

export async function setCurrentOrderResult(projectRoot: string, orderId: string, versionId: string) {
  validateInput("order.set_current_result", OrderSetCurrentResultParamsSchema, { orderId, versionId });
  await initProtocol(projectRoot);
  const id = validateOrderId(orderId);
  const version = validateVersionId(versionId);
  const dir = orderVersionDir(projectRoot, id, version);
  if (!(await exists(dir))) throw new Error(`Order ${id} has no result version ${version}.`);
  const file = orderJsonPath(projectRoot, id);
  const order = await readJson(file);
  order.currentVersion = version;
  if (order.orderAsset) {
    order.orderAsset.currentVersion = version;
  }
  order.updatedAt = stamp();
  await writeJson(file, order, true);
  return order;
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
): Promise<
  Array<{
    role: string;
    orderId: string;
    versionId: string;
    files: string[];
  }>
> {
  const resolved: Array<{ role: string; orderId: string; versionId: string; files: string[] }> = [];
  for (const ref of normalizeReferences(references)) {
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
  return resolved;
}

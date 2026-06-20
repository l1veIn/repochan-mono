import { promises as fs } from "node:fs";
import path from "node:path";
import type { AssetOrder, JsonObject, OrderResultVersion, OrderStatus } from "./types.js";
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
} from "./protocol/index.js";
import {
  deepMerge,
  isPlainObject,
  normalizeOrder,
  requireValidStatus,
  validateBatchId,
  validateOrderId,
  validateVersionId,
} from "./utils/index.js";

export async function archiveOrder(projectRoot: string, orderId: string, order: unknown) {
  const archive = path.join(orderVersionsDir(projectRoot, validateOrderId(orderId)), `${stampForPath()}-order.json`);
  await writeJson(archive, order, false);
  return archive;
}

export async function readOrder(projectRoot: string, orderId: string) {
  return readJson(orderJsonPath(projectRoot, validateOrderId(orderId)));
}

export async function ensureOrderApprovedForExecution(projectRoot: string, orderId: string, allowUnapproved: boolean) {
  const id = validateOrderId(orderId);
  const order = await readOrder(projectRoot, id);
  if (!allowUnapproved && !["approved", "in_progress"].includes(String(order.status ?? ""))) {
    throw new Error(
      `Order ${id} is not approved/in_progress (status=${order.status ?? "missing"}). ` +
        "Call repochan action='order.get' or 'order.list' for the pre-check, then obtain user approval or pass allowUnapprovedOrder=true only after explicit approval.",
    );
  }
  return order;
}

export async function createOrUpdatePersona(projectRoot: string, params: JsonObject, mode: "create" | "update") {
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);
  if (!isPlainObject(params.persona)) throw new Error("params.persona is required and must be an object.");
  const current = path.join(protocolRoot(projectRoot), "persona", "current.json");
  const currentExists = await exists(current);
  const overwrite = params.overwrite === true;
  const versionPrevious = params.versionPrevious !== false;
  if (mode === "create" && currentExists && !overwrite) {
    throw new Error(".repochan/persona/current.json already exists. Use persona.get, or ask the user before persona.create with overwrite=true.");
  }
  if (mode === "update") {
    if (!currentExists) throw new Error("Missing .repochan/persona/current.json. Use persona.create first.");
    if (!overwrite) throw new Error("persona.update replaces current persona and requires params.overwrite=true after explicit user approval.");
  }
  const ts = stampForPath();
  if (currentExists && overwrite && versionPrevious) {
    await writeJson(path.join(protocolRoot(projectRoot), "persona", "versions", `${ts}-previous.json`), await readJson(current), false);
  }
  const provenance = params.persona.provenance ?? params.provenance ?? { tool: "repochan", action: `persona.${mode}` };
  const data = { ...params.persona, schemaVersion: "repochan.persona.v1", generatedAt: stamp(), provenance };
  const slug = typeof params.slug === "string" ? params.slug : "persona";
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("slug must match ^[a-z0-9-]+$.");
  const versionName = `${ts}-${slug}.json`;
  await writeJson(path.join(protocolRoot(projectRoot), "persona", "versions", versionName), data, false);
  await writeJson(current, data, currentExists || overwrite);
  return { versionName, data };
}

export async function createOrders(projectRoot: string, params: JsonObject) {
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);
  await requirePersona(projectRoot);
  const inputOrders = Array.isArray(params.orders) ? params.orders : params.order ? [params.order] : undefined;
  if (!inputOrders?.length) throw new Error("order.create requires params.order or params.orders.");
  if (params.batchId) validateBatchId(String(params.batchId));
  const orders = inputOrders.map((order) => normalizeOrder(order as AssetOrder, params.batchId));
  for (const order of orders) validateOrderId(order.orderId);
  const overwrite = params.overwrite === true;
  for (const order of orders) {
    const file = orderJsonPath(projectRoot, order.orderId);
    if ((await exists(file)) && !overwrite) throw new Error(`Order ${order.orderId} already exists. Ask before overwrite=true.`);
  }
  if (params.batchId) {
    const batchFile = path.join(protocolRoot(projectRoot), "orders", "batches", `${params.batchId}.json`);
    if ((await exists(batchFile)) && !overwrite) throw new Error(`Order batch ${params.batchId} already exists. Ask before overwrite=true.`);
  }
  const written: string[] = [];
  for (const order of orders) {
    const file = orderJsonPath(projectRoot, order.orderId);
    await fs.mkdir(orderVersionsDir(projectRoot, order.orderId), { recursive: true });
    await writeJson(file, order, overwrite);
    written.push(relativeProtocolPath(projectRoot, file));
  }
  if (params.batchId) {
    await writeJson(
      path.join(protocolRoot(projectRoot), "orders", "batches", `${params.batchId}.json`),
      { schemaVersion: "repochan.order-batch.v1", batchId: params.batchId, orderIds: orders.map((o) => o.orderId), createdAt: stamp() },
      overwrite,
    );
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
  const orderDirs = entries.filter((entry) => entry.isDirectory() && entry.name !== "batches").map((entry) => entry.name).sort();
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
  await initProtocol(projectRoot);
  const orderId = validateOrderId(String(params.orderId ?? ""));
  const file = orderJsonPath(projectRoot, orderId);
  const current = await readJson(file);
  if (params.overwrite !== true) {
    throw new Error("order.update requires params.overwrite=true after explicit user approval. Use order.set_status or order.add_revision for narrow updates.");
  }
  await archiveOrder(projectRoot, orderId, current);
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
  await initProtocol(projectRoot);
  validateOrderId(orderId);
  requireValidStatus(status);
  const file = orderJsonPath(projectRoot, orderId);
  const order = await readJson(file);
  await archiveOrder(projectRoot, orderId, order);
  order.status = status;
  order.updatedAt = stamp();
  await writeJson(file, order, true);
  return order;
}

export async function addOrderRevision(projectRoot: string, orderId: string, revisionRequest: string) {
  await initProtocol(projectRoot);
  validateOrderId(orderId);
  const file = orderJsonPath(projectRoot, orderId);
  const order = await readJson(file);
  await archiveOrder(projectRoot, orderId, order);
  order.revisions ??= [];
  order.revisions.push({ requestedAt: stamp(), request: revisionRequest, status: "draft" });
  order.status = "needs_revision";
  order.updatedAt = stamp();
  await writeJson(file, order, true);
  return order;
}

function versionFilesFromDir(entries: string[]) {
  return entries.filter((entry) => entry !== "meta.json" && !entry.endsWith("-order.json")).sort();
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
  const version: OrderResultVersion = {
    versionId,
    createdAt: stamp(),
    tool: typeof params.tool === "string" ? params.tool : "repochan",
    files,
    promptBrief: typeof params.promptBrief === "string" ? params.promptBrief : undefined,
    notes: typeof params.notes === "string" ? params.notes : undefined,
    provenance: params.provenance ?? { tool: "repochan", action: "order.create_result" },
    meta: isPlainObject(params.meta) ? params.meta : undefined,
  };
  await writeJson(path.join(versionDir, "meta.json"), version, overwrite);
  await archiveOrder(projectRoot, orderId, order);

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
      notes: meta?.notes,
      provenance: meta?.provenance,
      meta: meta?.meta,
    } as OrderResultVersion,
  };
}

export async function setCurrentOrderResult(projectRoot: string, orderId: string, versionId: string) {
  await initProtocol(projectRoot);
  const id = validateOrderId(orderId);
  const version = validateVersionId(versionId);
  const dir = orderVersionDir(projectRoot, id, version);
  if (!(await exists(dir))) throw new Error(`Order ${id} has no result version ${version}.`);
  const file = orderJsonPath(projectRoot, id);
  const order = await readJson(file);
  await archiveOrder(projectRoot, id, order);
  order.currentVersion = version;
  if (order.orderAsset) {
    order.orderAsset.currentVersion = version;
  }
  order.updatedAt = stamp();
  await writeJson(file, order, true);
  return order;
}

/** @deprecated Order deliverables no longer use asset manifests. */
export function assetManifestPath(_projectRoot: string, _assetId: string) {
  throw new Error("assetManifestPath is deprecated. Use orderJsonPath/orderVersionDir or order result helpers.");
}

/** @deprecated Order deliverables no longer use asset manifests. */
export async function listAssets(_projectRoot: string) {
  return { assets: [] as JsonObject[] };
}

/** @deprecated Use createOrderResult. */
export async function createAssetVersion(): Promise<never> {
  throw new Error("asset.create_version is removed. Use order.create_result.");
}

/** @deprecated Use setCurrentOrderResult. */
export async function setCurrentAsset(): Promise<never> {
  throw new Error("asset.set_current is removed. Use order.set_current_result.");
}

/** @deprecated Asset manifests are removed. */
export async function updateAssetMeta(): Promise<never> {
  throw new Error("asset.update_meta is removed. Use order.update for order metadata or order.create_result for deliverables.");
}

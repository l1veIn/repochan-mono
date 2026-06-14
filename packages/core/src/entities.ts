import { promises as fs } from "node:fs";
import path from "node:path";
import type { AssetManifest, AssetOrder, JsonObject, OrderStatus, VersionEntry } from "./types.js";
import {
  exists,
  initProtocol,
  listJsonFiles,
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
  areOrdersApprovedForAsset,
  deepMerge,
  isPlainObject,
  normalizeOrder,
  orderIdsFromParams,
  requireValidStatus,
  validateAssetId,
  validateBatchId,
  validateOrderId,
  validateVersionId,
} from "./utils/index.js";

export function assetManifestPath(projectRoot: string, assetId: string) {
  return path.join(protocolRoot(projectRoot), "assets", validateAssetId(assetId), "manifest.json");
}

export async function archiveOrder(projectRoot: string, orderId: string, order: unknown) {
  const archive = path.join(protocolRoot(projectRoot), "orders", "versions", validateOrderId(orderId), `${stampForPath()}.json`);
  await writeJson(archive, order, false);
  return archive;
}

export async function archiveAssetManifest(projectRoot: string, assetId: string, manifest: unknown) {
  const archive = path.join(protocolRoot(projectRoot), "assets", validateAssetId(assetId), "manifest.versions", `${stampForPath()}.json`);
  await writeJson(archive, manifest, false);
  return archive;
}

export async function readOrder(projectRoot: string, orderId: string) {
  return readJson(path.join(protocolRoot(projectRoot), "orders", `${validateOrderId(orderId)}.json`));
}

export async function ensureOrdersApprovedForAsset(projectRoot: string, orderIds: string[], allowUnapproved: boolean) {
  const orders: JsonObject[] = [];
  for (const rawOrderId of orderIds) {
    const orderId = validateOrderId(rawOrderId);
    const order = await readOrder(projectRoot, orderId);
    orders.push(order);
    if (!allowUnapproved && !["approved", "in_progress"].includes(String(order.status ?? ""))) {
      throw new Error(
        `Order ${orderId} is not approved/in_progress (status=${order.status ?? "missing"}). ` +
          "Call repochan action='order.get' or 'order.list' for the pre-check, then obtain user approval or pass allowUnapprovedOrder=true only after explicit approval.",
      );
    }
  }
  return orders;
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
    const file = path.join(protocolRoot(projectRoot), "orders", `${order.orderId}.json`);
    if ((await exists(file)) && !overwrite) throw new Error(`Order ${order.orderId} already exists. Ask before overwrite=true.`);
  }
  if (params.batchId) {
    const batchFile = path.join(protocolRoot(projectRoot), "orders", "batches", `${params.batchId}.json`);
    if ((await exists(batchFile)) && !overwrite) throw new Error(`Order batch ${params.batchId} already exists. Ask before overwrite=true.`);
  }
  const written: string[] = [];
  for (const order of orders) {
    const file = path.join(protocolRoot(projectRoot), "orders", `${order.orderId}.json`);
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
  const files = await listJsonFiles(path.join(protocolRoot(projectRoot), "orders"));
  const orders = [];
  for (const file of files) {
    try {
      const order = await readJson(path.join(protocolRoot(projectRoot), "orders", file));
      orders.push({ orderId: order.orderId, status: order.status, assetType: order.assetType, priority: order.priority, file });
    } catch {
      orders.push({ file, unreadable: true });
    }
  }
  return { files, orders };
}

export async function updateOrder(projectRoot: string, params: JsonObject) {
  await initProtocol(projectRoot);
  const orderId = validateOrderId(String(params.orderId ?? ""));
  const file = path.join(protocolRoot(projectRoot), "orders", `${orderId}.json`);
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
  const file = path.join(protocolRoot(projectRoot), "orders", `${orderId}.json`);
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
  const file = path.join(protocolRoot(projectRoot), "orders", `${orderId}.json`);
  const order = await readJson(file);
  await archiveOrder(projectRoot, orderId, order);
  order.revisions ??= [];
  order.revisions.push({ requestedAt: stamp(), request: revisionRequest, status: "draft" });
  order.status = "needs_revision";
  order.updatedAt = stamp();
  await writeJson(file, order, true);
  return order;
}

export async function listAssets(projectRoot: string) {
  const assetsDir = path.join(protocolRoot(projectRoot), "assets");
  let names: string[] = [];
  try {
    names = (await fs.readdir(assetsDir)).sort();
  } catch {
    // no assets yet
  }
  const assets = [];
  for (const name of names) {
    const manifest = await readJsonIfExists(path.join(assetsDir, name, "manifest.json"));
    if (manifest) assets.push({ assetId: manifest.assetId ?? name, currentVersion: manifest.currentVersion, versionCount: manifest.versions?.length ?? 0 });
  }
  return { assets };
}

export async function createAssetVersion(projectRoot: string, params: JsonObject) {
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);
  await requirePersona(projectRoot);
  const assetId = validateAssetId(String(params.assetId ?? ""));
  const orderIds = orderIdsFromParams(params);
  const orders = await ensureOrdersApprovedForAsset(projectRoot, orderIds, params.allowUnapprovedOrder === true);
  if (!areOrdersApprovedForAsset(orders, params.allowUnapprovedOrder === true)) {
    throw new Error("At least one order is not approved for asset creation.");
  }
  const versionId = validateVersionId(typeof params.versionId === "string" && params.versionId ? params.versionId : `v${stampForPath()}`);
  const dir = path.join(protocolRoot(projectRoot), "assets", assetId);
  const versionDir = path.join(dir, "versions", versionId);
  const overwrite = params.overwrite === true;
  if ((await exists(versionDir)) && !overwrite) throw new Error(`Asset version ${assetId}/${versionId} already exists. Ask before overwrite=true.`);
  await fs.mkdir(versionDir, { recursive: true });
  const manifestFile = assetManifestPath(projectRoot, assetId);
  const manifest =
    ((await readJsonIfExists(manifestFile)) as AssetManifest | undefined) ??
    ({ schemaVersion: "repochan.asset-manifest.v1", assetId, currentVersion: undefined, orderIds: [], versions: [], meta: {} } as AssetManifest);
  if (manifest.versions?.some((version: JsonObject) => version.versionId === versionId) && !overwrite) {
    throw new Error(`Manifest already contains version ${versionId}. Ask before overwrite=true.`);
  }
  const files = Array.isArray(params.files) ? params.files.filter((file): file is string => typeof file === "string") : [];
  const versionEntry: VersionEntry = {
    versionId,
    createdAt: stamp(),
    tool: typeof params.tool === "string" ? params.tool : "repochan",
    files,
    promptBrief: typeof params.promptBrief === "string" ? params.promptBrief : "",
    notes: typeof params.notes === "string" ? params.notes : "",
    provenance: params.provenance ?? { tool: "repochan", action: "asset.create_version" },
    meta: isPlainObject(params.meta) ? params.meta : undefined,
  };
  await writeJson(path.join(versionDir, "meta.json"), versionEntry, overwrite);
  manifest.orderIds = [...new Set([...(Array.isArray(manifest.orderIds) ? manifest.orderIds : []), ...orderIds])];
  manifest.versions = (Array.isArray(manifest.versions) ? manifest.versions : []).filter((version: JsonObject) => version.versionId !== versionId);
  manifest.versions.push(versionEntry);
  if (params.setCurrent !== false) manifest.currentVersion = versionId;
  manifest.updatedAt = stamp();
  await writeJson(manifestFile, manifest, true);
  return { manifest, version: versionEntry, checkedOrders: orders };
}

export async function setCurrentAsset(projectRoot: string, assetId: string, versionId: string) {
  await initProtocol(projectRoot);
  validateAssetId(assetId);
  validateVersionId(versionId);
  const manifestFile = assetManifestPath(projectRoot, assetId);
  const manifest = await readJson(manifestFile);
  if (!manifest.versions?.some((version: JsonObject) => version.versionId === versionId)) {
    throw new Error(`Asset ${assetId} has no version ${versionId}.`);
  }
  await archiveAssetManifest(projectRoot, assetId, manifest);
  manifest.currentVersion = versionId;
  manifest.updatedAt = stamp();
  await writeJson(manifestFile, manifest, true);
  return manifest;
}

export async function updateAssetMeta(projectRoot: string, params: JsonObject) {
  await initProtocol(projectRoot);
  const assetId = validateAssetId(String(params.assetId ?? ""));
  if (params.overwrite !== true) {
    throw new Error("asset.update_meta mutates the asset manifest and requires params.overwrite=true after explicit user approval.");
  }
  const manifestFile = assetManifestPath(projectRoot, assetId);
  const manifest = await readJson(manifestFile);
  await archiveAssetManifest(projectRoot, assetId, manifest);
  const patch = isPlainObject(params.patch) ? params.patch : { meta: isPlainObject(params.meta) ? params.meta : {} };
  const next = { ...deepMerge(manifest, patch), assetId, schemaVersion: "repochan.asset-manifest.v1", updatedAt: stamp() };
  await writeJson(manifestFile, next, true);
  return next;
}

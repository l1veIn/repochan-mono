import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  deepMerge,
  exists,
  initProtocol,
  inspectProtocol,
  isPlainObject,
  normalizeOrder,
  protocolVersionPath,
  readJson,
  relativeProtocolPath,
  root,
  safeProtocolPath,
  stamp,
  stampForPath,
  validateAssetId,
  validateOrderId,
  validateVersionId,
  writeJson,
  performAnalysis,
  type AnalyzeInput,
  type AssetOrder,
  type OrderStatus,
} from "@repochan/core";

const ActionSchema = Type.Union([
  Type.Literal("analysis.run"),
  Type.Literal("analysis.get"),
  Type.Literal("analysis.list_versions"),
  Type.Literal("persona.get"),
  Type.Literal("persona.create"),
  Type.Literal("persona.update"),
  Type.Literal("order.list"),
  Type.Literal("order.get"),
  Type.Literal("order.create"),
  Type.Literal("order.update"),
  Type.Literal("order.set_status"),
  Type.Literal("order.add_revision"),
  Type.Literal("asset.list"),
  Type.Literal("asset.get"),
  Type.Literal("asset.create_version"),
  Type.Literal("asset.set_current"),
  Type.Literal("asset.update_meta"),
  Type.Literal("protocol.inspect"),
  Type.Literal("protocol.read"),
  Type.Literal("protocol.write"),
  Type.Literal("protocol.append_version"),
]);

const RepoChanSchema = Type.Object({
  action: ActionSchema,
  params: Type.Record(Type.String(), Type.Any(), {
    description:
      "Action-specific parameters. See the repochan tool promptGuidelines for the exact expected shape, behavior, and preconditions for each action.",
  }),
});

type RepoChanInput = Static<typeof RepoChanSchema>;
type JsonObject = Record<string, any>;

function ok(text: string, details?: unknown) {
  return { content: [{ type: "text" as const, text }], details };
}

function requireString(params: JsonObject, key: string) {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalBoolean(params: JsonObject, key: string, defaultValue = false) {
  const value = params[key];
  return typeof value === "boolean" ? value : defaultValue;
}

async function readJsonIfExists(file: string) {
  return (await exists(file)) ? readJson(file) : undefined;
}

async function requireAnalysis(ctx: ExtensionContext) {
  const file = path.join(root(ctx.cwd), "analysis.json");
  if (!(await exists(file))) throw new Error("Missing .repochan/analysis.json. Run repochan action='analysis.run' first.");
}

async function requirePersona(ctx: ExtensionContext) {
  const file = path.join(root(ctx.cwd), "persona", "current.json");
  if (!(await exists(file))) throw new Error("Missing .repochan/persona/current.json. Run repochan action='persona.create' first.");
}

async function listJsonFiles(dir: string) {
  try {
    return (await fs.readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

async function archiveOrder(ctx: ExtensionContext, orderId: string, order: unknown) {
  const archive = path.join(root(ctx.cwd), "orders", "versions", orderId, `${stampForPath()}.json`);
  await writeJson(archive, order, false);
  return archive;
}

async function archiveAssetManifest(ctx: ExtensionContext, assetId: string, manifest: unknown) {
  const archive = path.join(root(ctx.cwd), "assets", assetId, "manifest.versions", `${stampForPath()}.json`);
  await writeJson(archive, manifest, false);
  return archive;
}

function assetIdFromParams(params: JsonObject) {
  return validateAssetId(requireString(params, "assetId"));
}

function assetManifestPath(ctx: ExtensionContext, assetId: string) {
  return path.join(root(ctx.cwd), "assets", assetId, "manifest.json");
}

function requireOrderId(params: JsonObject) {
  return validateOrderId(requireString(params, "orderId"));
}

function requireVersionId(value: string) {
  return validateVersionId(value);
}

async function readOrder(ctx: ExtensionContext, orderId: string) {
  return readJson(path.join(root(ctx.cwd), "orders", `${validateOrderId(orderId)}.json`));
}

async function ensureOrdersApprovedForAsset(ctx: ExtensionContext, orderIds: string[], allowUnapproved: boolean) {
  const orders = [];
  for (const orderId of orderIds) {
    const order = await readOrder(ctx, orderId);
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

function orderIdsFromParams(params: JsonObject) {
  const ids = new Set<string>();
  if (typeof params.orderId === "string") ids.add(params.orderId);
  if (Array.isArray(params.orderIds)) {
    for (const id of params.orderIds) {
      if (typeof id === "string") ids.add(id);
    }
  }
  return [...ids];
}

async function runAnalysis(ctx: ExtensionContext, params: JsonObject) {
  await initProtocol(ctx.cwd);
  const target = path.join(root(ctx.cwd), "analysis.json");
  const targetExists = await exists(target);
  if (targetExists && !params.overwrite) {
    throw new Error(
      ".repochan/analysis.json already exists. Ask whether to reuse it or rerun with params.overwrite=true (params.versionPrevious defaults to true).",
    );
  }
  if (targetExists && params.versionPrevious !== false) {
    const prior = await readJson(target);
    await writeJson(path.join(root(ctx.cwd), "analysis.versions", `${stampForPath()}.json`), prior, false);
  }
  const generated = await performAnalysis(ctx.cwd, params as AnalyzeInput);
  const data = {
    ...generated,
    ...(isPlainObject(params.analysis) ? params.analysis : {}),
    schemaVersion: "repochan.analysis.v1",
    generatedAt: stamp(),
  };
  await writeJson(target, data, Boolean(params.overwrite));
  return ok("Analyzed repository and wrote .repochan/analysis.json", data);
}

async function createOrUpdatePersona(ctx: ExtensionContext, params: JsonObject, mode: "create" | "update") {
  await initProtocol(ctx.cwd);
  await requireAnalysis(ctx);
  if (!isPlainObject(params.persona)) throw new Error("params.persona is required and must be an object.");
  const current = path.join(root(ctx.cwd), "persona", "current.json");
  const currentExists = await exists(current);
  const overwrite = optionalBoolean(params, "overwrite", false);
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
    await writeJson(path.join(root(ctx.cwd), "persona", "versions", `${ts}-previous.json`), await readJson(current), false);
  }
  const provenance = params.persona.provenance ?? params.provenance ?? { tool: "repochan", action: `persona.${mode}` };
  const data = { ...params.persona, schemaVersion: "repochan.persona.v1", generatedAt: stamp(), provenance };
  const slug = typeof params.slug === "string" ? params.slug : "persona";
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("slug must match ^[a-z0-9-]+$.");
  const versionName = `${ts}-${slug}.json`;
  await writeJson(path.join(root(ctx.cwd), "persona", "versions", versionName), data, false);
  await writeJson(current, data, currentExists || overwrite);
  return ok(`Wrote persona current and persona/versions/${versionName}`, data);
}

async function createOrders(ctx: ExtensionContext, params: JsonObject) {
  await initProtocol(ctx.cwd);
  await requireAnalysis(ctx);
  await requirePersona(ctx);
  const inputOrders = Array.isArray(params.orders) ? params.orders : params.order ? [params.order] : undefined;
  if (!inputOrders?.length) throw new Error("order.create requires params.order or params.orders.");
  const orders = inputOrders.map((order) => normalizeOrder(order as AssetOrder, params.batchId));
  for (const order of orders) {
    if (!/^ord-[a-z0-9][a-z0-9-]*$/.test(order.orderId)) {
      throw new Error(`Invalid orderId: ${order.orderId}`);
    }
  }
  const overwrite = optionalBoolean(params, "overwrite", false);
  for (const order of orders) {
    const file = path.join(root(ctx.cwd), "orders", `${order.orderId}.json`);
    if ((await exists(file)) && !overwrite) throw new Error(`Order ${order.orderId} already exists. Ask before overwrite=true.`);
  }
  if (params.batchId) {
    if (typeof params.batchId !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(params.batchId)) {
      throw new Error("batchId must match ^[a-z0-9][a-z0-9-]*$.");
    }
    const batchFile = path.join(root(ctx.cwd), "orders", "batches", `${params.batchId}.json`);
    if ((await exists(batchFile)) && !overwrite) throw new Error(`Order batch ${params.batchId} already exists. Ask before overwrite=true.`);
  }
  const written: string[] = [];
  for (const order of orders) {
    const file = path.join(root(ctx.cwd), "orders", `${order.orderId}.json`);
    await writeJson(file, order, overwrite);
    written.push(relativeProtocolPath(ctx.cwd, file));
  }
  if (params.batchId) {
    await writeJson(
      path.join(root(ctx.cwd), "orders", "batches", `${params.batchId}.json`),
      { schemaVersion: "repochan.order-batch.v1", batchId: params.batchId, orderIds: orders.map((o) => o.orderId), createdAt: stamp() },
      overwrite,
    );
  }
  return ok(`Wrote ${written.length} order(s): ${written.join(", ")}`, { written, orders });
}

async function listOrders(ctx: ExtensionContext) {
  await initProtocol(ctx.cwd);
  const files = await listJsonFiles(path.join(root(ctx.cwd), "orders"));
  const orders = [];
  for (const file of files) {
    try {
      const order = await readJson(path.join(root(ctx.cwd), "orders", file));
      orders.push({ orderId: order.orderId, status: order.status, assetType: order.assetType, priority: order.priority, file });
    } catch {
      orders.push({ file, unreadable: true });
    }
  }
  return ok(orders.length ? orders.map((o) => `${o.orderId ?? o.file}\t${o.status ?? ""}\t${o.assetType ?? ""}`).join("\n") : "No orders found.", { files, orders });
}

async function updateOrder(ctx: ExtensionContext, params: JsonObject) {
  await initProtocol(ctx.cwd);
  const orderId = requireOrderId(params);
  const file = path.join(root(ctx.cwd), "orders", `${orderId}.json`);
  const current = await readJson(file);
  if (!optionalBoolean(params, "overwrite", false)) {
    throw new Error("order.update requires params.overwrite=true after explicit user approval. Use order.set_status or order.add_revision for narrow updates.");
  }
  await archiveOrder(ctx, orderId, current);
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
  return ok(`Updated order ${orderId}.`, next);
}

async function setOrderStatus(ctx: ExtensionContext, params: JsonObject) {
  await initProtocol(ctx.cwd);
  const orderId = requireOrderId(params);
  const status = requireString(params, "status") as OrderStatus;
  const allowedStatuses = new Set(["draft", "approved", "in_progress", "delivered", "needs_revision", "cancelled"]);
  if (!allowedStatuses.has(status)) throw new Error(`Invalid status: ${status}`);
  const file = path.join(root(ctx.cwd), "orders", `${orderId}.json`);
  const order = await readJson(file);
  await archiveOrder(ctx, orderId, order);
  order.status = status;
  order.updatedAt = stamp();
  await writeJson(file, order, true);
  return ok(`Set ${orderId} status to ${status}.`, order);
}

async function addOrderRevision(ctx: ExtensionContext, params: JsonObject) {
  await initProtocol(ctx.cwd);
  const orderId = requireOrderId(params);
  const revisionRequest = requireString(params, "revisionRequest");
  const file = path.join(root(ctx.cwd), "orders", `${orderId}.json`);
  const order = await readJson(file);
  await archiveOrder(ctx, orderId, order);
  order.revisions ??= [];
  order.revisions.push({ requestedAt: stamp(), request: revisionRequest, status: "draft" });
  order.status = "needs_revision";
  order.updatedAt = stamp();
  await writeJson(file, order, true);
  return ok(`Added revision request to ${orderId}.`, order);
}

async function listAssets(ctx: ExtensionContext) {
  await initProtocol(ctx.cwd);
  const assetsDir = path.join(root(ctx.cwd), "assets");
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
  return ok(assets.length ? assets.map((a) => `${a.assetId}\t${a.currentVersion ?? ""}\t${a.versionCount} version(s)`).join("\n") : "No assets found.", { assets });
}

async function createAssetVersion(ctx: ExtensionContext, params: JsonObject) {
  await initProtocol(ctx.cwd);
  await requireAnalysis(ctx);
  await requirePersona(ctx);
  const assetId = assetIdFromParams(params);
  const orderIds = orderIdsFromParams(params);
  const orders = await ensureOrdersApprovedForAsset(ctx, orderIds, optionalBoolean(params, "allowUnapprovedOrder", false));
  const versionId = requireVersionId(typeof params.versionId === "string" && params.versionId ? params.versionId : `v${stampForPath()}`);
  const dir = path.join(root(ctx.cwd), "assets", assetId);
  const versionDir = path.join(dir, "versions", versionId);
  const overwrite = optionalBoolean(params, "overwrite", false);
  if ((await exists(versionDir)) && !overwrite) throw new Error(`Asset version ${assetId}/${versionId} already exists. Ask before overwrite=true.`);
  await fs.mkdir(versionDir, { recursive: true });
  const manifestFile = assetManifestPath(ctx, assetId);
  const manifest =
    (await readJsonIfExists(manifestFile)) ??
    ({ schemaVersion: "repochan.asset-manifest.v1", assetId, currentVersion: undefined, orderIds: [], versions: [], meta: {} } as JsonObject);
  if (manifest.versions?.some((version: JsonObject) => version.versionId === versionId) && !overwrite) {
    throw new Error(`Manifest already contains version ${versionId}. Ask before overwrite=true.`);
  }
  const files = Array.isArray(params.files) ? params.files.filter((file) => typeof file === "string") : [];
  const versionEntry = {
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
  return ok(`Created asset version ${assetId}/${versionId}.`, { manifest, version: versionEntry, checkedOrders: orders });
}

async function setCurrentAsset(ctx: ExtensionContext, params: JsonObject) {
  await initProtocol(ctx.cwd);
  const assetId = assetIdFromParams(params);
  const versionId = requireVersionId(requireString(params, "versionId"));
  const manifestFile = assetManifestPath(ctx, assetId);
  const manifest = await readJson(manifestFile);
  if (!manifest.versions?.some((version: JsonObject) => version.versionId === versionId)) {
    throw new Error(`Asset ${assetId} has no version ${versionId}.`);
  }
  await archiveAssetManifest(ctx, assetId, manifest);
  manifest.currentVersion = versionId;
  manifest.updatedAt = stamp();
  await writeJson(manifestFile, manifest, true);
  return ok(`Set ${assetId} currentVersion to ${versionId}.`, manifest);
}

async function updateAssetMeta(ctx: ExtensionContext, params: JsonObject) {
  await initProtocol(ctx.cwd);
  const assetId = assetIdFromParams(params);
  if (!optionalBoolean(params, "overwrite", false)) {
    throw new Error("asset.update_meta mutates the asset manifest and requires params.overwrite=true after explicit user approval.");
  }
  const manifestFile = assetManifestPath(ctx, assetId);
  const manifest = await readJson(manifestFile);
  await archiveAssetManifest(ctx, assetId, manifest);
  const patch = isPlainObject(params.patch) ? params.patch : { meta: isPlainObject(params.meta) ? params.meta : {} };
  const next = { ...deepMerge(manifest, patch), assetId, schemaVersion: "repochan.asset-manifest.v1", updatedAt: stamp() };
  await writeJson(manifestFile, next, true);
  return ok(`Updated asset manifest metadata for ${assetId}.`, next);
}

async function protocolRead(ctx: ExtensionContext, params: JsonObject) {
  const artifactPath = requireString(params, "artifactPath");
  const file = safeProtocolPath(ctx.cwd, artifactPath);
  const data = await readJson(file);
  return ok(JSON.stringify(data, null, 2), data);
}

async function protocolAppendVersion(ctx: ExtensionContext, params: JsonObject) {
  await initProtocol(ctx.cwd);
  const artifactPath = requireString(params, "artifactPath");
  const stripped = artifactPath.startsWith(".repochan")
    ? artifactPath.slice(".repochan".length).replace(/^[/\\]+/, "")
    : artifactPath.replace(/^[/\\]+/, "");
  const data = params.data === undefined ? await readJson(safeProtocolPath(ctx.cwd, artifactPath)) : params.data;
  const versionFile = safeProtocolPath(ctx.cwd, protocolVersionPath(stripped));
  await writeJson(versionFile, data, false);
  return ok(`Wrote version ${relativeProtocolPath(ctx.cwd, versionFile)}`, { versionFile: relativeProtocolPath(ctx.cwd, versionFile), data });
}

export function registerRepoChan(pi: ExtensionAPI) {
  pi.registerTool({
    name: "repochan",
    label: "RepoChan",
    description:
      "Unified RepoChan management surface for all .repochan entities. This is the single public tool for deterministic analysis, persona artifacts, asset orders, delivered assets, and protocol-safe reads/writes/versioning. Use action strings like 'analysis.run', 'persona.get', 'order.list', and 'asset.create_version' with action-specific params.",
    promptSnippet:
      "Manage all .repochan analysis, persona, order, asset, and protocol artifacts through one action-based tool.",
    promptGuidelines: [
      "Use repochan as the only RepoChan management tool. Do not look for repochan_protocol_helpers, repochan_analyze, repochan_generate_persona, repochan_create_orders, or repochan_manage_orders; those actions now live under this unified tool.",
      "RepoChan pre-checks that skills describe in text should be performed through repochan itself: call action='protocol.inspect' for workspace state, action='analysis.get' to verify analysis, action='persona.get' to verify persona, action='order.list' or action='order.get' to verify order existence/status, and action='asset.list' or action='asset.get' to verify delivered assets.",
      "repochan is the single management surface for agents and future dashboards/panels. Prefer it over ad-hoc shell scripts for .repochan reads, writes, version lists, order status changes, revision capture, and deterministic repository analysis.",
      "Safety: repochan refuses blind overwrites. When an action has params.overwrite, set it to true only after explicit user approval. Mutating current artifacts archives prior state where appropriate; keep params.versionPrevious=true unless the user asks otherwise.",
      "Safety: keep provenance. persona.create/persona.update and asset.create_version add provenance when absent; pass params.provenance when an external generator, dashboard, or human produced the artifact.",
      "Safety: protocol paths are constrained to .repochan. protocol.write and protocol.append_version must not be used to bypass entity-specific preconditions unless the user explicitly asks for protocol-level maintenance/migration.",
      "analysis.run params: optional { analysis, overwrite=false, versionPrevious=true, corePaths, focusAreas, includeSections, maxSampleFiles, maxSampleChars, perFileSampleChars, colorScanLimit, includeFileLists=true }. Runs deterministic file walking, git profile, color extraction, tech-stack detection, docs summary, inventory counts, and desensitized code sampling, then writes .repochan/analysis.json. If analysis exists, ask before overwrite=true.",
      "analysis.get params: {}. Reads .repochan/analysis.json. Use before persona work when you need the upstream analysis. Fails if missing.",
      "analysis.list_versions params: {}. Lists .repochan/analysis.versions/*.json and reports whether current analysis exists.",
      "persona.get params: optional { versionId }. Without versionId, reads .repochan/persona/current.json. With versionId, reads .repochan/persona/versions/<versionId>.json (the .json suffix is optional). Use as the persona pre-flight before order or painter work.",
      "persona.create params: { persona, slug?, overwrite=false, versionPrevious=true, provenance? }. Requires analysis. Writes persona/current.json and a persona/versions/<timestamp>-<slug>.json copy. If current exists, ask before overwrite=true.",
      "persona.update params: { persona, slug?, overwrite=true, versionPrevious=true, provenance? }. Requires analysis and an existing persona/current.json. Archives previous current when versionPrevious is not false, then replaces current and writes a new version. Always obtain user approval before overwrite=true.",
      "order.list params: {}. Lists .repochan/orders/*.json with orderId, status, assetType, and priority. Use to choose orders and check approval state.",
      "order.get params: { orderId }. Reads .repochan/orders/<orderId>.json. Use before Painter execution to verify status and brief.",
      "order.create params: { order } or { orders: [...] }, optional { batchId, overwrite=false }. Requires analysis and persona. Normalizes schemaVersion, status=draft, priority=normal, timestamps, and optional batch file. Use for Art Director outputs, not final image generation.",
      "order.update params: { orderId, patch } or { orderId, order }, plus overwrite=true. Deep-merges the patch into the existing order, archives the previous order under orders/versions/<orderId>/, and updates updatedAt. Use only after explicit approval; use order.set_status or order.add_revision for narrow routine changes.",
      "order.set_status params: { orderId, status }. status must be one of draft, approved, in_progress, delivered, needs_revision, cancelled. Archives the previous order and updates status/updatedAt.",
      "order.add_revision params: { orderId, revisionRequest }. Records the user's revision text verbatim in order.revisions, archives the previous order, sets status=needs_revision, and updates updatedAt.",
      "asset.list params: {}. Lists asset manifests under .repochan/assets/<assetId>/manifest.json with currentVersion and version count.",
      "asset.get params: { assetId }. Reads .repochan/assets/<assetId>/manifest.json. Use before revisions, set_current, or brand-kit decisions.",
      "asset.create_version params: { assetId, orderId? or orderIds?, files?, versionId?, tool?, promptBrief?, notes?, meta?, provenance?, setCurrent=true, overwrite=false, allowUnapprovedOrder=false }. Requires analysis and persona. If orderIds are provided, their statuses must be approved or in_progress unless allowUnapprovedOrder=true was explicitly approved. Creates assets/<assetId>/versions/<versionId>/meta.json and appends to manifest.json.",
      "asset.set_current params: { assetId, versionId }. Requires an existing manifest and version. Archives the previous manifest then updates currentVersion.",
      "asset.update_meta params: { assetId, meta } or { assetId, patch }, plus overwrite=true. Archives the previous manifest and deep-merges metadata/patch into manifest.json. Obtain user approval before overwrite=true.",
      "protocol.inspect params: {}. Inspects .repochan existence, current analysis/persona, analysis/persona versions, order files, and asset directories without creating or mutating files.",
      "protocol.read params: { artifactPath }. Safely reads a JSON artifact inside .repochan. artifactPath may be '.repochan/analysis.json' or a path relative to .repochan.",
      "protocol.write params: { artifactPath, data, overwrite=false }. Safely writes JSON inside .repochan, creating parent directories. Use entity actions first; use protocol.write only for migrations, notes, manifests, or user-directed maintenance. Ask before overwrite=true.",
      "protocol.append_version params: { artifactPath, data? }. Writes data to the conventional version location for artifactPath. If data is omitted, reads artifactPath and snapshots its current JSON. Never overwrites existing version files.",
    ],
    parameters: RepoChanSchema,
    async execute(_toolCallId, input: RepoChanInput, _signal, _onUpdate, ctx) {
      const params = input.params ?? {};
      switch (input.action) {
        case "analysis.run":
          return runAnalysis(ctx, params);
        case "analysis.get": {
          const data = await readJson(path.join(root(ctx.cwd), "analysis.json"));
          return ok(JSON.stringify(data, null, 2), data);
        }
        case "analysis.list_versions": {
          await initProtocol(ctx.cwd);
          const current = await exists(path.join(root(ctx.cwd), "analysis.json"));
          const versions = await listJsonFiles(path.join(root(ctx.cwd), "analysis.versions"));
          return ok(versions.join("\n") || "No analysis versions found.", { current, versions });
        }
        case "persona.get": {
          const versionId = typeof params.versionId === "string" && params.versionId ? requireVersionId(params.versionId.replace(/\.json$/, "")) : undefined;
          const file = versionId
            ? path.join(root(ctx.cwd), "persona", "versions", `${versionId}.json`)
            : path.join(root(ctx.cwd), "persona", "current.json");
          const data = await readJson(file);
          return ok(JSON.stringify(data, null, 2), data);
        }
        case "persona.create":
          return createOrUpdatePersona(ctx, params, "create");
        case "persona.update":
          return createOrUpdatePersona(ctx, params, "update");
        case "order.list":
          return listOrders(ctx);
        case "order.get": {
          const data = await readOrder(ctx, requireOrderId(params));
          return ok(JSON.stringify(data, null, 2), data);
        }
        case "order.create":
          return createOrders(ctx, params);
        case "order.update":
          return updateOrder(ctx, params);
        case "order.set_status":
          return setOrderStatus(ctx, params);
        case "order.add_revision":
          return addOrderRevision(ctx, params);
        case "asset.list":
          return listAssets(ctx);
        case "asset.get": {
          const assetId = assetIdFromParams(params);
          const data = await readJson(assetManifestPath(ctx, assetId));
          return ok(JSON.stringify(data, null, 2), data);
        }
        case "asset.create_version":
          return createAssetVersion(ctx, params);
        case "asset.set_current":
          return setCurrentAsset(ctx, params);
        case "asset.update_meta":
          return updateAssetMeta(ctx, params);
        case "protocol.inspect": {
          const summary = await inspectProtocol(ctx.cwd);
          return ok(JSON.stringify(summary, null, 2), summary);
        }
        case "protocol.read":
          return protocolRead(ctx, params);
        case "protocol.write": {
          await initProtocol(ctx.cwd);
          const artifactPath = requireString(params, "artifactPath");
          const file = safeProtocolPath(ctx.cwd, artifactPath);
          await writeJson(file, params.data ?? {}, optionalBoolean(params, "overwrite", false));
          return ok(`Wrote ${artifactPath}`, { artifactPath, path: relativeProtocolPath(ctx.cwd, file) });
        }
        case "protocol.append_version":
          return protocolAppendVersion(ctx, params);
        default:
          throw new Error(`Unknown RepoChan action: ${(input as JsonObject).action}`);
      }
    },
  });
}

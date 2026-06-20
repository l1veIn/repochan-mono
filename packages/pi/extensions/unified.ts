import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import path from "node:path";
import { loadAllTemplates } from "../src/template-loader.js";
import {
  exists,
  initProtocol,
  inspectProtocol,
  listJsonFiles,
  protocolVersionPath,
  readConfig,
  readJson,
  relativeProtocolPath,
  root,
  safeProtocolPath,
  validateOrderId,
  validateVersionId,
  writeConfig,
  writeJson,
  writeAnalysisArtifact,
  isPlainObject,
  createOrderResult as coreCreateOrderResult,
  createOrders as coreCreateOrders,
  createOrUpdatePersona as coreCreateOrUpdatePersona,
  findFoundationSheet as coreFindFoundationSheet,
  listOrderResults as coreListOrderResults,
  listOrders as coreListOrders,
  readOrder as coreReadOrder,
  readOrderResult as coreReadOrderResult,
  resolveOrderReferences as coreResolveOrderReferences,
  setCurrentOrderResult as coreSetCurrentOrderResult,
  setOrderStatus as coreSetOrderStatus,
  addOrderRevision as coreAddOrderRevision,
  updateOrder as coreUpdateOrder,
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
  Type.Literal("order.create_result"),
  Type.Literal("order.list_results"),
  Type.Literal("order.set_current_result"),
  Type.Literal("order.get_result"),
  Type.Literal("order.resolve_references"),
  Type.Literal("foundation.find"),
  Type.Literal("config.get"),
  Type.Literal("config.set"),
  Type.Literal("template.list"),
  Type.Literal("template.get"),
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

function requireOrderId(params: JsonObject) {
  return validateOrderId(requireString(params, "orderId"));
}

function requireVersionId(value: string) {
  return validateVersionId(value);
}

async function runAnalysis(ctx: ExtensionContext, params: JsonObject) {
  const { data } = await writeAnalysisArtifact(ctx.cwd, params);
  return ok("Analyzed repository and wrote .repochan/analysis.json", data);
}

async function createOrUpdatePersona(ctx: ExtensionContext, params: JsonObject, mode: "create" | "update") {
  const { versionName, data } = await coreCreateOrUpdatePersona(ctx.cwd, params, mode);
  return ok(`Wrote persona current and persona/versions/${versionName}`, data);
}

async function createOrders(ctx: ExtensionContext, params: JsonObject) {
  const { written, orders } = await coreCreateOrders(ctx.cwd, params);
  return ok(`Wrote ${written.length} order(s): ${written.join(", ")}`, { written, orders });
}

async function listOrders(ctx: ExtensionContext) {
  const { files, orders } = await coreListOrders(ctx.cwd);
  return ok(orders.length ? orders.map((o) => `${o.orderId ?? o.file}\t${o.status ?? ""}\t${o.assetType ?? ""}`).join("\n") : "No orders found.", { files, orders });
}

async function updateOrder(ctx: ExtensionContext, params: JsonObject) {
  const orderId = requireOrderId(params);
  const next = await coreUpdateOrder(ctx.cwd, { ...params, orderId });
  return ok(`Updated order ${orderId}.`, next);
}

async function setOrderStatus(ctx: ExtensionContext, params: JsonObject) {
  const orderId = requireOrderId(params);
  const status = requireString(params, "status") as OrderStatus;
  const order = await coreSetOrderStatus(ctx.cwd, orderId, status);
  return ok(`Set ${orderId} status to ${status}.`, order);
}

async function addOrderRevision(ctx: ExtensionContext, params: JsonObject) {
  const orderId = requireOrderId(params);
  const revisionRequest = requireString(params, "revisionRequest");
  const order = await coreAddOrderRevision(ctx.cwd, orderId, revisionRequest);
  return ok(`Added revision request to ${orderId}.`, order);
}

async function createOrderResult(ctx: ExtensionContext, params: JsonObject) {
  const orderId = requireOrderId(params);
  const result = await coreCreateOrderResult(ctx.cwd, { ...params, orderId });
  return ok(`Created order result ${orderId}/${result.version.versionId}.`, result);
}

async function listOrderResults(ctx: ExtensionContext, params: JsonObject) {
  const orderId = requireOrderId(params);
  const result = await coreListOrderResults(ctx.cwd, orderId);
  return ok(
    result.results.length ? result.results.map((v) => `${v.versionId}\t${v.createdAt ?? ""}\t${v.files?.length ?? 0} file(s)`).join("\n") : "No order results found.",
    result,
  );
}

async function setCurrentOrderResult(ctx: ExtensionContext, params: JsonObject) {
  const orderId = requireOrderId(params);
  const versionId = requireVersionId(requireString(params, "versionId"));
  const order = await coreSetCurrentOrderResult(ctx.cwd, orderId, versionId);
  return ok(`Set ${orderId} currentVersion to ${versionId}.`, order);
}

async function getOrderResult(ctx: ExtensionContext, params: JsonObject) {
  const orderId = requireOrderId(params);
  const versionId = typeof params.versionId === "string" && params.versionId ? requireVersionId(params.versionId) : undefined;
  const result = await coreReadOrderResult(ctx.cwd, orderId, versionId);
  return ok(JSON.stringify(result, null, 2), result);
}

async function resolveReferences(ctx: ExtensionContext, params: JsonObject) {
  const references = params.references;
  if (!Array.isArray(references)) throw new Error("order.resolve_references requires params.references (an array).");
  const resolved = await coreResolveOrderReferences(ctx.cwd, references);
  const summary = resolved
    .map((r) => `${r.role}\t${r.orderId}/${r.versionId}\t${r.files.length} file(s)`)
    .join("\n");
  return ok(summary || "No references resolved.", { resolved });
}

async function findFoundation(ctx: ExtensionContext) {
  const foundation = await coreFindFoundationSheet(ctx.cwd);
  if (!foundation) return ok("No foundation sheet found.", { foundation: null });
  return ok(
    `Foundation: ${foundation.orderId}/${foundation.versionId} (${foundation.assetType}, ${foundation.files.length} file(s))`,
    { foundation },
  );
}

async function getConfig(ctx: ExtensionContext, params: JsonObject) {
  const config = await readConfig(ctx.cwd);
  const key = typeof params.key === "string" ? params.key : undefined;
  if (key) return ok(`${key}: ${String(config[key] ?? "<unset>")}`, { config: { [key]: config[key] } });
  return ok(JSON.stringify(config, null, 2), { config });
}

async function setConfig(ctx: ExtensionContext, params: JsonObject) {
  if (!isPlainObject(params.values)) throw new Error("config.set requires params.values (an object).");
  await writeConfig(ctx.cwd, params.values);
  const config = await readConfig(ctx.cwd);
  return ok(`Config updated.`, { config });
}

function getBuiltinTemplatesDir(): string {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "templates");
}

async function listTemplates(ctx: ExtensionContext, params: JsonObject) {
  const builtinDir = getBuiltinTemplatesDir();
  const all = await loadAllTemplates(builtinDir, ctx.cwd);
  const tag = typeof params.tag === "string" ? params.tag.toLowerCase() : undefined;
  const query = typeof params.query === "string" ? params.query.toLowerCase() : undefined;

  let filtered = all;
  if (tag && tag !== "all") {
    filtered = filtered.filter((t) => (t.tags ?? []).some((tg) => tg.toLowerCase() === tag));
  }
  if (query) {
    filtered = filtered.filter(
      (t) =>
        t.id.toLowerCase().includes(query) ||
        t.label.toLowerCase().includes(query) ||
        t.assetType.toLowerCase().includes(query) ||
        (t.description ?? "").toLowerCase().includes(query),
    );
  }

  const summary = filtered.map((t) => ({
    id: t.id,
    label: t.label,
    assetType: t.assetType,
    aspectRatio: t.aspectRatio,
    grid: t.grid,
    tags: t.tags,
  }));

  return ok(
    summary.length
      ? summary.map((s) => `${s.id}\t${s.label}\t${s.assetType}\t${s.aspectRatio ?? ""}`).join("\n")
      : "No templates found.",
    { templates: summary },
  );
}

async function getTemplate(ctx: ExtensionContext, params: JsonObject) {
  const templateId = requireString(params, "templateId");
  const builtinDir = getBuiltinTemplatesDir();
  const all = await loadAllTemplates(builtinDir, ctx.cwd);
  const tmpl = all.find((t) => t.id === templateId || t.assetType === templateId);
  if (!tmpl) throw new Error(`Template '${templateId}' not found. Use action='template.list' to see available templates.`);
  return ok(JSON.stringify(tmpl, null, 2), { template: tmpl });
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
      "Unified RepoChan management surface for all .repochan entities. This is the single public tool for deterministic analysis, persona artifacts, orders, order result versions, and protocol-safe reads/writes/versioning. Use action strings like 'analysis.run', 'persona.get', 'order.list', and 'order.create_result' with action-specific params.",
    promptSnippet:
      "Manage all .repochan analysis, persona, order, order-result, and protocol artifacts through one action-based tool.",
    promptGuidelines: [
      "Use repochan as the only RepoChan management tool. Do not look for repochan_protocol_helpers, repochan_analyze, repochan_generate_persona, repochan_create_orders, or repochan_manage_orders; those actions now live under this unified tool.",
      "RepoChan pre-checks that skills describe in text should be performed through repochan itself: call action='protocol.inspect' for workspace state, action='analysis.get' to verify analysis, action='persona.get' to verify persona, action='order.list' or action='order.get' to verify order existence/status, and action='order.list_results' or action='order.get_result' to verify delivered order results.",
      "repochan is the single management surface for agents and future dashboards/panels. Prefer it over ad-hoc shell scripts for .repochan reads, writes, version lists, order status changes, revision capture, and deterministic repository analysis.",
      "Safety: repochan refuses blind overwrites. When an action has params.overwrite, set it to true only after explicit user approval. Mutating current artifacts archives prior state where appropriate; keep params.versionPrevious=true unless the user asks otherwise.",
      "Safety: keep provenance. persona.create/persona.update and order.create_result add provenance when absent; pass params.provenance when an external generator, dashboard, or human produced the artifact.",
      "Safety: protocol paths are constrained to .repochan. protocol.write and protocol.append_version must not be used to bypass entity-specific preconditions unless the user explicitly asks for protocol-level maintenance/migration.",
      "analysis.run params: optional { analysis, overwrite=false, versionPrevious=true, corePaths, focusAreas, includeSections, maxSampleFiles, maxSampleChars, perFileSampleChars, colorScanLimit, includeFileLists=true }. Runs deterministic file walking, git profile, color extraction, tech-stack detection, docs summary, inventory counts, and desensitized code sampling, then writes .repochan/analysis.json. If analysis exists, ask before overwrite=true.",
      "analysis.get params: {}. Reads .repochan/analysis.json. Use before persona work when you need the upstream analysis. Fails if missing.",
      "analysis.list_versions params: {}. Lists .repochan/analysis.versions/*.json and reports whether current analysis exists.",
      "persona.get params: optional { versionId }. Without versionId, reads .repochan/persona/current.json. With versionId, reads .repochan/persona/versions/<versionId>.json (the .json suffix is optional). Use as the persona pre-flight before order or painter work.",
      "persona.create params: { persona, slug?, overwrite=false, versionPrevious=true, provenance? }. Requires analysis. Writes persona/current.json and a persona/versions/<timestamp>-<slug>.json copy. If current exists, ask before overwrite=true.",
      "persona.update params: { persona, slug?, overwrite=true, versionPrevious=true, provenance? }. Requires analysis and an existing persona/current.json. Archives previous current when versionPrevious is not false, then replaces current and writes a new version. Always obtain user approval before overwrite=true.",
      "order.list params: {}. Lists .repochan/orders/<orderId>/order.json with orderId, status, assetType, priority, currentVersion, and result count. Use to choose orders and check approval state.",
      "order.get params: { orderId }. Reads .repochan/orders/<orderId>/order.json. Use before Painter execution to verify status and brief.",
      "order.create params: { order } or { orders: [...] }, optional { batchId, overwrite=false }. Requires analysis and persona. Normalizes schemaVersion, status=draft, priority=normal, timestamps, and optional batch file. Use for Art Director outputs, not final image generation.",
      "order.update params: { orderId, patch } or { orderId, order }, plus overwrite=true. Deep-merges the patch into the existing order, archives the previous order under orders/<orderId>/versions/<timestamp>-order.json, and updates updatedAt. Use only after explicit approval; use order.set_status or order.add_revision for narrow routine changes.",
      "order.set_status params: { orderId, status }. status must be one of draft, approved, in_progress, delivered, needs_revision, cancelled. Archives the previous order and updates status/updatedAt.",
      "order.add_revision params: { orderId, revisionRequest }. Records the user's revision text verbatim in order.revisions, archives the previous order, sets status=needs_revision, and updates updatedAt.",
      "order.create_result params: { orderId, files?, versionId?, tool?, promptBrief?, notes?, meta?, provenance?, setCurrent=true, overwrite=false, allowUnapprovedOrder=false, markDelivered=true }. Requires analysis, persona, and an approved/in_progress order unless allowUnapprovedOrder=true was explicitly approved. Creates orders/<orderId>/versions/<versionId>/meta.json, copies provided files into that version directory when possible, updates order.currentVersion, and normally marks the order delivered.",
      "order.list_results params: { orderId }. Lists result versions under .repochan/orders/<orderId>/versions/.",
      "order.get_result params: { orderId, versionId? }. Reads a result version meta/files. Without versionId, reads order.currentVersion.",
      "order.set_current_result params: { orderId, versionId }. Requires an existing result version. Archives the previous order then updates order.currentVersion.",
      "foundation.find params: {}. Searches for a foundation/cover sheet order (assetType 'foundation_sheet' or 'cover_sheet') that has a delivered result with image files. Returns { orderId, versionId, assetType, files } or null. The Art Director and Painter use this to check whether the project already has a visual anchor before creating or executing downstream orders.",
      "config.get params: optional { key }. Reads .repochan/config.json. Without key, returns the full config. With key, returns just that value. Used by the Creative Writer to check the user's language preference before generating persona content.",
      "config.set params: { values }. Merges values into .repochan/config.json. Used to update language preference or other project-level settings.",
      "template.list params: optional { tag?, query? }. Lists all available templates (built-in + project-level .repochan/templates/). Each template returns id, label, assetType, aspectRatio, grid info, and tags. Use tag to filter (e.g., tag='sticker') or query to search.",
      "template.get params: { templateId }. Returns the full template definition including dimensions, grid layout, background type, guide tags, and structural constraints. The Painter uses this to know the 'canvas spec' before writing a prompt.",
      "Template system: Templates define OUTPUT SPECIFICATIONS (canvas size, grid layout, background type, quality prefix, structural constraints) — they are NOT prompt generators. The Painter reads persona + order + references + template, then writes the full prompt themselves. Templates ensure outputs have the right structure for downstream tools (e.g., a 3×3 grid can be auto-sliced into 9 tiles). The Art Director sets templateId on each order; the Painter reads it before generating.",
      "Language awareness: .repochan/config.json stores the user's language preference ('zh' or 'en'). The Creative Writer MUST read config.get before generating persona content, and generate all narrative fields (personality, backstory, catchphrase, hobbies, characterFlaws, etc.) in that language. The rolePrompt field is ALWAYS English regardless of language setting, because it is consumed by image generation models.",
      "order.resolve_references params: { references: [{ orderId, versionId?, role }] }. Resolves reference entries into absolute image file paths grouped by role. Used by the Painter before generation to get the actual reference image files to inject. role is one of: character, style, composition.",
      "Visual anchor system: A 'foundation sheet' (assetType 'foundation_sheet' or 'cover_sheet') is the project's first real image output — it contains the mascot's signature pose, chibi form, expressions, and color palette on a single sheet. Every downstream order SHOULD reference it via the order.references field: [{ orderId: '<foundation-order-id>', role: 'character' }]. This ensures visual consistency across all generated assets. The Art Director creates the foundation order first; once it has a delivered result, the Art Director auto-fills references on all subsequent orders.",
      "Order references field: Each order may include a `references` array of { orderId, versionId?, role } entries. When present, the Painter resolves them via action='order.resolve_references' and passes the resulting image files as reference images to the image generation tool. Orders with assetType 'foundation_sheet' or 'cover_sheet' do NOT need references — they ARE the anchor.",
      "protocol.inspect params: {}. Inspects .repochan existence, current analysis/persona, analysis/persona versions, order directories, and order result versions without creating or mutating files.",
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
          const data = await coreReadOrder(ctx.cwd, requireOrderId(params));
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
        case "order.create_result":
          return createOrderResult(ctx, params);
        case "order.list_results":
          return listOrderResults(ctx, params);
        case "order.set_current_result":
          return setCurrentOrderResult(ctx, params);
        case "order.get_result":
          return getOrderResult(ctx, params);
        case "order.resolve_references":
          return resolveReferences(ctx, params);
        case "foundation.find":
          return findFoundation(ctx);
        case "config.get":
          return getConfig(ctx, params);
        case "config.set":
          return setConfig(ctx, params);
        case "template.list":
          return listTemplates(ctx, params);
        case "template.get":
          return getTemplate(ctx, params);
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

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
  readJson,
  relativeProtocolPath,
  root,
  safeProtocolPath,
  validateOrderId,
  validateVersionId,
  writeJson,
  updateAnalysisArtifact,
  writeAnalysisArtifact,
  isPlainObject,
  checkPageAssets as coreCheckPageAssets,
  collectAssetRefs as coreCollectAssetRefs,
  createOrderResult as coreCreateOrderResult,
  createOrders as coreCreateOrders,
  createOrUpdatePersona as coreCreateOrUpdatePersona,
  createOrUpdateInterview as coreCreateOrUpdateInterview,
  createOrUpdatePage as coreCreateOrUpdatePage,
  appendToInterview as coreAppendToInterview,
  findFoundationSheet as coreFindFoundationSheet,
  listOrderResults as coreListOrderResults,
  listOrders as coreListOrders,
  readOrder as coreReadOrder,
  readOrderResult as coreReadOrderResult,
  readPage as coreReadPage,
  resolveOrderReferences as coreResolveOrderReferences,
  setCurrentOrderResult as coreSetCurrentOrderResult,
  setOrderStatus as coreSetOrderStatus,
  addOrderRevision as coreAddOrderRevision,
  updateOrder as coreUpdateOrder,
  createReview as coreCreateReview,
  createOrderCandidate as coreCreateOrderCandidate,
  promoteCandidate as corePromoteCandidate,
  type OrderStatus,
} from "@repochan/core";
import { renderPage as rendererRenderPage, assetKey as rendererAssetKey } from "@repochan/page-renderer";

const ActionSchema = Type.Union([
  Type.Literal("analysis.run"),
  Type.Literal("analysis.get"),
  Type.Literal("analysis.enrich"),
  Type.Literal("analysis.update"),
  Type.Literal("analysis.list_versions"),
  Type.Literal("persona.get"),
  Type.Literal("persona.create"),
  Type.Literal("persona.update"),
  Type.Literal("interview.get"),
  Type.Literal("interview.create"),
  Type.Literal("interview.append"),
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
  Type.Literal("template.list"),
  Type.Literal("template.get"),
  Type.Literal("protocol.inspect"),
  Type.Literal("protocol.read"),
  Type.Literal("protocol.write"),
  Type.Literal("protocol.append_version"),
  Type.Literal("page.create"),
  Type.Literal("page.get"),
  Type.Literal("page.check_assets"),
  Type.Literal("page.render"),
  Type.Literal("review.create"),
  Type.Literal("order.create_candidate"),
  Type.Literal("order.promote_candidate"),
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
  return ok("Analyzed repository and wrote .repochan/analysis/current.json", data);
}

async function updateAnalysis(ctx: ExtensionContext, params: JsonObject) {
  if (!isPlainObject(params.patch)) {
    throw new Error("analysis.update requires params.patch (an object).");
  }
  const { data } = await updateAnalysisArtifact(ctx.cwd, {
    patch: params.patch,
    overwrite: params.overwrite === true,
    versionPrevious: params.versionPrevious,
    reason: typeof params.reason === "string" ? params.reason : undefined,
  });
  return ok("Updated .repochan/analysis/current.json", data);
}

async function enrichAnalysis(ctx: ExtensionContext, params: JsonObject) {
  const analysisPath = path.join(root(ctx.cwd), "analysis", "current.json");
  const existing = await readJson(analysisPath);

  // Version the current analysis before enriching
  await initProtocol(ctx.cwd);
  const versionDir = path.join(root(ctx.cwd), "analysis", "versions");
  const versionStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const versionFile = path.join(versionDir, `${versionStamp}-pre-enrich.json`);
  await writeJson(versionFile, existing, false);

  // Merge LLM-generated fields. Language/native-language fields are intentionally not accepted here:
  // repository language is localization metadata, not mascot identity.
  const enriched = { ...existing };
  if (params.preAnalysis && isPlainObject(params.preAnalysis)) {
    enriched.preAnalysis = params.preAnalysis;
  }
  if (params.abstract && isPlainObject(params.abstract)) {
    enriched.abstract = params.abstract;
  }
  enriched.enrichedAt = new Date().toISOString();

  await writeJson(analysisPath, enriched, true);
  return ok("Enriched analysis/current.json with LLM preAnalysis and abstract dimensions.", { analysis: enriched });
}

async function createOrUpdatePersona(ctx: ExtensionContext, params: JsonObject, mode: "create" | "update") {
  const { versionName, data } = await coreCreateOrUpdatePersona(ctx.cwd, params, mode);
  return ok(`Wrote persona current and persona/versions/${versionName}`, data);
}

async function createInterview(ctx: ExtensionContext, params: JsonObject) {
  const { versionName, data } = await coreCreateOrUpdateInterview(ctx.cwd, params);
  return ok(`Wrote interview current and interview/versions/${versionName}`, data);
}

async function appendInterview(ctx: ExtensionContext, params: JsonObject) {
  const { versionName, data } = await coreAppendToInterview(ctx.cwd, params);
  return ok(`Appended to interview and wrote interview/versions/${versionName}`, data);
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

async function createReview(ctx: ExtensionContext, params: JsonObject) {
  const orderId = requireOrderId(params);
  const versionId = requireVersionId(requireString(params, "versionId"));
  const result = await coreCreateReview(ctx.cwd, { ...params, orderId, versionId });
  const verdictLine = result.statusChanged
    ? ` Order pushed back to needs_revision (verdict=${result.review.verdict}).`
    : "";
  return ok(`Reviewed ${orderId}/${versionId}: ${result.review.verdict}.${verdictLine}`, result);
}

async function createOrderCandidateAction(ctx: ExtensionContext, params: JsonObject) {
  const orderId = requireOrderId(params);
  const result = await coreCreateOrderCandidate(ctx.cwd, { ...params, orderId });
  return ok(`Created candidate ${orderId}/${result.version.versionId} (role=candidate, not promoted).`, result);
}

async function promoteCandidateAction(ctx: ExtensionContext, params: JsonObject) {
  const orderId = requireOrderId(params);
  const versionId = requireVersionId(requireString(params, "versionId"));
  const result = await corePromoteCandidate(ctx.cwd, orderId, versionId);
  const prevLine = result.previousCurrent ? ` Previous current ${result.previousCurrent.versionId} demoted to snapshot.` : "";
  return ok(`Promoted ${orderId}/${versionId} to current.${prevLine}`, result);
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

// ---------------------------------------------------------------------------
// Page actions
// ---------------------------------------------------------------------------

async function createPage(ctx: ExtensionContext, params: JsonObject) {
  const { versionName, data } = await coreCreateOrUpdatePage(ctx.cwd, params);
  return ok(`Wrote page current and page/versions/${versionName}`, data);
}

async function getPage(ctx: ExtensionContext, params: JsonObject) {
  const versionId = typeof params.versionId === "string" && params.versionId
    ? params.versionId.replace(/\.json$/, "")
    : undefined;

  if (versionId) {
    const file = path.join(root(ctx.cwd), "pages", "versions", `${versionId}.json`);
    const data = await readJson(file);
    return ok(JSON.stringify(data, null, 2), data);
  }

  const data = await coreReadPage(ctx.cwd);
  if (!data) throw new Error("No page found. Use action='page.create' first.");
  return ok(JSON.stringify(data, null, 2), data);
}

async function checkPageAssets(ctx: ExtensionContext, params: JsonObject) {
  // Accept either a page object directly, or read current.json
  let page;
  if (isPlainObject(params.page)) {
    page = params.page;
  } else {
    const current = await coreReadPage(ctx.cwd);
    if (!current) throw new Error("No page found. Use action='page.create' first, or pass params.page.");
    page = current;
  }

  const result = await coreCheckPageAssets(ctx.cwd, page);

  if (result.ok) {
    return ok(`All ${result.total} asset(s) resolved.`, result);
  }

  const lines = result.missing.map((m) => `  ✗ ${m.ref.orderId}/${m.ref.versionId ?? "current"}/${m.ref.file}: ${m.error}`);
  return ok(`Missing ${result.missing.length} of ${result.total} asset(s):\n${lines.join("\n")}`, result);
}

async function renderPageToDisk(ctx: ExtensionContext, params: JsonObject) {
  // 1. Read page (current or from params)
  const page = isPlainObject(params.page) ? params.page : await coreReadPage(ctx.cwd);
  if (!page) throw new Error("No page found. Use action='page.create' first, or pass params.page.");

  // 2. Check assets first — refuse to render if missing
  const assetCheck = await coreCheckPageAssets(ctx.cwd, page);
  if (!assetCheck.ok) {
    const missing = assetCheck.missing
      .map((m) => `  ${m.ref.orderId}/${m.ref.versionId ?? "current"}/${m.ref.file}: ${m.error}`)
      .join("\n");
    throw new Error(
      `Cannot render: ${assetCheck.missing.length} of ${assetCheck.total} asset(s) are missing.\n${missing}\n\n` +
      "Fix these first: create orders via action='order.create', generate images via Painter, then re-render.",
    );
  }

  // 3. Build resolved assets map
  const resolvedAssets = new Map<string, string>();
  for (const r of assetCheck.resolved) {
    const key = rendererAssetKey(r.ref);
    resolvedAssets.set(key, `assets/${r.ref.file}`);
  }

  // 4. Render
  const result = rendererRenderPage(page, resolvedAssets);

  // 5. Write output files
  const outputDir = params.outputDir
    ? path.resolve(ctx.cwd, params.outputDir as string)
    : path.join(root(ctx.cwd), "pages", "site");

  const { promises: fs } = await import("node:fs");
  await fs.mkdir(path.join(outputDir, "assets"), { recursive: true });

  // Write index.html
  await fs.writeFile(path.join(outputDir, "index.html"), result.html, "utf8");

  // Copy asset files
  const copied: string[] = [];
  for (const r of assetCheck.resolved) {
    const dest = path.join(outputDir, "assets", r.ref.file);
    await fs.copyFile(r.resolvedPath!, dest);
    copied.push(`assets/${r.ref.file}`);
  }

  return ok(
    `Rendered page to ${path.relative(ctx.cwd, outputDir) || outputDir}\n` +
    `  index.html (${result.html.length} bytes)\n` +
    `  assets/ (${copied.length} files: ${copied.join(", ")})`,
    { outputDir, html: result.html.length, assets: copied },
  );
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
      "Unified RepoChan management surface for all .repochan entities. This is the single public tool for deterministic analysis, interview reports, persona artifacts, orders, order result versions, protocol-safe reads/writes/versioning, and static page generation. Use action strings like 'analysis.run', 'interview.create', 'persona.get', 'order.list', 'order.create_result', and 'page.render' with action-specific params.",
    promptSnippet:
      "Manage all .repochan analysis, interview, persona, order, order-result, and protocol artifacts through one action-based tool.",
    promptGuidelines: [
      "Use repochan as the only RepoChan management tool. Do not look for repochan_protocol_helpers, repochan_analyze, repochan_generate_persona, repochan_create_orders, or repochan_manage_orders; those actions now live under this unified tool.",
      "RepoChan pre-checks that skills describe in text should be performed through repochan itself: call action='protocol.inspect' for workspace state, action='analysis.get' to verify analysis, action='interview.get' to verify an interview report exists (optional upstream for Persona), action='persona.get' to verify persona, action='order.list' or action='order.get' to verify order existence/status, and action='order.list_results' or action='order.get_result' to verify delivered order results.",
      "repochan is the single management surface for agents and future dashboards/panels. Prefer it over ad-hoc shell scripts for .repochan reads, writes, version lists, order status changes, revision capture, and deterministic repository analysis.",
      "Safety: repochan refuses blind overwrites. When an action has params.overwrite, set it to true only after explicit user approval. Mutating current artifacts archives prior state where appropriate; keep params.versionPrevious=true unless the user asks otherwise.",
      "Safety: keep provenance. persona.create/persona.update and order.create_result add provenance when absent; pass params.provenance when an external generator, dashboard, or human produced the artifact.",
      "Safety: protocol paths are constrained to .repochan. protocol.write and protocol.append_version must not be used to bypass entity-specific preconditions unless the user explicitly asks for protocol-level maintenance/migration.",
      "analysis.run params: optional { analysis, overwrite=false, versionPrevious=true, corePaths, focusAreas, includeSections, maxSampleFiles, maxSampleChars, perFileSampleChars, colorScanLimit, includeFileLists=true }. Runs deterministic file walking, git profile, color extraction, tech-stack detection, docs summary, inventory counts, and desensitized code sampling, then writes .repochan/analysis/current.json. If analysis exists, ask before overwrite=true.",
      "analysis.enrich params: { preAnalysis, abstract }. Merges LLM-generated preAnalysis and abstract dimension analysis into analysis/current.json. Archives the pre-enrichment version first. Do not pass documentLanguage, languageSignals, or nativeLanguage; repository language is localization metadata, not mascot identity. The Analyst must run analysis.run FIRST, then reason over the evidence, then call this action.",
      "analysis.update params: { patch, overwrite=true, versionPrevious=true, reason? }. Deep-merges patch into .repochan/analysis/current.json, archives the previous current by default, and records updatedAt/revisionReason. Use this for user-requested factual analysis corrections. Do not add nativeLanguage or language-derived mascot identity fields.",
      "analysis.get params: {}. Reads .repochan/analysis/current.json. Use before persona work when you need the upstream analysis. Fails if missing.",
      "analysis.list_versions params: {}. Lists .repochan/analysis/versions/*.json and reports whether current analysis exists.",
      "persona.get params: optional { versionId }. Without versionId, reads .repochan/persona/current.json. With versionId, reads .repochan/persona/versions/<versionId>.json (the .json suffix is optional). Use as the persona pre-flight before order or painter work.",
      "persona.create params: { persona, slug?, overwrite=false, versionPrevious=true, provenance? }. Requires analysis. Writes persona/current.json and a persona/versions/<timestamp>-<slug>.json copy. If current exists, ask before overwrite=true.",
      "persona.update params: { persona, slug?, overwrite=true, versionPrevious=true, provenance? }. Requires analysis and an existing persona/current.json. Archives previous current when versionPrevious is not false, then replaces current and writes a new version. Always obtain user approval before overwrite=true.",
      "interview.get params: optional { versionId }. Without versionId, reads .repochan/interview/current.json. With versionId, reads .repochan/interview/versions/<versionId>.json (the .json suffix is optional). Use as the interview pre-flight before persona work. Fails if missing — the interview is optional upstream, so a failure here is not a hard blocker for the Persona role; treat missing as 'no interview conducted'.",
      "interview.create params: { interview, slug?, overwrite=false, versionPrevious=true, provenance? }. Requires analysis. Writes interview/current.json and a interview/versions/<timestamp>-<slug>.json copy. The interview object must contain questions, responses, summary, keyConstraints, preferences, avoidList. If current exists, ask before overwrite=true. Used by the Interviewer role after collecting ask_user_question answers.",
      "interview.append params: { questions?, responses?, summary, keyConstraints?, preferences?, avoidList?, slug?, provenance? }. Requires analysis and an existing interview/current.json. Archives the pre-append state, appends new questions/responses to the existing arrays, and REPLACES summary/keyConstraints/preferences/avoidList (so re-synthesize over ALL answers). summary is required because it is always replaced. Use for follow-up interview rounds.",
      "order.list params: {}. Lists .repochan/orders/<orderId>/order.json with orderId, status, assetType, priority, currentVersion, and result count. Use to choose orders and check approval state.",
      "order.get params: { orderId }. Reads .repochan/orders/<orderId>/order.json. Use before Painter execution to verify status and brief.",
      "order.create params: { order } or { orders: [...] }, optional { overwrite=false }. Requires analysis and persona. Normalizes schemaVersion, status=draft, priority=normal, timestamps. Multiple orders can be created at once by passing { orders: [...] }; each writes independently to orders/<orderId>/order.json. Use for Art Director outputs, not final image generation.",
      "order.update params: { orderId, patch } or { orderId, order }, plus overwrite=true. Deep-merges the patch into the existing order and updates updatedAt. Use only after explicit approval; use order.set_status or order.add_revision for narrow routine changes.",
      "order.set_status params: { orderId, status }. status must be one of draft, approved, in_progress, delivered, needs_revision, cancelled. Updates status/updatedAt in place.",
      "order.add_revision params: { orderId, revisionRequest }. Records the user's revision text verbatim in order.revisions, sets status=needs_revision, and updates updatedAt.",
      "order.create_result params: { orderId, files?, versionId?, tool?, promptBrief?, generationPrompt?, revisedPrompt?, notes?, meta?, provenance?, setCurrent=true, overwrite=false, allowUnapprovedOrder=false, markDelivered=true }. Requires analysis, persona, and an approved/in_progress order unless allowUnapprovedOrder=true was explicitly approved. Creates orders/<orderId>/versions/<versionId>/meta.json, copies provided files into that version directory when possible, updates order.currentVersion, and normally marks the order delivered. generationPrompt must be the exact full prompt sent to image_generate; revisedPrompt should be the provider revised prompt when returned. Never store absolute filesystem paths (e.g. image-gen cache paths) in meta — only portable fields like referenceImagesUsed, references, templateId.",
      "order.list_results params: { orderId }. Lists result versions under .repochan/orders/<orderId>/versions/.",
      "order.get_result params: { orderId, versionId? }. Reads a result version meta/files. Without versionId, reads order.currentVersion.",
      "order.set_current_result params: { orderId, versionId }. Requires an existing result version. Updates order.currentVersion in place.",
      "foundation.find params: {}. Searches for a foundation/cover sheet order (assetType 'foundation_sheet' or 'cover_sheet') that has a delivered result with image files. Returns { orderId, versionId, assetType, files } or null. The Art Director and Painter use this to check whether the project already has a visual anchor before creating or executing downstream orders.",
      "template.list params: optional { tag?, query? }. Lists all available templates (built-in + project-level .repochan/templates/). Each template returns id, label, assetType, aspectRatio, grid info, and tags. Use tag to filter (e.g., tag='sticker') or query to search.",
      "template.get params: { templateId }. Returns the full template definition including dimensions, grid layout, background type, guide tags, and structural constraints. The Painter uses this to know the 'canvas spec' before writing a prompt.",
      "Template system: Templates define OUTPUT SPECIFICATIONS (canvas size, grid layout, background type, quality prefix, structural constraints) — they are NOT prompt generators. The Painter reads persona + order + references + template, then writes the full prompt themselves. Templates ensure outputs have the right structure for downstream tools (e.g., a 3×3 grid can be auto-sliced into 9 tiles). The Art Director sets templateId on each order; the Painter reads it before generating.",
      "Identity boundary: analysis.context.identity.namingSeeds is the source for mascot naming. UI/documentation language must not imply a native language, cultural name, costume tradition, prop set, or visual era.",
      "order.resolve_references params: { references: [{ orderId, versionId?, role }] }. Resolves reference entries into absolute image file paths grouped by role. Used by the Painter before generation to get the actual reference image files to inject. role is one of: character, style, composition.",
      "Visual anchor system: A 'foundation sheet' (assetType 'foundation_sheet' or 'cover_sheet') is the project's first real image output — it contains the mascot's signature pose, chibi form, expressions, and color palette on a single sheet. Every downstream order SHOULD reference it via the order.references field: [{ orderId: '<foundation-order-id>', role: 'character' }]. This ensures visual consistency across all generated assets. The Art Director creates the foundation order first; once it has a delivered result, the Art Director auto-fills references on all subsequent orders.",
      "Order references field: Each order may include a `references` array of { orderId, versionId?, role } entries. When present, the Painter resolves them via action='order.resolve_references' and passes the resulting image files as reference images to the image generation tool. Orders with assetType 'foundation_sheet' or 'cover_sheet' do NOT need references — they ARE the anchor.",
      "protocol.inspect params: {}. Inspects .repochan existence, current analysis/persona, analysis/persona versions, order directories, and order result versions without creating or mutating files.",
      "protocol.read params: { artifactPath }. Safely reads a JSON artifact inside .repochan. artifactPath may be '.repochan/analysis/current.json' or a path relative to .repochan.",
      "protocol.write params: { artifactPath, data, overwrite=false }. Safely writes JSON inside .repochan, creating parent directories. Use entity actions first; use protocol.write only for migrations, manifests, or user-directed maintenance. Ask before overwrite=true.",
      "protocol.append_version params: { artifactPath, data? }. Writes data to the conventional version location for artifactPath. If data is omitted, reads artifactPath and snapshots its current JSON. Never overwrites existing version files.",
      "page.create params: { page, slug?, overwrite=false, versionPrevious=true, provenance? }. Requires analysis. Creates or replaces .repochan/pages/current.json with a Page JSON artifact and writes a versioned copy to pages/versions/. The page object must contain: title, description, theme { primary, secondary, accent, background, style }, and sections (an array of section objects with type+variant+content). If page exists, ask before overwrite=true.",
      "page.get params: optional { versionId }. Without versionId, reads .repochan/pages/current.json. With versionId, reads pages/versions/<versionId>.json.",
      "page.check_assets params: optional { page? }. Without params.page, reads the current page and checks whether all image AssetRefs across all sections are resolvable to actual files in .repochan/orders/. Returns ok=true if all resolved, or lists missing assets with available file suggestions. Use this BEFORE page.render to verify the page is ready.",
      "page.render params: optional { page?, outputDir? }. Renders the page to static HTML. Without params.page, reads current page. Checks assets first — REFUSES to render if any are missing (run page.check_assets first). Output goes to outputDir (default: .repochan/pages/site/). Produces index.html + copies of all referenced image files to assets/. The output is a zero-JS static site that can be deployed anywhere.",
      "Page section types: navbar (simple, with-cta), hero (centered, split-right, split-left, full-bg), features (grid-2, grid-3, grid-4), stats (row, grid), gallery (grid, masonry), cta (centered, banner), footer (standard, minimal). Each section has a content object whose shape depends on type+variant.",
      "Page AssetRef: { orderId, versionId?, file, alt? }. References an image file inside .repochan/orders/<orderId>/versions/<versionId>/. When versionId is omitted, uses the order's currentVersion. The renderer copies referenced files to the output assets/ directory.",
      "Page Designer two-phase workflow: Phase 1 — design page structure + audit assets (use page.check_assets); create orders for missing images via order.create, generate via Painter. Phase 2 — when all assets are delivered, assemble final Page JSON via page.create, then render via page.render.",
      "review.create params: { orderId, versionId, verdict: 'pass'|'revise'|'reject', criteriaResults?, notes?, reviewerRole?, provenance?, overwrite=false }. Requires analysis. Creates a post-hoc review of a delivered order result version at orders/<orderId>/reviews/<versionId>.json. The versionId must reference an existing result version of the order. verdict='revise' or 'reject' pushes a DELIVERED order back to needs_revision (appends a revision record); verdict='pass' leaves status unchanged. Reviews are non-blocking — they are created AFTER delivery and never block it. To read an existing review, use protocol.read with artifactPath='orders/<orderId>/reviews/<versionId>.json'. If a review already exists for that version, pass overwrite=true to replace it (the prior review is archived).",
      "order.create_candidate params: { orderId, files?, versionId?, tool?, promptBrief?, generationPrompt?, revisedPrompt?, notes?, meta?, provenance?, overwrite?, allowUnapprovedOrder? }. Creates a parallel draft version with role=candidate. Unlike order.create_result, a candidate does NOT become currentVersion and does NOT mark the order delivered. Multiple candidates can coexist on one order. Use this when the user wants several alternative drafts to choose from. Image generation is expensive — only create candidates when the user explicitly asks for options. Each candidate can be reviewed via review.create before selection.",
      "order.promote_candidate params: { orderId, versionId }. Promotes a candidate version to current: sets currentVersion, changes the candidate's role to 'current', and demotes the previous current version (if any) to role='snapshot'. Only candidate-role versions can be promoted. At most one version is current at any time. Use after the user has reviewed candidates and chosen one.",
    ],
    parameters: RepoChanSchema,
    async execute(_toolCallId, input: RepoChanInput, _signal, _onUpdate, ctx) {
      const params = input.params ?? {};
      switch (input.action) {
        case "analysis.run":
          return runAnalysis(ctx, params);
        case "analysis.enrich":
          return enrichAnalysis(ctx, params);
        case "analysis.update":
          return updateAnalysis(ctx, params);
        case "analysis.get": {
          const data = await readJson(path.join(root(ctx.cwd), "analysis", "current.json"));
          return ok(JSON.stringify(data, null, 2), data);
        }
        case "analysis.list_versions": {
          await initProtocol(ctx.cwd);
          const current = await exists(path.join(root(ctx.cwd), "analysis", "current.json"));
          const versions = await listJsonFiles(path.join(root(ctx.cwd), "analysis", "versions"));
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
        case "interview.get": {
          const versionId = typeof params.versionId === "string" && params.versionId ? requireVersionId(params.versionId.replace(/\.json$/, "")) : undefined;
          const file = versionId
            ? path.join(root(ctx.cwd), "interview", "versions", `${versionId}.json`)
            : path.join(root(ctx.cwd), "interview", "current.json");
          const data = await readJson(file);
          return ok(JSON.stringify(data, null, 2), data);
        }
        case "interview.create":
          return createInterview(ctx, params);
        case "interview.append":
          return appendInterview(ctx, params);
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
        case "page.create":
          return createPage(ctx, params);
        case "page.get":
          return getPage(ctx, params);
        case "page.check_assets":
          return checkPageAssets(ctx, params);
        case "page.render":
          return renderPageToDisk(ctx, params);
        case "review.create":
          return createReview(ctx, params);
        case "order.create_candidate":
          return createOrderCandidateAction(ctx, params);
        case "order.promote_candidate":
          return promoteCandidateAction(ctx, params);
        default:
          throw new Error(`Unknown RepoChan action: ${(input as JsonObject).action}`);
      }
    },
  });
}

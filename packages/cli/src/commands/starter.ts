import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  createOrders,
  exists,
  listOrders,
  orderVersionDir,
  projectStarterSiteConfig,
  readJson,
  readAnalysisArtifact,
  readOrder,
  readOrderResult,
  readPersonaArtifact,
  validateStarterAssetState,
  validateStarterAssetsConfig,
  validateStarterLocaleContent,
  validateStarterLocaleShape,
  validateStarterLocaleStructures,
  validateStarterPresentationColors,
  validateStarterSiteConfig,
  type StarterAssetSlot,
  type StarterLocaleContent,
  type StarterManifest,
  type StarterPostprocessStep,
} from "@repochan/core";
import {
  chromaKeyImage,
  compressImage,
  extractAssets,
  ExtractError,
  extractIconfont,
  framesToGif,
  generateIco,
  imageFormatForExtension,
  inspectImage,
  matteColorToHex,
  parseMatteColor,
  removeImageBackground,
  resizeImage,
  sliceGridToFiles,
  type ExtractAssetsResult,
  type ExtractQaReport,
  type ExtractStrategy,
} from "@repochan/image-edit";
import { emitResult, dim, printJson, isExtractError, ApplyFailurePrintedError, type OutputOptions, UsageError } from "../lib/output.js";
import { archiveOrderDerivedRun, type OrderDerivedArchiveStep } from "../lib/order-derived-archive.js";
import {
  contextualizeImageMlCapabilityError,
  ensureImageMlCapability,
  imageMlErrorDetails,
  type ImageMlCapabilityDeps,
} from "../lib/image-ml-capability.js";
import { readDataFile } from "../lib/data-file.js";
import {
  getStarter,
  listStarters,
  listStartersFromSource,
  readStarterInstance,
  resolveStarterSource,
  type StarterMeta,
  type StarterSource,
} from "../lib/starter-loader.js";
import { getBuiltinTemplatesDir, loadAllTemplates } from "../lib/template-loader.js";
import type { TemplateData } from "../lib/template-loader.js";

type StarterOptions = OutputOptions & {
  tag?: string;
  outputDir?: string;
  starter?: string;
  overwrite?: boolean;
  contentFile?: string;
  repositoryUrl?: string;
  all?: boolean;
  foundation?: string;
  intent?: string;
  status?: string;
  order?: string;
  resultVersion?: string;
  file?: string;
  from?: string;
  localized?: boolean;
};

function outputDir(cwd: string, value?: string): string {
  return value ? path.resolve(cwd, value) : path.join(cwd, ".repochan", "web-starter");
}

function sitePath(siteDir: string, relativePath: string): string {
  const resolved = path.resolve(siteDir, relativePath);
  if (resolved !== siteDir && !resolved.startsWith(`${siteDir}${path.sep}`)) {
    throw new Error(`Starter path escapes site root: ${relativePath}`);
  }
  return resolved;
}

async function assertNoSymlinkPath(siteDir: string, relativePath: string, label: string): Promise<void> {
  const root = path.resolve(siteDir);
  sitePath(root, relativePath);
  const rootStat = await fs.lstat(root).catch(() => undefined);
  if (rootStat?.isSymbolicLink()) throw new UsageError(`${label} refuses symlink path: ${root}`);
  let current = root;
  for (const part of relativePath.split(/[\\/]+/).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch(() => undefined);
    if (!stat) break;
    if (stat.isSymbolicLink()) throw new UsageError(`${label} refuses symlink path: ${current}`);
  }
}

async function readValidatedSiteFiles(siteDir: string, manifest: StarterManifest) {
  const site = validateStarterSiteConfig(await readJson(sitePath(siteDir, manifest.config.site)));
  const assets = validateStarterAssetsConfig(await readJson(sitePath(siteDir, manifest.config.assets)));
  const locales: StarterLocaleContent[] = [];
  for (const locale of manifest.content.supportedLocales) {
    const file = path.join(sitePath(siteDir, manifest.config.i18nDir), `${locale}.json`);
    if (await exists(file)) locales.push(validateStarterLocaleContent(await readJson(file)));
  }
  return { site, assets, locales };
}

async function walkFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (["node_modules", "dist", ".astro"].includes(entry.name)) continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...await walkFiles(absolute));
    else found.push(absolute);
  }
  return found;
}

/** Injectable source resolution (tests simulate a fresh install with no cache and no bundled package). */
type StarterSourceDeps = {
  resolveSource?: () => Promise<StarterSource | null>;
};

function sourceLabel(source: StarterSource | null): string {
  if (!source) return "none";
  if (source.kind === "cache") return `cached@${source.version ?? "unknown"}`;
  if (source.kind === "bundled") return "bundled";
  return source.via === "env" ? `dir (REPOCHAN_STARTERS_DIR)` : `dir (--from)`;
}

export async function runStarterList(_cwd: string, options: StarterOptions, deps: StarterSourceDeps = {}) {
  const source = await (deps.resolveSource ?? resolveStarterSource)();
  const all = source ? await listStartersFromSource(source) : [];
  const starters = options.tag ? all.filter((starter) => starter.tags.includes(options.tag!)) : all;
  const lines = starters.map((starter) => {
    const tags = starter.tags.length ? ` [${starter.tags.join(", ")}]` : "";
    const preview = ` ${dim("•")} preview: ${starter.previews.desktop}`;
    return `  ${starter.id}  ${dim("—")} ${starter.name}${starter.default ? " (default)" : ""}${tags}${preview}`;
  });
  const header = source
    ? `Starters${options.tag ? ` tagged '${options.tag}'` : ""} (${starters.length}, source: ${sourceLabel(source)}):`
    : "Starters: none (run `repochan starter sync` to download @repochan/starters, or pass --from <dir>).";
  emitResult(options, `${header}${lines.length ? `\n${lines.join("\n")}` : ""}`, {
    starters,
    source: source ? { kind: source.kind, dir: source.dir, ...(source.version ? { version: source.version } : {}) } : { kind: "none" },
  });
}

export async function runStarterGet(_cwd: string, id: string | undefined, options: StarterOptions) {
  if (!id) throw new UsageError("starter get requires a starter id.");
  const starter = await getStarter(id);
  const lines = [
    `${starter.id} — ${starter.name}${starter.default ? " (default)" : ""}`,
    `  style: ${starter.style ?? "?"}`,
    `  tags: ${starter.tags.join(", ") || "(none)"}`,
    `  previews: ${starter.previews.desktop}, ${starter.previews.mobile}`,
    `  assets (${starter.assets.length}):`,
    ...starter.assets.map((asset) => `    ${asset.slot} → ${asset.postprocess?.map((step) => step.op).join("+") || "copy"}${asset.order ? " [order]" : ""}`),
  ];
  emitResult(options, lines.join("\n"), starter);
}

export async function runStarterPull(cwd: string, options: StarterOptions, deps: StarterSourceDeps = {}) {
  const target = outputDir(cwd, options.outputDir);
  if (options.from && options.starter) throw new UsageError("starter pull accepts either --starter <id> or --from <local-dir>, not both.");
  const localSource = options.from ? path.resolve(cwd, options.from) : undefined;
  let resolvedSource: StarterSource | null = null;
  if (!localSource) {
    resolvedSource = await (deps.resolveSource ?? resolveStarterSource)();
    if (!resolvedSource) {
      throw new UsageError(
        "No starters available: run `repochan starter sync` first.",
        "starter sync downloads @repochan/starters into ~/.repochan/starters/; alternatively pass --from <dir> or set REPOCHAN_STARTERS_DIR.",
      );
    }
  }
  let starterId: string;
  let source: string;
  if (localSource) {
    starterId = (await readStarterInstance(localSource)).id;
    source = localSource;
  } else {
    const starters = await listStartersFromSource(resolvedSource!);
    const marked = starters.filter((starter) => starter.default);
    if (marked.length > 1) throw new Error(`Multiple default starters: ${marked.map((starter) => starter.id).join(", ")}`);
    starterId = options.starter ?? marked[0]?.id ?? starters[0]?.id;
    if (!starterId) throw new Error("No starters available: run `repochan starter sync` first.");
    const selected = starters.find((starter) => starter.id === starterId);
    if (!selected) throw new Error(`Unknown starter '${starterId}'. Available: ${starters.map((starter) => starter.id).join(", ") || "(none)"}`);
    source = selected.dir;
  }
  if (path.resolve(target) === path.resolve(source)) {
    return void emitResult(options, `Starter already present at ${target}.`, { outputDir: target, starter: starterId, generated: false });
  }
  const relativeTarget = path.relative(source, target);
  if (relativeTarget && !relativeTarget.startsWith(`..${path.sep}`) && relativeTarget !== ".." && !path.isAbsolute(relativeTarget)) {
    throw new UsageError(`Starter output cannot be inside its source directory: ${target}`);
  }
  if (await exists(target)) {
    if (!options.overwrite) throw new UsageError(`outputDir exists: ${target}. Pass --overwrite to replace.`);
    await fs.rm(target, { recursive: true, force: true });
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, {
    recursive: true,
    filter: async (src) => {
      const stat = await fs.lstat(src);
      if (stat.isSymbolicLink()) throw new UsageError(`Starter source refuses symlink path: ${src}`);
      const parts = path.relative(source, src).split(path.sep);
      return !parts.some((part) => ["node_modules", "dist", ".astro", ".DS_Store"].includes(part));
    },
  });
  emitResult(options, `Scaffolded ${starterId} starter → ${target}`, { outputDir: target, starter: starterId, generated: true });
}

export async function runStarterConfigure(cwd: string, options: StarterOptions) {
  const target = outputDir(cwd, options.outputDir);
  const manifest = await readStarterInstance(target);
  const defaults = validateStarterSiteConfig(await readJson(sitePath(target, manifest.config.site)));
  const analysisPath = path.join(cwd, ".repochan", "analysis", "current.json");
  const personaPath = path.join(cwd, ".repochan", "persona", "current.json");
  if (!(await exists(analysisPath)) || !(await exists(personaPath))) {
    throw new UsageError("starter configure requires analysis and persona.", "Run `repochan analysis run` and create a persona first.");
  }
  const [analysis, persona] = await Promise.all([
    readAnalysisArtifact(cwd),
    readPersonaArtifact(cwd),
  ]);
  const configured = validateStarterSiteConfig(projectStarterSiteConfig({
    analysis,
    persona,
    defaults,
    repositoryUrl: options.repositoryUrl,
  }));
  const pendingContent: Array<{ content: StarterLocaleContent; file: string }> = [];
  if (options.contentFile) {
    const payload = readDataFile(options.contentFile);
    const rawLocales = payload.locales && typeof payload.locales === "object"
      ? Object.values(payload.locales as Record<string, unknown>)
      : [payload];
    for (const raw of rawLocales) {
      const content = validateStarterLocaleContent(raw);
      if (!manifest.content.supportedLocales.includes(content.locale)) throw new UsageError(`Unsupported locale for ${manifest.id}: ${content.locale}`);
      const file = path.join(sitePath(target, manifest.config.i18nDir), `${content.locale}.json`);
      if (!(await exists(file))) throw new UsageError(`Starter locale template does not exist: ${file}`);
      const template = validateStarterLocaleContent(await readJson(file));
      const shapeIssues = validateStarterLocaleShape(template, content);
      if (shapeIssues.length) {
        throw new UsageError(`Locale content shape does not match ${content.locale} template:\n${shapeIssues.map((issue) => `- ${issue}`).join("\n")}`);
      }
      if ((await exists(file)) && !options.overwrite) throw new UsageError(`Content exists: ${file}. Pass --overwrite to replace.`);
      pendingContent.push({ content, file });
    }
  }
  await fs.writeFile(sitePath(target, manifest.config.site), `${JSON.stringify(configured, null, 2)}\n`);
  const written: string[] = [manifest.config.site];
  for (const { content, file } of pendingContent) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(content, null, 2)}\n`);
    written.push(path.relative(target, file));
  }
  emitResult(options, `Configured starter ${manifest.id}: ${written.join(", ")}`, { starter: manifest.id, outputDir: target, written, site: configured });
}

function slugOrderId(slot: string, existing: Set<string>): string {
  let counter = 1;
  while (existing.has(`ord-${slot}-${String(counter).padStart(3, "0")}`)) counter += 1;
  return `ord-${slot}-${String(counter).padStart(3, "0")}`;
}

function getSlot(manifest: StarterManifest, slotName: string | undefined): StarterAssetSlot {
  if (!slotName) throw new UsageError("A starter asset slot is required.");
  const slot = manifest.assets.find((item) => item.slot === slotName);
  if (!slot) throw new UsageError(`Unknown starter asset slot '${slotName}'. Available: ${manifest.assets.map((item) => item.slot).join(", ")}`);
  return slot;
}

function gridTemplateIssue(slot: StarterAssetSlot, template: TemplateData | undefined): string | undefined {
  if (slot.kind !== "bundle") return undefined;
  const step = slot.postprocess?.find((item) => item.op === "extract-grid");
  if (!step) return undefined;
  if (!template) return `${slot.slot}: unknown templateId ${slot.order?.templateId ?? "(none)"}`;
  const rows = Number(step.args?.rows);
  const cols = Number(step.args?.cols);
  if (!template.grid) return `${slot.slot}: template ${template.id} does not declare a grid`;
  if (template.grid.rows !== rows || template.grid.cols !== cols) {
    return `${slot.slot}: extract-grid ${rows}x${cols} does not match template ${template.id} ${template.grid.rows}x${template.grid.cols}`;
  }
  const expected = template.grid.cellKeys;
  if (!expected?.length) return `${slot.slot}: template ${template.id} does not declare grid.cell_keys`;
  const publications = slot.publications;
  if (expected.length !== publications.length || expected.some((key, cell) => publications.find((item) => item.cell === cell)?.key !== key)) {
    return `${slot.slot}: publications do not match template ${template.id} grid.cell_keys`;
  }
  return undefined;
}

export async function runStarterCreateOrder(cwd: string, slotName: string | undefined, options: StarterOptions) {
  const target = outputDir(cwd, options.outputDir);
  const manifest = await readStarterInstance(target);
  const slot = getSlot(manifest, slotName);
  if (!slot.order) throw new UsageError(`Starter slot '${slot.slot}' does not declare an order.`);
  if (!slot.order.assetType || !slot.order.templateId) throw new UsageError(`Starter slot '${slot.slot}' order requires assetType and templateId.`);
  const templates = await loadAllTemplates(await getBuiltinTemplatesDir(), cwd);
  const templateIssue = gridTemplateIssue(slot, templates.find((template) => template.id === slot.order!.templateId));
  if (templateIssue) throw new UsageError(templateIssue);
  if (!options.intent?.trim()) throw new UsageError("starter create-order requires --intent <text>.");
  const listed = await listOrders(cwd);
  const existingIds = new Set(listed.orders.map((order: any) => String(order.orderId)));
  const orderId = slugOrderId(slot.slot, existingIds);
  const references = [...(slot.order.references ?? [])] as Array<Record<string, unknown>>;
  let referenceWarning: string | undefined;
  if (slot.reference && !references.some((reference) => reference.type === "file")) {
    if (slot.reference.startsWith("slot:")) {
      // `slot:<name>` resolves to the referenced scalar slot's current asset
      // state: assets.json src is a served URL path (`/assets/x.webp`), which
      // maps back to the site file under `public/`.
      const targetSlot = slot.reference.slice("slot:".length);
      const assets = validateStarterAssetsConfig(await readJson(sitePath(target, manifest.config.assets)));
      const state = assets.assets[targetSlot];
      if (!state) throw new UsageError(`starter create-order: slot reference '${slot.reference}' has no asset state in ${manifest.config.assets}.`);
      if (state.kind !== "scalar") throw new UsageError(`starter create-order: slot reference '${slot.reference}' must resolve to a scalar asset state.`);
      references.unshift({ type: "file", path: sitePath(target, path.join("public", state.src.replace(/^\//, ""))), role: "composition" });
      if (state.status === "source") {
        referenceWarning = `slot reference '${slot.reference}' resolved to the starter source asset (${state.src}); run starter create-order + asset-apply for '${targetSlot}' first if this order must stay consistent with its regenerated image.`;
      }
    } else {
      references.unshift({ type: "file", path: sitePath(target, slot.reference), role: "composition" });
    }
  } else {
    for (const reference of references) {
      if (reference.type === "file" && typeof reference.path === "string") reference.path = sitePath(target, reference.path);
    }
  }
  if (options.foundation) references.push({ type: "order", orderId: options.foundation, role: "character" });
  const mustInclude = slot.order.brief?.mustInclude ?? [];
  const order = {
    orderId,
    status: options.status ?? "draft",
    requestType: "new_asset",
    assetType: slot.order.assetType,
    templateId: slot.order.templateId,
    brief: {
      intent: options.intent.trim(),
      mustInclude,
      avoid: slot.order.brief?.avoid ?? [],
      creativeFreedom: slot.order.brief?.creativeFreedom ?? [],
    },
    deliverables: slot.order.deliverables ?? [],
    acceptanceCriteria: [...mustInclude],
    references,
  };
  const result = await createOrders(cwd, { order });
  emitResult(options, `Created starter order ${orderId} for ${slot.slot}.${referenceWarning ? `\nwarning: ${referenceWarning}` : ""}`, {
    ...result,
    orderId,
    slot: slot.slot,
    ...(referenceWarning ? { referenceWarning } : {}),
  });
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number).filter((item) => Number.isFinite(item) && item > 0) : [];
}

async function applyStep(step: StarterPostprocessStep, sourceFiles: string[], out: string, overwrite: boolean): Promise<void> {
  const source = sourceFiles[0];
  const args = step.args ?? {};
  switch (step.op) {
    case "compress":
      await compressImage(source, out, { format: args.format as any, quality: Number(args.quality) || undefined, maxWidth: Number(args.maxWidth) || undefined, overwrite });
      return;
    case "chroma-key": {
      const parsed = parseMatteColor(String(args.matte ?? "auto"));
      await chromaKeyImage(source, out, { matteColor: parsed as any, pipeline: args.pipeline === "v1" ? "v1" : args.pipeline === "v2" ? "v2" : undefined, threshold: Number(args.threshold) || undefined, softness: Number(args.softness) || undefined, spillSuppression: Number(args.spill) || undefined });
      return;
    }
    case "bg-remove":
      await removeImageBackground(source, out, { model: (args.model as any) ?? "small", overwrite });
      return;
    case "slice":
      await sliceGridToFiles(source, out, { rows: Number(args.rows), cols: Number(args.cols), padding: Number(args.padding) || 0, overwrite });
      return;
    case "resize":
      await resizeImage(source, out, { targets: numbers(args.sizes).map((width) => ({ width })), fit: args.fit as any, overwrite });
      return;
    case "favicon":
      await generateIco(source, out, { sizes: numbers(args.sizes), overwrite });
      return;
    case "gif-from-frames":
      await framesToGif(sourceFiles, out, { fps: Number(args.fps) || undefined, loop: Number(args.loop) || undefined, overwrite });
      return;
    case "extract-grid":
      throw new Error("extract-grid is a starter bundle operation and cannot run as a scalar postprocess step.");
    case "iconfont":
      await extractIconfont(source, out, {
        rows: args.rows !== undefined ? Number(args.rows) : undefined,
        cols: args.cols !== undefined ? Number(args.cols) : undefined,
        mapping: args.mapping as any,
        chroma: {
          pipeline: args.pipeline === "v1" ? "v1" : args.pipeline === "v2" ? "v2" : undefined,
          matteSelect: args.matteSelect as any,
        },
        normalizeSize: args.normalizeSize !== undefined ? Number(args.normalizeSize) : undefined,
        viewBox: args.viewBox !== undefined ? Number(args.viewBox) : undefined,
        overwrite,
      });
      return;
  }
}

type GridApplyResult = ExtractAssetsResult;

async function stageGridBundle(
  slot: StarterAssetSlot & { kind: "bundle" },
  step: StarterPostprocessStep,
  source: string,
  tempRoot: string,
): Promise<GridApplyResult> {
  const args = step.args ?? {};
  const publications = slot.publications;
  const mapping = Object.fromEntries(publications.map((item) => [item.key, item.cell]));
  const chroma = args.chroma && typeof args.chroma === "object" ? { ...(args.chroma as Record<string, unknown>) } : {};
  if (typeof chroma.matteColor === "string") chroma.matteColor = parseMatteColor(chroma.matteColor);
  const extractedDir = sitePath(tempRoot, step.out);
  // Call extractAssets directly (not the extractMatteGrid compat wrapper) so
  // the full strategy/geometry/hybrid args pass through and ExtractError keeps
  // its structured defects/qa for the asset-apply failure envelope.
  const result = await extractAssets(source, extractedDir, {
    strategy: (args.strategy as ExtractStrategy | undefined) ?? "chroma-grid",
    rows: Number(args.rows),
    cols: Number(args.cols),
    mapping,
    subset: args.subset as readonly string[] | undefined,
    chroma: chroma as any,
    geometry: args.geometry as any,
    normalize: args.normalize as any,
    qa: args.qa as any,
    hybrid: args.hybrid as any,
    format: args.format as "png" | "webp" | undefined,
    quality: args.quality !== undefined ? Number(args.quality) : undefined,
    overwrite: true,
    maxDimension: args.maxDimension !== undefined ? Number(args.maxDimension) : undefined,
  });
  const byKey = new Map(result.items.map((item) => [item.key, item]));
  for (const publication of publications) {
    const item = byKey.get(publication.key);
    if (!item) throw new Error(`extract-grid did not produce publication '${publication.key}'.`);
    const staged = sitePath(tempRoot, publication.output);
    await fs.mkdir(path.dirname(staged), { recursive: true });
    if (path.resolve(item.path) !== path.resolve(staged)) await fs.copyFile(item.path, staged);
  }
  return result;
}

async function publishFilesWithRollback(
  target: string,
  tempRoot: string,
  relativePaths: string[],
): Promise<void> {
  const backupRoot = path.join(tempRoot, ".backup");
  const changed: Array<{ destination: string; backup?: string }> = [];
  try {
    for (const [index, relative] of relativePaths.entries()) {
      await assertNoSymlinkPath(tempRoot, relative, "Starter staged output");
      await assertNoSymlinkPath(target, relative, "Starter publish destination");
      const staged = sitePath(tempRoot, relative);
      const destination = sitePath(target, relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      let backup: string | undefined;
      if (await exists(destination)) {
        backup = path.join(backupRoot, String(index));
        await fs.mkdir(path.dirname(backup), { recursive: true });
        await fs.rename(destination, backup);
      }
      changed.push({ destination, backup });
      await fs.rename(staged, destination);
    }
  } catch (error) {
    for (const item of changed.reverse()) {
      await fs.rm(item.destination, { recursive: true, force: true }).catch(() => undefined);
      if (item.backup) {
        await fs.mkdir(path.dirname(item.destination), { recursive: true });
        await fs.rename(item.backup, item.destination).catch(() => undefined);
      }
    }
    throw error;
  }
}

/**
 * Recover an ExtractError thrown by image-edit's extractAssets: instanceof
 * first, then the duck-typed isExtractError fallback, walking the cause chain
 * in case stageGridBundle (or a future wrapper) re-throws a wrapped error
 * (design "Structured failure plumbing").
 */
function asExtractError(error: unknown): ExtractError | { message: string; defects: unknown[]; qa?: unknown } | undefined {
  let current: unknown = error;
  while (current !== undefined && current !== null) {
    if (current instanceof ExtractError) return current;
    if (isExtractError(current)) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function imageMlRequirement(slot: StarterAssetSlot, gridStep: StarterPostprocessStep | undefined): string | undefined {
  if (slot.kind === "bundle") {
    const strategy = gridStep?.args?.strategy;
    if (strategy === "ml-blobs" || strategy === "hybrid") return `starter asset-apply slot ${slot.slot} (extract-grid:${strategy})`;
    return undefined;
  }
  const mlStep = slot.postprocess?.find((step) => step.op === "bg-remove");
  return mlStep ? `starter asset-apply slot ${slot.slot} (${mlStep.op})` : undefined;
}

/**
 * Archive a completed asset-apply into the order's derived/ audit copy and
 * append derived.json. Runs AFTER publishFilesWithRollback, so published
 * outputs are read back from the site while intermediate step outputs are
 * still staged in tempRoot. Never touches the immutable versions/ directory.
 * The copy + append mechanics are shared with `order extract` via
 * archiveOrderDerivedRun; this function only binds the apply context
 * (slot / starter / per-step source bases) into that shared run.
 */
async function archiveDerivedApply(input: {
  cwd: string;
  orderId: string;
  manifest: StarterManifest;
  slot: StarterAssetSlot;
  gridStep?: StarterPostprocessStep;
  versionId: string;
  tempRoot: string;
  target: string;
  publicationOutputs: string[];
}): Promise<string> {
  const published = new Set(input.publicationOutputs);
  const steps: OrderDerivedArchiveStep[] = [];
  if (input.slot.kind === "bundle" && input.gridStep) {
    steps.push({
      op: input.gridStep.op,
      ...(input.gridStep.args !== undefined ? { args: input.gridStep.args } : {}),
      out: input.gridStep.out,
      ...(input.gridStep.keep !== undefined ? { keep: input.gridStep.keep } : {}),
      copies: input.gridStep.keep === false
        ? []
        : input.slot.publications.map((publication) => ({ out: publication.output, sourceBase: input.target })),
    });
  } else if (input.slot.kind === "scalar") {
    for (const step of input.slot.postprocess ?? []) {
      steps.push({
        op: step.op,
        ...(step.args !== undefined ? { args: step.args } : {}),
        out: step.out,
        ...(step.keep !== undefined ? { keep: step.keep } : {}),
        // Published outputs were renamed out of tempRoot into the site;
        // intermediate step outputs are still staged in tempRoot.
        copies: step.keep === false ? [] : [{ out: step.out, sourceBase: published.has(step.out) ? input.target : input.tempRoot }],
      });
    }
  }
  return await archiveOrderDerivedRun({
    cwd: input.cwd,
    orderId: input.orderId,
    slot: input.slot.slot,
    starter: input.manifest.id,
    resultVersion: input.versionId,
    archiveLabel: input.slot.slot,
    steps,
  });
}

export async function runStarterAssetApply(
  cwd: string,
  slotName: string | undefined,
  options: StarterOptions,
  deps: ImageMlCapabilityDeps = {},
) {
  const target = outputDir(cwd, options.outputDir);
  await assertNoSymlinkPath(target, "", "Starter target");
  const manifest = await readStarterInstance(target);
  const slot = getSlot(manifest, slotName);
  if (!options.order) throw new UsageError("starter asset-apply requires --order <orderId>.");
  const order = await readOrder(cwd, options.order);
  if (order.status !== "delivered") throw new UsageError(`Order ${options.order} must be delivered before asset-apply (status: ${order.status}).`);
  if (slot.order?.templateId && order.templateId !== slot.order.templateId) {
    throw new UsageError(`Order ${options.order} uses template ${order.templateId ?? "(none)"}; slot ${slot.slot} requires ${slot.order.templateId}.`);
  }
  if (slot.order?.assetType && order.assetType !== slot.order.assetType) {
    throw new UsageError(`Order ${options.order} has assetType ${order.assetType ?? "(none)"}; slot ${slot.slot} requires ${slot.order.assetType}.`);
  }
  if (slot.order?.templateId) {
    const templates = await loadAllTemplates(await getBuiltinTemplatesDir(), cwd);
    const templateIssue = gridTemplateIssue(slot, templates.find((template) => template.id === slot.order!.templateId));
    if (templateIssue) throw new UsageError(templateIssue);
  }
  const result = await readOrderResult(cwd, options.order, options.resultVersion);
  const versionDir = orderVersionDir(cwd, options.order, result.version.versionId);
  const sourceFiles = result.version.files.map((file) => path.isAbsolute(file) ? file : path.join(versionDir, file));
  if (!sourceFiles.length || !(await exists(sourceFiles[0]))) throw new UsageError(`Order ${options.order}/${result.version.versionId} has no readable result files.`);
  const publicationOutputs = slot.kind === "bundle" ? slot.publications.map((item) => item.output) : [slot.output];
  for (const output of publicationOutputs) {
    await assertNoSymlinkPath(target, output, "Starter asset output");
    const finalPath = sitePath(target, output);
    if ((await exists(finalPath)) && !options.overwrite) throw new UsageError(`Starter asset output exists: ${finalPath}. Pass --overwrite to replace.`);
  }

  const gridStep = slot.kind === "bundle" ? slot.postprocess.find((step) => step.op === "extract-grid") : undefined;
  const mlRequiredBy = imageMlRequirement(slot, gridStep);
  const tempRoot = await fs.mkdtemp(path.join(target, ".repochan-starter-"));
  try {
    if (mlRequiredBy) await ensureImageMlCapability(mlRequiredBy, deps);
    let gridResult: GridApplyResult | undefined;
    if (slot.kind === "bundle") {
      if (!gridStep) throw new Error(`Bundle slot '${slot.slot}' is missing its validated extract-grid step.`);
      gridResult = await stageGridBundle(slot, gridStep, sourceFiles[0], tempRoot);
    } else if (slot.postprocess?.length) {
      let stepSources = sourceFiles;
      for (const step of slot.postprocess) {
        const stepOut = sitePath(tempRoot, step.out);
        await assertNoSymlinkPath(tempRoot, step.out, "Starter postprocess output");
        await applyStep(step, stepSources, stepOut, true);
        stepSources = [stepOut];
      }
    } else if (slot.kind === "scalar") {
      const tempOut = sitePath(tempRoot, slot.output);
      await fs.mkdir(path.dirname(tempOut), { recursive: true });
      await fs.copyFile(sourceFiles[0], tempOut);
    }
    for (const output of publicationOutputs) {
      if (!(await exists(sitePath(tempRoot, output)))) throw new Error(`Postprocess did not produce declared output: ${output}`);
    }

    const assetsPath = sitePath(target, manifest.config.assets);
    await assertNoSymlinkPath(target, manifest.config.assets, "Starter assets config");
    const assets = validateStarterAssetsConfig(await readJson(assetsPath));
    if (slot.kind === "bundle") {
      if (!gridResult) throw new Error(`Bundle slot '${slot.slot}' did not produce an extract-grid result.`);
      const items = Object.fromEntries(slot.publications.map((publication) => {
        const item = gridResult.items.find((candidate) => candidate.key === publication.key);
        if (!item) throw new Error(`extract-grid did not produce publication '${publication.key}'.`);
        return [publication.key, {
          src: `/${publication.output.replace(/^public\//, "")}`,
          status: "customized" as const,
          orderId: options.order,
          versionId: result.version.versionId,
          qa: { ...item.qa, geometry: item.geometry },
        }];
      }));
      assets.assets[slot.slot] = {
        kind: "bundle",
        status: "customized",
        orderId: options.order,
        versionId: result.version.versionId,
        qa: { rows: gridResult.rows, cols: gridResult.cols, matteColor: gridResult.matteColor, matteColorSource: gridResult.matteColorSource },
        items,
      };
    } else {
      assets.assets[slot.slot] = {
        kind: "scalar",
        src: `/${slot.output.replace(/^public\//, "")}`,
        status: "customized",
        orderId: options.order,
        versionId: result.version.versionId,
      };
    }
    const stagedAssets = sitePath(tempRoot, manifest.config.assets);
    await fs.mkdir(path.dirname(stagedAssets), { recursive: true });
    await fs.writeFile(stagedAssets, `${JSON.stringify(assets, null, 2)}\n`);
    await publishFilesWithRollback(target, tempRoot, [...publicationOutputs, manifest.config.assets]);
    // Derived archive (audit bypass): copy kept step artifacts into the order's
    // derived/ and append derived.json. Archiving is best-effort — a failure
    // here (e.g. unwritable order dir) must not fail the apply itself.
    let derivedArchiveDir: string | undefined;
    let derivedWarning: string | undefined;
    try {
      derivedArchiveDir = await archiveDerivedApply({
        cwd,
        orderId: options.order,
        manifest,
        slot,
        gridStep,
        versionId: result.version.versionId,
        tempRoot,
        target,
        publicationOutputs,
      });
    } catch (archiveError) {
      derivedWarning = `derived archive failed: ${archiveError instanceof Error ? archiveError.message : String(archiveError)}`;
    }
    emitResult(options, `Applied ${options.order}/${result.version.versionId} → ${publicationOutputs.join(", ")}${derivedWarning ? `\nwarning: ${derivedWarning}` : ""}`, {
      starter: manifest.id,
      slot: slot.slot,
      outputs: publicationOutputs.map((output) => sitePath(target, output)),
      orderId: options.order,
      versionId: result.version.versionId,
      ...(derivedArchiveDir ? { derived: derivedArchiveDir } : {}),
      ...(derivedWarning ? { derivedWarning } : {}),
    });
  } catch (err) {
    // Apply failure envelope (design "Structured failure plumbing", PR5): the
    // apply layer owns slot/orderId context, so the structured JSON is printed
    // here and main() skips its own printError via the sentinel.
    const missingImageMl = contextualizeImageMlCapabilityError(
      err,
      mlRequiredBy ?? `starter asset-apply slot ${slot.slot}`,
    );
    if (missingImageMl) {
      if (options.json) {
        printJson({
          ...imageMlErrorDetails(missingImageMl),
          command: "starter asset-apply",
          slot: slot.slot,
          orderId: options.order,
          resultVersion: result.version.versionId,
        });
        throw new ApplyFailurePrintedError(missingImageMl);
      }
      throw missingImageMl;
    }
    const extractError = asExtractError(err);
    if (extractError && options.json) {
      const qa = extractError.qa as ExtractQaReport | undefined;
      const declaredStrategy = gridStep?.args?.strategy;
      printJson({
        ok: false,
        error: "ExtractError",
        command: "starter asset-apply",
        slot: slot.slot,
        orderId: options.order,
        resultVersion: result.version.versionId,
        defects: extractError.defects,
        strategyUsed: qa?.strategyUsed ?? (typeof declaredStrategy === "string" ? declaredStrategy : "chroma-grid"),
        pipeline: qa?.pipeline ?? "v2",
        ...(qa?.matte ? { matteColor: matteColorToHex(qa.matte.matte), matteColorSource: qa.matte.source } : {}),
        qa: qa ?? null,
      });
      throw new ApplyFailurePrintedError(err);
    }
    throw err;
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

function portableSourcePath(cwd: string, source: string): string {
  const relative = path.relative(cwd, source);
  if (relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join("/");
  }
  return source;
}

export async function runStarterAssetImport(cwd: string, slotName: string | undefined, options: StarterOptions) {
  const target = outputDir(cwd, options.outputDir);
  await assertNoSymlinkPath(target, "", "Starter target");
  const manifest = await readStarterInstance(target);
  const slot = getSlot(manifest, slotName);
  if (slot.kind === "bundle") {
    throw new UsageError(`starter asset-import supports scalar slots only; '${slot.slot}' declares bundle publications. Use starter asset-apply with its delivered grid order.`);
  }
  if (!options.file?.trim()) throw new UsageError("starter asset-import requires --file <path>.");
  const source = path.resolve(cwd, options.file);
  const sourceStat = await fs.stat(source).catch(() => undefined);
  if (!sourceStat?.isFile()) throw new UsageError(`Local asset file does not exist or is not a file: ${source}`);
  const sourceFormat = imageFormatForExtension(source);
  const outputFormat = imageFormatForExtension(slot.output);
  if (!sourceFormat || !outputFormat) {
    throw new UsageError(`starter asset-import supports PNG, JPEG, WebP, AVIF, and GIF images; source or slot extension is unsupported.`);
  }
  const inspected = await inspectImage(source);
  if (inspected.format !== sourceFormat) {
    throw new UsageError(`Local asset bytes are ${inspected.format}, but the source extension declares ${sourceFormat}: ${source}`);
  }
  if (inspected.format !== outputFormat) {
    throw new UsageError(`Local asset format ${inspected.format} does not match slot output format ${outputFormat}: ${slot.output}`);
  }
  const destination = sitePath(target, slot.output);
  await assertNoSymlinkPath(target, slot.output, "Starter asset output");
  if ((await exists(destination)) && !options.overwrite) {
    throw new UsageError(`Starter asset output exists: ${destination}. Pass --overwrite to replace.`);
  }

  const contents = await fs.readFile(source);
  const provenance = {
    kind: "local-file" as const,
    sourcePath: portableSourcePath(cwd, source),
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
  const assetsPath = sitePath(target, manifest.config.assets);
  await assertNoSymlinkPath(target, manifest.config.assets, "Starter assets config");
  const assets = validateStarterAssetsConfig(await readJson(assetsPath));
  assets.assets[slot.slot] = {
    kind: "scalar",
    src: `/${slot.output.replace(/^public\//, "")}`,
    status: "customized",
    provenance,
  };
  // Validate the complete new state before touching either destination file.
  validateStarterAssetsConfig(assets);

  const tempRoot = await fs.mkdtemp(path.join(target, ".repochan-starter-"));
  try {
    const stagedOutput = sitePath(tempRoot, slot.output);
    await fs.mkdir(path.dirname(stagedOutput), { recursive: true });
    await fs.writeFile(stagedOutput, contents);
    const stagedAssets = sitePath(tempRoot, manifest.config.assets);
    await fs.mkdir(path.dirname(stagedAssets), { recursive: true });
    await fs.writeFile(stagedAssets, `${JSON.stringify(assets, null, 2)}\n`);
    await publishFilesWithRollback(target, tempRoot, [slot.output, manifest.config.assets]);
    emitResult(options, `Imported ${provenance.sourcePath} → ${slot.output}`, {
      starter: manifest.id,
      slot: slot.slot,
      output: destination,
      provenance,
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function validateStarterDir(cwd: string, starter: StarterMeta, options: { localized?: boolean } = {}): Promise<string[]> {
  const issues: string[] = [];
  const files = await walkFiles(starter.dir);
  for (const asset of starter.assets) {
    // `slot:` references point at another slot's runtime asset state, not a
    // file inside the starter directory, so they skip the existence check.
    if (asset.reference && !asset.reference.startsWith("slot:") && !(await exists(sitePath(starter.dir, asset.reference)))) issues.push(`${asset.slot}: missing reference ${asset.reference}`);
    if (asset.required && asset.kind === "scalar" && !(await exists(sitePath(starter.dir, asset.output)))) {
      issues.push(`${asset.slot}: missing fallback output ${asset.output}`);
    }
    if (asset.required && asset.kind === "bundle") {
      for (const publication of asset.publications) {
        if (!(await exists(sitePath(starter.dir, publication.output)))) issues.push(`${asset.slot}: missing fallback output ${publication.output}`);
      }
    }
  }
  for (const [name, preview] of Object.entries(starter.previews)) {
    const previewStat = await fs.stat(sitePath(starter.dir, preview)).catch(() => undefined);
    if (!previewStat?.isFile()) issues.push(`${name} preview must be a regular file: ${preview}`);
  }
  const templates = await loadAllTemplates(await getBuiltinTemplatesDir(), cwd);
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  for (const asset of starter.assets) {
    if (asset.order?.templateId && !templatesById.has(asset.order.templateId)) issues.push(`${asset.slot}: unknown templateId ${asset.order.templateId}`);
    const templateIssue = gridTemplateIssue(asset, asset.order?.templateId ? templatesById.get(asset.order.templateId) : undefined);
    if (templateIssue && !issues.includes(templateIssue)) issues.push(templateIssue);
  }
  try {
    const { site, assets, locales } = await readValidatedSiteFiles(starter.dir, starter);
    if (site.locales.default !== starter.content.defaultLocale) issues.push(`site default locale does not match manifest: ${site.locales.default}`);
    if (site.locales.supported.join("\0") !== starter.content.supportedLocales.join("\0")) issues.push("site supported locales do not match manifest");
    const relativeFiles = files.map((file) => path.relative(starter.dir, file).split(path.sep).join("/"));
    issues.push(...validateStarterAssetState(starter, assets, relativeFiles, { requireCustomized: options.localized }));
    issues.push(...validateStarterLocaleStructures(starter, locales));
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  const presentationExtensions = new Set([".astro", ".css", ".js", ".mjs", ".ts", ".tsx"]);
  const sourceFiles = await Promise.all(files.filter((file) => presentationExtensions.has(path.extname(file))).map(async (file) => ({
    path: path.relative(starter.dir, file).split(path.sep).join("/"),
    content: await fs.readFile(file, "utf8"),
  })));
  issues.push(...validateStarterPresentationColors(sourceFiles).map((violation) => `${violation.path}:${violation.line} ${violation.kind}: ${violation.match}`));
  return issues;
}

export async function runStarterValidate(cwd: string, id: string | undefined, options: StarterOptions) {
  let targets: StarterMeta[];
  if (options.outputDir) targets = [await readStarterInstance(outputDir(cwd, options.outputDir))];
  else if (options.all) targets = await listStarters();
  else if (id) targets = [await getStarter(id)];
  else throw new UsageError("Usage: repochan starter validate <id> | --all | --output-dir <dir>");
  const results = [];
  for (const target of targets) results.push({ id: target.id, dir: target.dir, issues: await validateStarterDir(cwd, target, { localized: options.localized }) });
  const issueCount = results.reduce((total, result) => total + result.issues.length, 0);
  if (issueCount) throw new UsageError(`Starter validation failed (${issueCount} issue${issueCount === 1 ? "" : "s"}):\n${results.flatMap((result) => result.issues.map((issue) => `- ${result.id}: ${issue}`)).join("\n")}`);
  emitResult(options, `Starter validation passed (${results.length} starter${results.length === 1 ? "" : "s"}).`, { valid: true, starters: results });
}

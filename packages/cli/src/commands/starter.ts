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
  readOrder,
  readOrderResult,
  validateStarterAssetState,
  validateStarterAssetsConfig,
  validateStarterContentRequirements,
  validateStarterLocaleContent,
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
  extractStickersFromImage,
  extractMatteGrid,
  framesToGif,
  generateIco,
  imageFormatForExtension,
  inspectImage,
  parseMatteColor,
  removeImageBackground,
  resizeImage,
  sliceGridToFiles,
} from "@repochan/image-edit";
import { emitResult, dim, type OutputOptions, UsageError } from "../lib/output.js";
import { readDataFile } from "../lib/data-file.js";
import {
  getDefaultStarterId,
  getStarter,
  getStarterDir,
  listStarters,
  readStarterInstance,
  type StarterMeta,
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

export async function runStarterList(_cwd: string, options: StarterOptions) {
  const all = await listStarters();
  const starters = options.tag ? all.filter((starter) => starter.tags.includes(options.tag!)) : all;
  const lines = starters.map((starter) => {
    const tags = starter.tags.length ? ` [${starter.tags.join(", ")}]` : "";
    const sections = starter.capabilities?.sections.map((section) => section.id).join(", ");
    const coverage = sections ? ` ${dim("•")} sections: ${sections}` : ` ${dim("•")} sections: undeclared`;
    return `  ${starter.id}  ${dim("—")} ${starter.name}${starter.default ? " (default)" : ""}${tags}${coverage}`;
  });
  emitResult(options, `Starters${options.tag ? ` tagged '${options.tag}'` : ""} (${starters.length}):${lines.length ? `\n${lines.join("\n")}` : ""}`, { starters });
}

export async function runStarterGet(_cwd: string, id: string | undefined, options: StarterOptions) {
  if (!id) throw new UsageError("starter get requires a starter id.");
  const starter = await getStarter(id);
  const sections = starter.capabilities?.sections ?? [];
  const transitions = starter.capabilities?.transitions ?? [];
  const lines = [
    `${starter.id} — ${starter.name}${starter.default ? " (default)" : ""}`,
    `  style: ${starter.style ?? "?"}`,
    `  tags: ${starter.tags.join(", ") || "(none)"}`,
    `  sections (${sections.length}):${sections.length ? "" : " undeclared"}`,
    ...sections.map((section) => {
      const required = section.required ? "required" : "optional";
      const layers = `baked=${section.bakedLayers.join("+") || "none"}, live=${section.liveLayers.join("+") || "none"}`;
      return `    ${section.id} [${required}] ${dim("—")} ${section.recipe}; ${layers}; responsive=${section.responsive.mode}`;
    }),
    `  transitions (${transitions.length}):${transitions.length ? "" : " none"}`,
    ...transitions.map((transition) => `    ${transition.from} → ${transition.to} [${transition.kind}]`),
    `  assets (${starter.assets.length}):`,
    ...starter.assets.map((asset) => `    ${asset.slot} → ${asset.postprocess?.map((step) => step.op).join("+") || "copy"}${asset.order ? " [order]" : ""}`),
  ];
  emitResult(options, lines.join("\n"), starter);
}

export async function runStarterPull(cwd: string, options: StarterOptions) {
  const target = outputDir(cwd, options.outputDir);
  const starterId = options.starter ?? await getDefaultStarterId();
  const source = await getStarterDir(starterId);
  if (path.resolve(target) === path.resolve(source)) {
    return void emitResult(options, `Starter already present at ${target}.`, { outputDir: target, starter: starterId, generated: false });
  }
  if (await exists(target)) {
    if (!options.overwrite) throw new UsageError(`outputDir exists: ${target}. Pass --overwrite to replace.`);
    await fs.rm(target, { recursive: true, force: true });
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, {
    recursive: true,
    filter: (src) => {
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
  const [analysis, persona] = await Promise.all([
    (await exists(analysisPath)) ? readJson(analysisPath) : undefined,
    (await exists(personaPath)) ? readJson(personaPath) : undefined,
  ]);
  if (!analysis || !persona) throw new UsageError("starter configure requires analysis and persona.", "Run `repochan analysis run` and create a persona first.");
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
      if ((await exists(file)) && !options.overwrite) throw new UsageError(`Content exists: ${file}. Pass --overwrite to replace.`);
      pendingContent.push({ content, file });
    }
  }
  await fs.writeFile(sitePath(target, manifest.config.site), `${JSON.stringify(configured, null, 2)}\n`);
  const written = [manifest.config.site];
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
  const publications = slot.publications ?? [];
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
  if (slot.reference && !references.some((reference) => reference.type === "file")) {
    references.unshift({ type: "file", path: sitePath(target, slot.reference), role: "composition" });
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
    meta: { starterId: manifest.id, starterSlot: slot.slot },
  };
  const result = await createOrders(cwd, { order });
  emitResult(options, `Created starter order ${orderId} for ${slot.slot}.`, { ...result, orderId, slot: slot.slot });
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
      await chromaKeyImage(source, out, { matteColor: parsed as any, threshold: Number(args.threshold) || undefined, softness: Number(args.softness) || undefined, spillSuppression: Number(args.spill) || undefined });
      return;
    }
    case "bg-remove":
      await removeImageBackground(source, out, { model: (args.model as any) ?? "small", overwrite });
      return;
    case "slice":
      await sliceGridToFiles(source, out, { rows: Number(args.rows), cols: Number(args.cols), padding: Number(args.padding) || 0, overwrite });
      return;
    case "extract-stickers":
      await extractStickersFromImage(source, { rows: Number(args.rows), cols: Number(args.cols), model: (args.model as any) ?? "small", overwrite }, out);
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
  }
}

type GridApplyResult = Awaited<ReturnType<typeof extractMatteGrid>>;

async function stageGridBundle(
  slot: StarterAssetSlot,
  step: StarterPostprocessStep,
  source: string,
  tempRoot: string,
): Promise<GridApplyResult> {
  const args = step.args ?? {};
  const publications = slot.publications ?? [];
  const mapping = Object.fromEntries(publications.map((item) => [item.key, item.cell]));
  const chroma = args.chroma && typeof args.chroma === "object" ? { ...(args.chroma as Record<string, unknown>) } : {};
  if (typeof chroma.matteColor === "string") chroma.matteColor = parseMatteColor(chroma.matteColor);
  const extractedDir = sitePath(tempRoot, step.out);
  const result = await extractMatteGrid(source, extractedDir, {
    rows: Number(args.rows),
    cols: Number(args.cols),
    mapping,
    chroma: chroma as any,
    normalize: args.normalize as any,
    qa: args.qa as any,
    overwrite: true,
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

export async function runStarterAssetApply(cwd: string, slotName: string | undefined, options: StarterOptions) {
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
  const publicationOutputs = slot.publications?.map((item) => item.output) ?? [slot.output];
  for (const output of publicationOutputs) {
    await assertNoSymlinkPath(target, output, "Starter asset output");
    const finalPath = sitePath(target, output);
    if ((await exists(finalPath)) && !options.overwrite) throw new UsageError(`Starter asset output exists: ${finalPath}. Pass --overwrite to replace.`);
  }

  const tempRoot = await fs.mkdtemp(path.join(target, ".repochan-starter-"));
  try {
    const gridStep = slot.postprocess?.find((step) => step.op === "extract-grid");
    let gridResult: GridApplyResult | undefined;
    if (gridStep) {
      gridResult = await stageGridBundle(slot, gridStep, sourceFiles[0], tempRoot);
    } else if (slot.postprocess?.length) {
      let stepSources = sourceFiles;
      for (const step of slot.postprocess) {
        const stepOut = sitePath(tempRoot, step.out);
        await assertNoSymlinkPath(tempRoot, step.out, "Starter postprocess output");
        await applyStep(step, stepSources, stepOut, true);
        stepSources = [stepOut];
      }
    } else {
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
    const gridItems = gridResult && slot.publications
      ? Object.fromEntries(slot.publications.map((publication) => {
          const item = gridResult!.items.find((candidate) => candidate.key === publication.key)!;
          return [publication.key, {
            src: `/${publication.output.replace(/^public\//, "")}`,
            status: "ready" as const,
            orderId: options.order,
            versionId: result.version.versionId,
            qa: { ...item.qa, geometry: item.geometry },
          }];
        }))
      : undefined;
    assets.assets[slot.slot] = {
      src: `/${slot.output.replace(/^public\//, "")}`,
      status: "ready",
      orderId: options.order,
      versionId: result.version.versionId,
      ...(gridResult ? {
        qa: { rows: gridResult.rows, cols: gridResult.cols, matteColor: gridResult.matteColor, matteColorSource: gridResult.matteColorSource },
        items: gridItems,
      } : {}),
    };
    const stagedAssets = sitePath(tempRoot, manifest.config.assets);
    await fs.mkdir(path.dirname(stagedAssets), { recursive: true });
    await fs.writeFile(stagedAssets, `${JSON.stringify(assets, null, 2)}\n`);
    await publishFilesWithRollback(target, tempRoot, [...publicationOutputs, manifest.config.assets]);
    emitResult(options, `Applied ${options.order}/${result.version.versionId} → ${publicationOutputs.join(", ")}`, {
      starter: manifest.id,
      slot: slot.slot,
      outputs: publicationOutputs.map((output) => sitePath(target, output)),
      orderId: options.order,
      versionId: result.version.versionId,
    });
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
  if (slot.publications?.length) {
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
    src: `/${slot.output.replace(/^public\//, "")}`,
    status: "ready",
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

async function validateStarterDir(cwd: string, starter: StarterMeta, requireCapabilities: boolean): Promise<string[]> {
  const issues: string[] = [];
  if (requireCapabilities && !starter.capabilities) issues.push("source starter must declare capabilities");
  const files = await walkFiles(starter.dir);
  for (const asset of starter.assets) {
    if (asset.reference && !(await exists(sitePath(starter.dir, asset.reference)))) issues.push(`${asset.slot}: missing reference ${asset.reference}`);
    if (asset.required && !(await exists(sitePath(starter.dir, asset.output)))) issues.push(`${asset.slot}: missing fallback output ${asset.output}`);
  }
  for (const section of starter.capabilities?.sections ?? []) {
    if (section.provenance.type === "design-reference") {
      const reference = sitePath(starter.dir, section.provenance.reference);
      const stat = await fs.stat(reference).catch(() => undefined);
      if (!stat?.isFile()) issues.push(`${section.id}: design reference must be a regular file: ${section.provenance.reference}`);
    }
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
    issues.push(...validateStarterAssetState(starter, assets, relativeFiles));
    issues.push(...validateStarterContentRequirements(starter, locales));
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
  const validatingSource = !options.outputDir;
  if (options.outputDir) targets = [await readStarterInstance(outputDir(cwd, options.outputDir))];
  else if (options.all) targets = await listStarters();
  else if (id) targets = [await getStarter(id)];
  else throw new UsageError("Usage: repochan starter validate <id> | --all | --output-dir <dir>");
  const results = [];
  for (const target of targets) results.push({ id: target.id, dir: target.dir, issues: await validateStarterDir(cwd, target, validatingSource) });
  const issueCount = results.reduce((total, result) => total + result.issues.length, 0);
  if (issueCount) throw new UsageError(`Starter validation failed (${issueCount} issue${issueCount === 1 ? "" : "s"}):\n${results.flatMap((result) => result.issues.map((issue) => `- ${result.id}: ${issue}`)).join("\n")}`);
  emitResult(options, `Starter validation passed (${results.length} starter${results.length === 1 ? "" : "s"}).`, { valid: true, starters: results });
}

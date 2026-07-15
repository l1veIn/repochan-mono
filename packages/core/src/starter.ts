import path from "node:path";
import { Type } from "typebox";
import { validateInput } from "./validate.js";

const RelativePathSchema = Type.String({ minLength: 1 });
const LocaleSchema = Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$" });
const ThemeColorSchema = Type.String({ pattern: "^#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?$" });
const OrderIdSchema = Type.String({ pattern: "^ord-[a-z0-9][a-z0-9-]*$" });
const VersionIdSchema = Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]*$" });

export const StarterPostprocessOpSchema = Type.Union([
  Type.Literal("compress"),
  Type.Literal("slice"),
  Type.Literal("extract-stickers"),
  Type.Literal("chroma-key"),
  Type.Literal("bg-remove"),
  Type.Literal("resize"),
  Type.Literal("favicon"),
  Type.Literal("gif-from-frames"),
  Type.Literal("extract-grid"),
]);

const StarterAssetPublicationSchema = Type.Object({
  key: Type.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }),
  cell: Type.Integer({ minimum: 0 }),
  output: RelativePathSchema,
}, { additionalProperties: false });

const StarterReferenceSchema = Type.Union([
  Type.Object({
    type: Type.Literal("file"),
    path: RelativePathSchema,
    role: Type.Union([Type.Literal("composition"), Type.Literal("character"), Type.Literal("style")]),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("order"),
    orderId: OrderIdSchema,
    versionId: Type.Optional(VersionIdSchema),
    role: Type.Union([Type.Literal("composition"), Type.Literal("character"), Type.Literal("style")]),
  }, { additionalProperties: false }),
]);

export const StarterAssetOrderSchema = Type.Object({
  assetType: Type.Optional(Type.String({ minLength: 1 })),
  templateId: Type.Optional(Type.String({ minLength: 1 })),
  brief: Type.Optional(Type.Object({
    intent: Type.Optional(Type.String()),
    mustInclude: Type.Optional(Type.Array(Type.String())),
    avoid: Type.Optional(Type.Array(Type.String())),
    creativeFreedom: Type.Optional(Type.Array(Type.String())),
  }, { additionalProperties: false })),
  deliverables: Type.Optional(Type.Array(Type.Object({
    name: Type.String(),
    format: Type.String(),
    width: Type.Optional(Type.Number()),
    height: Type.Optional(Type.Number()),
    aspectRatio: Type.Optional(Type.String()),
  }, { additionalProperties: false }))),
  references: Type.Optional(Type.Array(StarterReferenceSchema)),
}, { additionalProperties: false });

const StarterPostprocessStepSchema = Type.Object({
  op: StarterPostprocessOpSchema,
  args: Type.Optional(Type.Record(Type.String(), Type.Any())),
  out: RelativePathSchema,
}, { additionalProperties: false });

const StarterScalarAssetSlotSchema = Type.Object({
  kind: Type.Literal("scalar"),
  slot: Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" }),
  required: Type.Boolean(),
  reference: Type.Optional(RelativePathSchema),
  output: RelativePathSchema,
  description: Type.Optional(Type.String()),
  order: Type.Optional(StarterAssetOrderSchema),
  postprocess: Type.Optional(Type.Array(StarterPostprocessStepSchema)),
}, { additionalProperties: false });

const StarterBundleAssetSlotSchema = Type.Object({
  kind: Type.Literal("bundle"),
  slot: Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" }),
  required: Type.Boolean(),
  reference: Type.Optional(RelativePathSchema),
  publications: Type.Array(StarterAssetPublicationSchema, { minItems: 1 }),
  description: Type.Optional(Type.String()),
  order: Type.Optional(StarterAssetOrderSchema),
  postprocess: Type.Array(StarterPostprocessStepSchema, { minItems: 1 }),
}, { additionalProperties: false });

export const StarterAssetSlotSchema = Type.Union([
  StarterScalarAssetSlotSchema,
  StarterBundleAssetSlotSchema,
]);

const StarterLayerSchema = Type.Union([
  Type.Literal("L1"),
  Type.Literal("L1a"),
  Type.Literal("L1b"),
  Type.Literal("L1c"),
  Type.Literal("L2"),
  Type.Literal("L3"),
  Type.Literal("L4"),
]);

const NormalizedPointSchema = Type.Object({
  x: Type.Number({ minimum: 0, maximum: 1 }),
  y: Type.Number({ minimum: 0, maximum: 1 }),
}, { additionalProperties: false });

const StarterSafeZoneSchema = Type.Object({
  id: Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" }),
  x: Type.Number({ minimum: 0, maximum: 1 }),
  y: Type.Number({ minimum: 0, maximum: 1 }),
  width: Type.Number({ exclusiveMinimum: 0, maximum: 1 }),
  height: Type.Number({ exclusiveMinimum: 0, maximum: 1 }),
}, { additionalProperties: false });

const StarterSectionProvenanceSchema = Type.Union([
  Type.Object({ type: Type.Literal("html-first") }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("design-reference"),
    reference: RelativePathSchema,
  }, { additionalProperties: false }),
]);

export const StarterSectionCapabilitySchema = Type.Object({
  id: Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" }),
  recipe: Type.String({ minLength: 1 }),
  provenance: StarterSectionProvenanceSchema,
  bakedLayers: Type.Array(StarterLayerSchema),
  liveLayers: Type.Array(StarterLayerSchema),
  canonicalViewport: Type.Object({
    width: Type.Integer({ minimum: 1 }),
    height: Type.Integer({ minimum: 1 }),
  }, { additionalProperties: false }),
  safeZones: Type.Optional(Type.Array(StarterSafeZoneSchema, { minItems: 1 })),
  responsive: Type.Object({
    mode: Type.Union([
      Type.Literal("reflow"),
      Type.Literal("recompose"),
      Type.Literal("alternate-asset"),
      Type.Literal("hide-decoration"),
    ]),
    notes: Type.String({ minLength: 1 }),
  }, { additionalProperties: false }),
  assetSlots: Type.Optional(Type.Array(Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" }))),
  motion: Type.Array(Type.Union([
    Type.Literal("ambient"),
    Type.Literal("scroll-linked"),
    Type.Literal("interactive"),
  ])),
}, { additionalProperties: false });

export const StarterTransitionCapabilitySchema = Type.Object({
  from: Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" }),
  to: Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" }),
  kind: Type.Union([
    Type.Literal("hard-cut"),
    Type.Literal("continuous"),
    Type.Literal("motif-handoff"),
  ]),
  motif: Type.Optional(Type.String({ minLength: 1 })),
  direction: Type.Optional(Type.String({ minLength: 1 })),
  anchors: Type.Optional(Type.Object({
    from: NormalizedPointSchema,
    to: NormalizedPointSchema,
  }, { additionalProperties: false })),
  patternPhase: Type.Optional(Type.String({ minLength: 1 })),
  mobile: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

export const StarterCapabilitiesSchema = Type.Object({
  sections: Type.Array(StarterSectionCapabilitySchema, { minItems: 1 }),
  transitions: Type.Array(StarterTransitionCapabilitySchema),
}, { additionalProperties: false });

export const StarterManifestSchema = Type.Object({
  schemaVersion: Type.Literal("repochan.starter.v1"),
  id: Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" }),
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  style: Type.Optional(Type.String()),
  tags: Type.Array(Type.String()),
  default: Type.Optional(Type.Boolean()),
  config: Type.Object({
    site: Type.Literal("repochan/site.json"),
    assets: Type.Literal("repochan/assets.json"),
    i18nDir: Type.Literal("repochan/i18n"),
  }, { additionalProperties: false }),
  content: Type.Object({
    defaultLocale: LocaleSchema,
    supportedLocales: Type.Array(LocaleSchema, { minItems: 1 }),
    requiredPaths: Type.Array(Type.String({ minLength: 1 })),
  }, { additionalProperties: false }),
  capabilities: StarterCapabilitiesSchema,
  assets: Type.Array(StarterAssetSlotSchema),
}, { additionalProperties: false });

export const StarterSiteConfigSchema = Type.Object({
  schemaVersion: Type.Literal("repochan.starter-site.v1"),
  project: Type.Object({
    name: Type.String(),
    description: Type.Optional(Type.String()),
    repositoryUrl: Type.Optional(Type.String()),
  }, { additionalProperties: false }),
  theme: Type.Object({
    primary: ThemeColorSchema,
    base: ThemeColorSchema,
    accents: Type.Array(ThemeColorSchema),
  }, { additionalProperties: false }),
  brand: Type.Object({
    artStyle: Type.Optional(Type.String()),
    motifs: Type.Array(Type.String()),
    patterns: Type.Array(Type.String()),
  }, { additionalProperties: false }),
  locales: Type.Object({
    default: LocaleSchema,
    supported: Type.Array(LocaleSchema, { minItems: 1 }),
  }, { additionalProperties: false }),
}, { additionalProperties: false });

export const StarterAssetProvenanceSchema = Type.Object({
  kind: Type.Literal("local-file"),
  sourcePath: Type.String({ minLength: 1 }),
  sha256: Type.String({ pattern: "^[0-9a-f]{64}$" }),
}, { additionalProperties: false });

const StarterScalarAssetStateSchema = Type.Object({
  kind: Type.Literal("scalar"),
  src: Type.String({ minLength: 1 }),
  status: Type.Union([Type.Literal("pending"), Type.Literal("ready")]),
  orderId: Type.Optional(OrderIdSchema),
  versionId: Type.Optional(VersionIdSchema),
  provenance: Type.Optional(StarterAssetProvenanceSchema),
  qa: Type.Optional(Type.Record(Type.String(), Type.Any())),
}, { additionalProperties: false });

const StarterBundleAssetStateSchema = Type.Object({
  kind: Type.Literal("bundle"),
  status: Type.Union([Type.Literal("pending"), Type.Literal("ready")]),
  orderId: Type.Optional(OrderIdSchema),
  versionId: Type.Optional(VersionIdSchema),
  qa: Type.Optional(Type.Record(Type.String(), Type.Any())),
  items: Type.Record(Type.String(), Type.Object({
    src: Type.String({ minLength: 1 }),
    status: Type.Union([Type.Literal("pending"), Type.Literal("ready")]),
    orderId: Type.Optional(OrderIdSchema),
    versionId: Type.Optional(VersionIdSchema),
    qa: Type.Optional(Type.Record(Type.String(), Type.Any())),
  }, { additionalProperties: false })),
}, { additionalProperties: false });

export const StarterAssetStateSchema = Type.Union([
  StarterScalarAssetStateSchema,
  StarterBundleAssetStateSchema,
]);

export const StarterAssetsConfigSchema = Type.Object({
  schemaVersion: Type.Literal("repochan.starter-assets.v1"),
  assets: Type.Record(Type.String(), StarterAssetStateSchema),
}, { additionalProperties: false });

export const StarterLocaleContentSchema = Type.Object({
  schemaVersion: Type.Literal("repochan.starter-content.v1"),
  locale: LocaleSchema,
  meta: Type.Object({
    title: Type.String(),
    description: Type.String(),
  }, { additionalProperties: false }),
  content: Type.Record(Type.String(), Type.Any()),
}, { additionalProperties: false });

export type StarterPostprocessOp = "compress" | "slice" | "extract-stickers" | "chroma-key" | "bg-remove" | "resize" | "favicon" | "gif-from-frames" | "extract-grid";

export type StarterPostprocessStep = {
  op: StarterPostprocessOp;
  args?: Record<string, unknown>;
  out: string;
};

export type StarterAssetOrder = {
  assetType?: string;
  templateId?: string;
  brief?: { intent?: string; mustInclude?: string[]; avoid?: string[]; creativeFreedom?: string[] };
  deliverables?: Array<{ name: string; format: string; width?: number; height?: number; aspectRatio?: string }>;
  references?: Array<Record<string, unknown>>;
};

type StarterAssetSlotBase = {
  slot: string;
  required: boolean;
  reference?: string;
  description?: string;
  order?: StarterAssetOrder;
  postprocess?: StarterPostprocessStep[];
};

export type StarterAssetSlot = StarterAssetSlotBase & (
  | { kind: "scalar"; output: string }
  | { kind: "bundle"; publications: Array<{ key: string; cell: number; output: string }>; postprocess: StarterPostprocessStep[] }
);

export type StarterLayer = "L1" | "L1a" | "L1b" | "L1c" | "L2" | "L3" | "L4";

export type StarterSectionCapability = {
  id: string;
  recipe: string;
  provenance: { type: "html-first" } | { type: "design-reference"; reference: string };
  bakedLayers: StarterLayer[];
  liveLayers: StarterLayer[];
  canonicalViewport: { width: number; height: number };
  safeZones?: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  responsive: { mode: "reflow" | "recompose" | "alternate-asset" | "hide-decoration"; notes: string };
  assetSlots?: string[];
  motion: Array<"ambient" | "scroll-linked" | "interactive">;
};

export type StarterTransitionCapability = {
  from: string;
  to: string;
  kind: "hard-cut" | "continuous" | "motif-handoff";
  motif?: string;
  direction?: string;
  anchors?: { from: { x: number; y: number }; to: { x: number; y: number } };
  patternPhase?: string;
  mobile: string;
};

export type StarterCapabilities = {
  sections: StarterSectionCapability[];
  transitions: StarterTransitionCapability[];
};

export type StarterManifest = {
  schemaVersion: "repochan.starter.v1";
  id: string;
  name: string;
  description?: string;
  style?: string;
  tags: string[];
  default?: boolean;
  config: { site: "repochan/site.json"; assets: "repochan/assets.json"; i18nDir: "repochan/i18n" };
  content: { defaultLocale: string; supportedLocales: string[]; requiredPaths: string[] };
  capabilities: StarterCapabilities;
  assets: StarterAssetSlot[];
};

export type StarterSiteConfig = {
  schemaVersion: "repochan.starter-site.v1";
  project: { name: string; description?: string; repositoryUrl?: string };
  theme: { primary: string; base: string; accents: string[] };
  brand: { artStyle?: string; motifs: string[]; patterns: string[] };
  locales: { default: string; supported: string[] };
};

export type StarterAssetsConfig = {
  schemaVersion: "repochan.starter-assets.v1";
  assets: Record<string,
    | {
      kind: "scalar";
      src: string;
      status: "pending" | "ready";
      orderId?: string;
      versionId?: string;
      provenance?: StarterAssetProvenance;
      qa?: Record<string, unknown>;
    }
    | {
      kind: "bundle";
      status: "pending" | "ready";
      orderId?: string;
      versionId?: string;
      qa?: Record<string, unknown>;
      items: Record<string, {
        src: string;
        status: "pending" | "ready";
        orderId?: string;
        versionId?: string;
        qa?: Record<string, unknown>;
      }>;
    }
  >;
};

export type StarterAssetProvenance = {
  kind: "local-file";
  sourcePath: string;
  sha256: string;
};

export type StarterLocaleContent = {
  schemaVersion: "repochan.starter-content.v1";
  locale: string;
  meta: { title: string; description: string };
  content: Record<string, unknown>;
};

function assertSafeRelativePath(value: string, label: string): void {
  if (path.isAbsolute(value) || value.split(/[\\/]+/).includes("..")) {
    throw new Error(`${label} must be a safe site-root-relative path: ${value}`);
  }
}

function assertUnique(values: string[], label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) throw new Error(`${label} contains duplicate '${duplicate}'.`);
}

export function validateStarterManifest(value: unknown): StarterManifest {
  validateInput("starter.manifest", StarterManifestSchema, value);
  const manifest = value as StarterManifest;
  assertUnique(manifest.content.supportedLocales, "content.supportedLocales");
  assertUnique(manifest.content.requiredPaths, "content.requiredPaths");
  assertUnique(manifest.assets.map((asset) => asset.slot), "assets.slot");
  if (!manifest.content.supportedLocales.includes(manifest.content.defaultLocale)) {
    throw new Error("content.defaultLocale must be included in content.supportedLocales.");
  }
  validateStarterCapabilities(manifest);
  for (const asset of manifest.assets) {
    if (asset.reference) assertSafeRelativePath(asset.reference, `assets.${asset.slot}.reference`);
    if (asset.kind === "scalar") assertSafeRelativePath(asset.output, `assets.${asset.slot}.output`);
    const publications = asset.kind === "bundle" ? asset.publications : [];
    assertUnique(publications.map((item) => item.key), `assets.${asset.slot}.publications.key`);
    assertUnique(publications.map((item) => String(item.cell)), `assets.${asset.slot}.publications.cell`);
    assertUnique(publications.map((item) => item.output), `assets.${asset.slot}.publications.output`);
    for (const publication of publications) {
      assertSafeRelativePath(publication.output, `assets.${asset.slot}.publications.${publication.key}.output`);
      if (path.extname(publication.output).toLowerCase() !== ".png") {
        throw new Error(`assets.${asset.slot}.publications.${publication.key}.output must be a .png path.`);
      }
    }
    for (const [index, step] of (asset.postprocess ?? []).entries()) {
      assertSafeRelativePath(step.out, `assets.${asset.slot}.postprocess.out`);
      if (index < (asset.postprocess?.length ?? 0) - 1 && ["slice", "extract-stickers", "resize"].includes(step.op)) {
        throw new Error(`assets.${asset.slot}: multi-output postprocess '${step.op}' must be the final step.`);
      }
    }
    const finalOut = asset.postprocess?.at(-1)?.out;
    const extractGridSteps = (asset.postprocess ?? []).filter((step) => step.op === "extract-grid");
    if (extractGridSteps.length > 1 || (extractGridSteps.length === 1 && asset.postprocess?.length !== 1)) {
      throw new Error(`assets.${asset.slot}: extract-grid must be the only postprocess step.`);
    }
    if (asset.kind === "bundle") {
      if (extractGridSteps.length !== 1) throw new Error(`assets.${asset.slot}: bundle assets require an extract-grid postprocess step.`);
      validateExtractGridArgs(asset.slot, extractGridSteps[0].args, publications);
    } else if (extractGridSteps.length) {
      throw new Error(`assets.${asset.slot}: extract-grid is only valid for bundle assets.`);
    } else if (finalOut && finalOut !== asset.output) {
      throw new Error(`assets.${asset.slot}.output must match the final postprocess out (${finalOut}).`);
    }
  }
  return manifest;
}

function validateStarterCapabilities(manifest: StarterManifest): void {
  const capabilities = manifest.capabilities;
  const sectionIds = capabilities.sections.map((section) => section.id);
  const assetSlots = new Set(manifest.assets.map((asset) => asset.slot));
  assertUnique(sectionIds, "capabilities.sections.id");
  for (const section of capabilities.sections) {
    assertUnique(section.bakedLayers, `capabilities.sections.${section.id}.bakedLayers`);
    assertUnique(section.liveLayers, `capabilities.sections.${section.id}.liveLayers`);
    if (section.bakedLayers.includes("L1") && section.bakedLayers.some((layer) => /^L1[a-c]$/.test(layer))) {
      throw new Error(`capabilities.sections.${section.id}.bakedLayers cannot combine L1 with an L1 sublayer.`);
    }
    if (section.liveLayers.includes("L1") && section.liveLayers.some((layer) => /^L1[a-c]$/.test(layer))) {
      throw new Error(`capabilities.sections.${section.id}.liveLayers cannot combine L1 with an L1 sublayer.`);
    }
    const overlap = section.bakedLayers.find((baked) => section.liveLayers.some((current) => (
      baked === current
      || baked === "L1" && /^L1[a-c]$/.test(current)
      || current === "L1" && /^L1[a-c]$/.test(baked)
    )));
    if (overlap) throw new Error(`capabilities.sections.${section.id}: layer '${overlap}' cannot be both baked and live.`);
    if (section.bakedLayers.includes("L4")) {
      throw new Error(`capabilities.sections.${section.id}: L4 interaction must remain live.`);
    }
    if (section.bakedLayers.length + section.liveLayers.length === 0) {
      throw new Error(`capabilities.sections.${section.id}: at least one baked or live layer is required.`);
    }
    if (section.provenance.type === "design-reference") {
      assertSafeRelativePath(section.provenance.reference, `capabilities.sections.${section.id}.provenance.reference`);
    }
    assertUnique(section.assetSlots ?? [], `capabilities.sections.${section.id}.assetSlots`);
    for (const slot of section.assetSlots ?? []) {
      if (!assetSlots.has(slot)) throw new Error(`capabilities.sections.${section.id}: unknown asset slot '${slot}'.`);
    }
    assertUnique(section.motion, `capabilities.sections.${section.id}.motion`);
    assertUnique((section.safeZones ?? []).map((zone) => zone.id), `capabilities.sections.${section.id}.safeZones.id`);
    for (const zone of section.safeZones ?? []) {
      if (zone.x + zone.width > 1 || zone.y + zone.height > 1) {
        throw new Error(`capabilities.sections.${section.id}.safeZones.${zone.id} must fit inside normalized bounds.`);
      }
    }
  }

  const expectedTransitions = sectionIds.slice(0, -1).map((from, index) => `${from}->${sectionIds[index + 1]}`);
  const actualTransitions = capabilities.transitions.map((transition) => `${transition.from}->${transition.to}`);
  assertUnique(actualTransitions, "capabilities.transitions");
  const missing = expectedTransitions.find((pair) => !actualTransitions.includes(pair));
  const unexpected = actualTransitions.find((pair) => !expectedTransitions.includes(pair));
  if (missing || unexpected || actualTransitions.length !== expectedTransitions.length) {
    throw new Error(
      `capabilities.transitions must cover each adjacent section exactly once; expected ${expectedTransitions.join(", ") || "none"}.`,
    );
  }
  for (const transition of capabilities.transitions) {
    const label = `capabilities.transitions.${transition.from}->${transition.to}`;
    if (transition.kind === "motif-handoff") {
      if (!transition.motif) throw new Error(`${label}: motif-handoff requires motif.`);
      if (!transition.direction && !transition.anchors) {
        throw new Error(`${label}: motif-handoff requires direction or normalized anchors.`);
      }
    }
    if (transition.kind === "continuous" && !transition.anchors) {
      throw new Error(`${label}: continuous requires normalized anchors.`);
    }
    if (transition.kind === "hard-cut" && (
      transition.motif || transition.direction || transition.anchors || transition.patternPhase
    )) {
      throw new Error(`${label}: hard-cut cannot declare motif, direction, anchors, or patternPhase.`);
    }
  }
}

function validateExtractGridArgs(
  slot: string,
  args: Record<string, unknown> | undefined,
  publications: Array<{ key: string; cell: number; output: string }>,
): void {
  const label = `assets.${slot}.extract-grid.args`;
  if (!args || !Number.isInteger(args.rows) || Number(args.rows) < 1 || !Number.isInteger(args.cols) || Number(args.cols) < 1) {
    throw new Error(`${label}.rows and .cols must be positive integers.`);
  }
  const cellCount = Number(args.rows) * Number(args.cols);
  if (publications.some((item) => item.cell >= cellCount)) throw new Error(`${label}: publication cell is outside the ${args.rows}x${args.cols} grid.`);
  const normalize = args.normalize;
  if (!normalize || typeof normalize !== "object") throw new Error(`${label}.normalize is required.`);
  const canvasSize = (normalize as Record<string, unknown>).canvasSize;
  const validCanvas = Number.isInteger(canvasSize) && Number(canvasSize) > 0
    || !!canvasSize && typeof canvasSize === "object"
      && Number.isInteger((canvasSize as Record<string, unknown>).width) && Number((canvasSize as Record<string, unknown>).width) > 0
      && Number.isInteger((canvasSize as Record<string, unknown>).height) && Number((canvasSize as Record<string, unknown>).height) > 0;
  if (!validCanvas) throw new Error(`${label}.normalize.canvasSize must be a positive integer or positive integer width/height.`);
  const padding = (normalize as Record<string, unknown>).padding;
  if (padding !== undefined && (!Number.isInteger(padding) || Number(padding) < 0)) {
    throw new Error(`${label}.normalize.padding must be a non-negative integer.`);
  }
  if (args.mapping !== undefined) {
    const mapping = args.mapping;
    const expected = new Map(publications.map((item) => [item.key, item.cell]));
    const actual = Array.isArray(mapping)
      ? new Map(mapping.map((key, index) => [key, index]))
      : mapping && typeof mapping === "object" ? new Map(Object.entries(mapping)) : undefined;
    if (!actual || actual.size !== expected.size || [...expected].some(([key, cell]) => Number(actual.get(key)) !== cell)) {
      throw new Error(`${label}.mapping must exactly match publications key/cell assignments.`);
    }
  }
  if (args.qa !== undefined && (!args.qa || typeof args.qa !== "object" || Array.isArray(args.qa))) {
    throw new Error(`${label}.qa must be an object.`);
  }
  if (args.qa && typeof args.qa === "object") {
    const qa = args.qa as Record<string, unknown>;
    if (qa.alphaThreshold !== undefined && (!Number.isInteger(qa.alphaThreshold) || Number(qa.alphaThreshold) < 1 || Number(qa.alphaThreshold) > 255)) {
      throw new Error(`${label}.qa.alphaThreshold must be an integer from 1 to 255.`);
    }
    for (const key of ["minForegroundRatio", "maxForegroundRatio", "maxEdgeTouchRatio"] as const) {
      const ratio = qa[key];
      if (ratio !== undefined && (typeof ratio !== "number" || ratio < 0 || ratio > 1)) throw new Error(`${label}.qa.${key} must be between 0 and 1.`);
    }
    if (typeof qa.minForegroundRatio === "number" && typeof qa.maxForegroundRatio === "number" && qa.minForegroundRatio > qa.maxForegroundRatio) {
      throw new Error(`${label}.qa.minForegroundRatio cannot exceed maxForegroundRatio.`);
    }
  }
  if (args.chroma !== undefined && (!args.chroma || typeof args.chroma !== "object" || Array.isArray(args.chroma))) {
    throw new Error(`${label}.chroma must be an object.`);
  }
}

export function validateStarterSiteConfig(value: unknown): StarterSiteConfig {
  validateInput("starter.site", StarterSiteConfigSchema, value);
  const config = value as StarterSiteConfig;
  assertUnique(config.locales.supported, "locales.supported");
  if (!config.locales.supported.includes(config.locales.default)) {
    throw new Error("locales.default must be included in locales.supported.");
  }
  return config;
}

export function validateStarterAssetsConfig(value: unknown): StarterAssetsConfig {
  validateInput("starter.assets", StarterAssetsConfigSchema, value);
  return value as StarterAssetsConfig;
}

export function validateStarterLocaleContent(value: unknown): StarterLocaleContent {
  validateInput("starter.content", StarterLocaleContentSchema, value);
  return value as StarterLocaleContent;
}

function valueAtPath(value: unknown, dottedPath: string): unknown {
  return dottedPath.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || !(key in current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

export function validateStarterContentRequirements(manifest: StarterManifest, locales: StarterLocaleContent[]): string[] {
  const issues: string[] = [];
  const byLocale = new Map(locales.map((locale) => [locale.locale, locale]));
  for (const locale of manifest.content.supportedLocales) {
    const content = byLocale.get(locale);
    if (!content) {
      issues.push(`missing locale content: ${locale}`);
      continue;
    }
    for (const requiredPath of manifest.content.requiredPaths) {
      const value = valueAtPath(content, requiredPath);
      if (value === undefined || value === null || value === "") issues.push(`${locale}: missing ${requiredPath}`);
    }
  }
  return issues;
}

export function validateStarterAssetState(
  manifest: StarterManifest,
  assets: StarterAssetsConfig,
  existingSitePaths: Iterable<string>,
): string[] {
  const issues: string[] = [];
  const existing = new Set(existingSitePaths);
  const slots = new Set(manifest.assets.map((asset) => asset.slot));
  for (const key of Object.keys(assets.assets)) if (!slots.has(key)) issues.push(`unknown asset slot in assets config: ${key}`);
  for (const slot of manifest.assets) {
    const state = assets.assets[slot.slot];
    if (!state) {
      if (slot.required) issues.push(`missing required asset state: ${slot.slot}`);
      continue;
    }
    if (state.kind !== slot.kind) {
      issues.push(`${slot.slot}: asset state kind '${state.kind}' does not match slot kind '${slot.kind}'`);
      continue;
    }
    if (slot.required && state.status !== "ready") issues.push(`${slot.slot}: required asset is not ready`);
    if (slot.kind === "bundle" && state.kind === "bundle") {
      const publicationKeys = new Set(slot.publications.map((item) => item.key));
      for (const key of Object.keys(state.items)) if (!publicationKeys.has(key)) issues.push(`${slot.slot}: unknown publication item: ${key}`);
      for (const publication of slot.publications) {
        const item = state.items[publication.key];
        if (!item) {
          if (slot.required || state.status === "ready") issues.push(`${slot.slot}.${publication.key}: missing publication state`);
          continue;
        }
        if ((slot.required || state.status === "ready") && item.status !== "ready") issues.push(`${slot.slot}.${publication.key}: publication is not ready`);
        if (item.status === "ready" && !existing.has(publication.output)) issues.push(`${slot.slot}.${publication.key}: ready output does not exist: ${publication.output}`);
        const expectedSrc = `/${publication.output.replace(/^public\//, "")}`;
        if (item.src !== expectedSrc) issues.push(`${slot.slot}.${publication.key}: src does not match output: ${item.src}`);
      }
    } else if (slot.kind === "scalar" && state.kind === "scalar") {
      if (state.status === "ready" && !existing.has(slot.output)) issues.push(`${slot.slot}: ready output does not exist: ${slot.output}`);
      if (state.src !== `/${slot.output.replace(/^public\//, "")}`) issues.push(`${slot.slot}: src does not match output: ${state.src}`);
    }
  }
  return issues;
}

export type StarterSourceFile = { path: string; content: string };
export type StarterColorViolation = { path: string; line: number; kind: string; match: string };

const COLOR_CHECKS = [
  { kind: "hex color", pattern: /#[\da-f]{3,8}\b/gi },
  { kind: "numeric color function", pattern: /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(\s*[-+]?(?:\d|\.\d)/gi },
  { kind: "literal SVG color", pattern: /\b(?:fill|stroke)=["'](?!none\b|currentColor\b|inherit\b|transparent\b|url\()[^"']+["']/gi },
  { kind: "named CSS color", pattern: /\b(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|fill|stroke)\s*:\s*(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)\b/gi },
  { kind: "fixed Tailwind color", pattern: /\b(?:text|bg|border|outline|ring|fill|stroke)-(?:white|black|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)(?:-\d{2,3})?(?:\/\d{1,3})?\b/gi },
];

export function validateStarterPresentationColors(
  files: StarterSourceFile[],
  allowedConfigPaths: Iterable<string> = ["repochan/site.json"],
): StarterColorViolation[] {
  const allowed = new Set(allowedConfigPaths);
  const violations: StarterColorViolation[] = [];
  for (const file of files) {
    if (allowed.has(file.path.replaceAll("\\", "/"))) continue;
    for (const check of COLOR_CHECKS) {
      check.pattern.lastIndex = 0;
      for (const match of file.content.matchAll(check.pattern)) {
        violations.push({
          path: file.path,
          line: file.content.slice(0, match.index).split("\n").length,
          kind: check.kind,
          match: match[0],
        });
      }
    }
  }
  return violations;
}

function getNestedString(value: unknown, paths: string[]): string | undefined {
  for (const candidate of paths) {
    const found = valueAtPath(value, candidate);
    if (typeof found === "string" && found.trim()) return found;
  }
  return undefined;
}

function getStringArray(value: unknown, dottedPath: string): string[] | undefined {
  const found = valueAtPath(value, dottedPath);
  return Array.isArray(found) ? found.filter((item): item is string => typeof item === "string") : undefined;
}

export function projectStarterSiteConfig(input: {
  analysis?: unknown;
  persona?: unknown;
  defaults: StarterSiteConfig;
  repositoryUrl?: string;
}): StarterSiteConfig {
  const { analysis, persona, defaults } = input;
  const primary = getNestedString(persona, ["mainColor"]) ?? defaults.theme.primary;
  const base = getNestedString(persona, ["secondaryColor"]) ?? defaults.theme.base;
  const accents = getStringArray(persona, "accentColors") ?? defaults.theme.accents;
  const repositoryUrl = getNestedString(input, ["repositoryUrl"])
    ?? getNestedString(analysis, ["context.basic.repository_url", "context.basic.repositoryUrl", "repositoryUrl"])
    ?? repositoryUrlFromGitProfile(analysis)
    ?? defaults.project.repositoryUrl;
  return {
    schemaVersion: "repochan.starter-site.v1",
    project: {
      name: getNestedString(analysis, ["context.basic.project_name", "context.basic.projectName", "projectName"]) ?? defaults.project.name,
      description: getNestedString(analysis, ["preAnalysis.summary", "abstract.overall_impression"]) ?? defaults.project.description,
      repositoryUrl,
    },
    theme: { primary, base, accents: [...accents] },
    brand: {
      artStyle: getNestedString(persona, ["artStyle"]) ?? defaults.brand.artStyle,
      motifs: getStringArray(persona, "keyMotifs") ?? defaults.brand.motifs,
      patterns: getStringArray(persona, "signaturePatterns") ?? defaults.brand.patterns,
    },
    locales: { default: defaults.locales.default, supported: [...defaults.locales.supported] },
  };
}

function githubHttpsUrl(value: string): string | undefined {
  const trimmed = value.trim();
  const scpMatch = /^git@github\.com:([^/\s]+)\/([^\s]+)$/i.exec(trimmed);
  const httpsMatch = /^https:\/\/github\.com\/([^/\s]+)\/([^\s]+)$/i.exec(trimmed);
  const match = scpMatch ?? httpsMatch;
  if (!match) return undefined;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, "").replace(/\/$/, "");
  if (!owner || !repo) return undefined;
  return `https://github.com/${owner}/${repo}`;
}

function repositoryUrlFromGitProfile(analysis: unknown): string | undefined {
  const remotes = valueAtPath(analysis, "context.git_profile.remotes");
  if (!Array.isArray(remotes)) return undefined;
  for (const entry of remotes) {
    if (typeof entry !== "string") continue;
    const match = /^origin\s+(\S+)\s+\(fetch\)\s*$/i.exec(entry);
    if (!match) continue;
    const normalized = githubHttpsUrl(match[1]);
    if (normalized) return normalized;
  }
  return undefined;
}

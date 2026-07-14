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
]);

const StarterReferenceSchema = Type.Union([
  Type.Object({
    type: Type.Literal("file"),
    path: RelativePathSchema,
    role: Type.Union([Type.Literal("composition"), Type.Literal("character"), Type.Literal("style")]),
  }),
  Type.Object({
    type: Type.Optional(Type.Literal("order")),
    orderId: OrderIdSchema,
    versionId: Type.Optional(VersionIdSchema),
    role: Type.Union([Type.Literal("composition"), Type.Literal("character"), Type.Literal("style")]),
  }),
]);

export const StarterAssetOrderSchema = Type.Object({
  assetType: Type.Optional(Type.String({ minLength: 1 })),
  templateId: Type.Optional(Type.String({ minLength: 1 })),
  brief: Type.Optional(Type.Object({
    intent: Type.Optional(Type.String()),
    mustInclude: Type.Optional(Type.Array(Type.String())),
    avoid: Type.Optional(Type.Array(Type.String())),
    creativeFreedom: Type.Optional(Type.Array(Type.String())),
  })),
  deliverables: Type.Optional(Type.Array(Type.Object({
    name: Type.String(),
    format: Type.String(),
    width: Type.Optional(Type.Number()),
    height: Type.Optional(Type.Number()),
    aspectRatio: Type.Optional(Type.String()),
  }))),
  references: Type.Optional(Type.Array(StarterReferenceSchema)),
});

export const StarterAssetSlotSchema = Type.Object({
  slot: Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" }),
  required: Type.Boolean(),
  reference: Type.Optional(RelativePathSchema),
  output: RelativePathSchema,
  description: Type.Optional(Type.String()),
  order: Type.Optional(StarterAssetOrderSchema),
  postprocess: Type.Optional(Type.Array(Type.Object({
    op: StarterPostprocessOpSchema,
    args: Type.Optional(Type.Record(Type.String(), Type.Any())),
    out: RelativePathSchema,
  }))),
});

export const StarterManifestSchema = Type.Object({
  schemaVersion: Type.Literal("repochan.starter.v1"),
  id: Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" }),
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  style: Type.Optional(Type.String()),
  tags: Type.Array(Type.String()),
  default: Type.Optional(Type.Boolean()),
  config: Type.Object({
    site: RelativePathSchema,
    assets: RelativePathSchema,
    i18nDir: RelativePathSchema,
  }),
  content: Type.Object({
    defaultLocale: LocaleSchema,
    supportedLocales: Type.Array(LocaleSchema, { minItems: 1 }),
    requiredPaths: Type.Array(Type.String({ minLength: 1 })),
  }),
  assets: Type.Array(StarterAssetSlotSchema),
});

export const StarterSiteConfigSchema = Type.Object({
  schemaVersion: Type.Literal("repochan.starter-site.v1"),
  project: Type.Object({
    name: Type.String(),
    description: Type.Optional(Type.String()),
    repositoryUrl: Type.Optional(Type.String()),
  }),
  theme: Type.Object({
    primary: ThemeColorSchema,
    base: ThemeColorSchema,
    accents: Type.Array(ThemeColorSchema),
  }),
  brand: Type.Object({
    artStyle: Type.Optional(Type.String()),
    motifs: Type.Array(Type.String()),
    patterns: Type.Array(Type.String()),
  }),
  locales: Type.Object({
    default: LocaleSchema,
    supported: Type.Array(LocaleSchema, { minItems: 1 }),
  }),
});

export const StarterAssetStateSchema = Type.Object({
  src: Type.String({ minLength: 1 }),
  status: Type.Union([Type.Literal("pending"), Type.Literal("ready")]),
  orderId: Type.Optional(OrderIdSchema),
  versionId: Type.Optional(VersionIdSchema),
});

export const StarterAssetsConfigSchema = Type.Object({
  schemaVersion: Type.Literal("repochan.starter-assets.v1"),
  assets: Type.Record(Type.String(), StarterAssetStateSchema),
});

export const StarterLocaleContentSchema = Type.Object({
  schemaVersion: Type.Literal("repochan.starter-content.v1"),
  locale: LocaleSchema,
  meta: Type.Object({
    title: Type.String(),
    description: Type.String(),
  }),
  content: Type.Record(Type.String(), Type.Any()),
});

export type StarterPostprocessOp = "compress" | "slice" | "extract-stickers" | "chroma-key" | "bg-remove" | "resize" | "favicon" | "gif-from-frames";

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

export type StarterAssetSlot = {
  slot: string;
  required: boolean;
  reference?: string;
  output: string;
  description?: string;
  order?: StarterAssetOrder;
  postprocess?: StarterPostprocessStep[];
};

export type StarterManifest = {
  schemaVersion: "repochan.starter.v1";
  id: string;
  name: string;
  description?: string;
  style?: string;
  tags: string[];
  default?: boolean;
  config: { site: string; assets: string; i18nDir: string };
  content: { defaultLocale: string; supportedLocales: string[]; requiredPaths: string[] };
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
  assets: Record<string, { src: string; status: "pending" | "ready"; orderId?: string; versionId?: string }>;
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
  assertSafeRelativePath(manifest.config.site, "config.site");
  assertSafeRelativePath(manifest.config.assets, "config.assets");
  assertSafeRelativePath(manifest.config.i18nDir, "config.i18nDir");
  assertUnique(manifest.content.supportedLocales, "content.supportedLocales");
  assertUnique(manifest.content.requiredPaths, "content.requiredPaths");
  assertUnique(manifest.assets.map((asset) => asset.slot), "assets.slot");
  if (!manifest.content.supportedLocales.includes(manifest.content.defaultLocale)) {
    throw new Error("content.defaultLocale must be included in content.supportedLocales.");
  }
  for (const asset of manifest.assets) {
    if (asset.reference) assertSafeRelativePath(asset.reference, `assets.${asset.slot}.reference`);
    assertSafeRelativePath(asset.output, `assets.${asset.slot}.output`);
    for (const step of asset.postprocess ?? []) assertSafeRelativePath(step.out, `assets.${asset.slot}.postprocess.out`);
    const finalOut = asset.postprocess?.at(-1)?.out;
    if (finalOut && finalOut !== asset.output) {
      throw new Error(`assets.${asset.slot}.output must match the final postprocess out (${finalOut}).`);
    }
  }
  return manifest;
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
    if (slot.required && state.status !== "ready") issues.push(`${slot.slot}: required asset is not ready`);
    if (state.status === "ready" && !existing.has(slot.output)) issues.push(`${slot.slot}: ready output does not exist: ${slot.output}`);
    if (state.src !== `/${slot.output.replace(/^public\//, "")}`) issues.push(`${slot.slot}: src does not match output: ${state.src}`);
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
}): StarterSiteConfig {
  const { analysis, persona, defaults } = input;
  const primary = getNestedString(persona, ["mainColor"]) ?? defaults.theme.primary;
  const base = getNestedString(persona, ["secondaryColor"]) ?? defaults.theme.base;
  const accents = getStringArray(persona, "accentColors") ?? defaults.theme.accents;
  return {
    schemaVersion: "repochan.starter-site.v1",
    project: {
      name: getNestedString(analysis, ["context.basic.project_name", "context.basic.projectName", "projectName"]) ?? defaults.project.name,
      description: getNestedString(analysis, ["preAnalysis.summary", "abstract.overall_impression"]) ?? defaults.project.description,
      repositoryUrl: getNestedString(analysis, ["context.basic.repository_url", "context.basic.repositoryUrl", "repositoryUrl"]) ?? defaults.project.repositoryUrl,
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

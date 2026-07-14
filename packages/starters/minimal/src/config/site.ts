/**
 * Build-time persona → design-tokens loader.
 *
 * Reads `.repochan/persona/current.json` from the monorepo root (resolved
 * relative to this file). If the persona is absent, falls back to the bundled
 * "Chan" theme so the site never breaks during development.
 *
 * The exported `site` object is the single source of truth consumed by
 * SiteLayout (CSS variable injection) and by individual components.
 *
 * This runs at Astro SSG build time only — no runtime cost.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SitePalette = {
  primary: string; // mainColor
  base: string; // secondaryColor (dark)
  accent1: string; // accentColors[0]
  accent2: string; // accentColors[1]
  /** "R G B" triples for rgb(var(--x-rgb) / alpha) syntax */
  primaryRgb: string;
  baseRgb: string;
  accent1Rgb: string;
  accent2Rgb: string;
};

export type TextureSlot = {
  src: string;
  usage: string;
  desc: string;
};

export type SiteConfig = {
  persona: {
    name: string;
    nameZh: string;
    tagline: string;
    personality: string;
  };
  palette: SitePalette;
  textures: TextureSlot[];
  motifs: string[];
  artStyle: string;
  /** Constructivist UI tokens derived from artStyle */
  construct: {
    radius: string;
    lineWeight: string;
    lineColor: string;
    gridGap: string;
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "#6ee7ff" → "110 231 255" (space-separated for CSS rgb() syntax) */
function hexToRgb(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.substring(0, 2), 16);
  const g = parseInt(m.substring(2, 4), 16);
  const b = parseInt(m.substring(4, 6), 16);
  return `${r} ${g} ${b}`;
}

// ---------------------------------------------------------------------------
// Persona loading
// ---------------------------------------------------------------------------

type PersonaJson = {
  name?: string;
  nameZh?: string;
  catchphrase?: string;
  personality?: string;
  mainColor?: string;
  secondaryColor?: string;
  accentColors?: string[];
  signaturePatterns?: string[];
  keyMotifs?: string[];
  artStyle?: string;
  designNotes?: string;
};

// Resolve the monorepo root from this file's location:
//   src/config/site.ts → src/config → src → repochan-page → monorepo root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "..", "..", "..");
const personaPath = path.join(monorepoRoot, ".repochan", "persona", "current.json");

let persona: PersonaJson | null = null;
try {
  persona = JSON.parse(readFileSync(personaPath, "utf-8")) as PersonaJson;
} catch {
  persona = null; // fallback below
}

// ---------------------------------------------------------------------------
// Fallback persona — the only source of default palette values
// ---------------------------------------------------------------------------

const fallbackPalette = {
  mainColor: "#6ee7ff",
  secondaryColor: "#0f172a",
  accentColors: ["#a78bfa", "#f9a8d4"],
};

const fallback: PersonaJson = {
  name: "Chan",
  nameZh: "酱酱",
  catchphrase: "Don't rush — good characters need to compile.",
  personality:
    "A warm, reliable atelier senior with a perfectionist streak. Obsessive about color palettes. Deadpan humor.",
  ...fallbackPalette,
  signaturePatterns: [
    "Diamond cursor marks and version-number digits in a low-contrast seamless repeat.",
    "Git DAG node-connection lines forming a thin geometric grid.",
    "JSON field names in monospace forming faint stripe bands.",
    "Color-swatch offset squares in a Mondrian-style split.",
  ],
  keyMotifs: [
    "Diamond cursor mark",
    "Git DAG graph",
    "JSON schema field names",
    "Version-number tags",
  ],
  artStyle: "Cel-shading + Constructivism — clean lines, flat color blocks, geometric precision.",
};

const p = persona ?? fallback;

// ---------------------------------------------------------------------------
// Build the site config
// ---------------------------------------------------------------------------

const palette: SitePalette = {
  primary: p.mainColor ?? fallbackPalette.mainColor,
  base: p.secondaryColor ?? fallbackPalette.secondaryColor,
  accent1: p.accentColors?.[0] ?? fallbackPalette.accentColors[0],
  accent2: p.accentColors?.[1] ?? fallbackPalette.accentColors[1],
  get primaryRgb() {
    return hexToRgb(this.primary);
  },
  get baseRgb() {
    return hexToRgb(this.base);
  },
  get accent1Rgb() {
    return hexToRgb(this.accent1);
  },
  get accent2Rgb() {
    return hexToRgb(this.accent2);
  },
};

const patterns = p.signaturePatterns ?? [];

const textures: TextureSlot[] = [
  {
    src: "/textures/texture1.webp",
    usage: "hero-bg",
    desc: patterns[0] ?? "Subtle hero background texture",
  },
];

export const site: SiteConfig = {
  persona: {
    name: p.name ?? "RepoChan",
    nameZh: p.nameZh ?? "仓库娘",
    tagline: p.catchphrase ?? "",
    personality: p.personality ?? "",
  },
  palette,
  textures,
  motifs: p.keyMotifs ?? [],
  artStyle: p.artStyle ?? "Cel-shading + Constructivism",
  construct: {
    radius: "0px",
    lineWeight: "3px",
    lineColor: p.secondaryColor ?? fallbackPalette.secondaryColor,
    gridGap: "3px",
  },
};

// ---------------------------------------------------------------------------
// CSS variable string — injected by SiteLayout via <style is:inline>
// ---------------------------------------------------------------------------

export function buildCssVars(): string {
  const lines = [
    `  --c-primary: ${palette.primary};`,
    `  --c-base: ${palette.base};`,
    `  --c-accent-1: ${palette.accent1};`,
    `  --c-accent-2: ${palette.accent2};`,
    `  --c-primary-rgb: ${palette.primaryRgb};`,
    `  --c-base-rgb: ${palette.baseRgb};`,
    `  --c-accent-1-rgb: ${palette.accent1Rgb};`,
    `  --c-accent-2-rgb: ${palette.accent2Rgb};`,
    `  --texture-hero: url('${textures[0].src}');`,
    `  --construct-radius: ${site.construct.radius};`,
    `  --construct-line: ${site.construct.lineWeight};`,
    `  --construct-line-color: ${site.construct.lineColor};`,
    `  --construct-gap: ${site.construct.gridGap};`,
  ];
  return `:root {\n${lines.join("\n")}\n}`;
}

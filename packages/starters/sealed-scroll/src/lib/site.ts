import assetsConfig from "../../repochan/assets.json";
import siteConfig from "../../repochan/site.json";

// Single source of truth for theme + asset slots. The presentation layer
// never hardcodes colors: buildCssVars() expands the five canonical theme
// colors from repochan/site.json into the full token set the stylesheet
// consumes, and injects the slot asset URLs from repochan/assets.json.

export const site = siteConfig;
export const assets = assetsConfig.assets;

type Rgb = [number, number, number];

function hexToRgbTuple(value: string): Rgb {
  const hex = value.replace(/^#/, "");
  const expanded = hex.length === 3 ? [...hex].map((part) => `${part}${part}`).join("") : hex;
  if (!/^[\da-f]{6}$/i.test(expanded)) throw new Error(`Theme color must be a 3 or 6 digit hex value: ${value}`);
  return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16)) as Rgb;
}

function rgbToHex([r, g, b]: Rgb): string {
  const channel = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Multiply every channel by f (darken toward black). */
function scale(color: Rgb, f: number): Rgb {
  return [color[0] * f, color[1] * f, color[2] * f];
}

/** Linear mix: t = weight of `b`. */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Push every channel toward white by t. */
function lighten(color: Rgb, t: number): Rgb {
  return mix(color, [255, 255, 255], t);
}

function triplet(color: Rgb): string {
  return color.map((v) => Math.max(0, Math.min(255, Math.round(v)))).join(" ");
}

export function buildCssVars(): string {
  const paper = hexToRgbTuple(site.theme.base); // L1a main ground
  const emerald = hexToRgbTuple(site.theme.primary); // primary interaction / accent
  const amber = hexToRgbTuple(site.theme.accents[0] ?? site.theme.primary); // warm light / secondary accent
  const steel = hexToRgbTuple(site.theme.accents[1] ?? site.theme.primary); // cool support (architecture band)
  const ink = hexToRgbTuple(site.theme.ink); // body ink

  // Derived shades — deterministic functions of the canonical five. Ratios are
  // chosen to reproduce the approved palette within a few channel units
  // (documented in PRODUCTIZATION.md); AA contrast re-verified per build round.
  const inkDeep = scale(ink, 0.72); // footer / night roll-close
  const inkSoft = mix(ink, paper, 0.2); // secondary text on paper
  const inkFaint = mix(ink, paper, 0.28); // captions on paper (AA)
  const emeraldDeep = scale(emerald, 0.52); // text-grade emerald on paper
  const amberDeep = scale(amber, 0.45); // small text accents on paper
  const amberGlow = mix(amber, paper, 0.35); // lightened amber for glows
  const dawn = mix(amber, paper, 0.69); // morning cream, meets the cta composite top edge
  const paperDim = scale(paper, 0.96); // paper shaded one step
  const steelDeep = scale(steel, 0.5); // labels / table heads
  const paperHi = lighten(paper, 0.5); // lifted paper for cards

  const tokens: Record<string, string> = {
    paper: rgbToHex(paper),
    emerald: rgbToHex(emerald),
    amber: rgbToHex(amber),
    steel: rgbToHex(steel),
    ink: rgbToHex(ink),
    "ink-deep": rgbToHex(inkDeep),
    "ink-soft": rgbToHex(inkSoft),
    "ink-faint": rgbToHex(inkFaint),
    "emerald-deep": rgbToHex(emeraldDeep),
    "amber-deep": rgbToHex(amberDeep),
    "amber-glow": rgbToHex(amberGlow),
    dawn: rgbToHex(dawn),
    "paper-dim": rgbToHex(paperDim),
    "steel-deep": rgbToHex(steelDeep),
    "paper-hi": rgbToHex(paperHi),
    // alpha-bearing tokens built on rgb triplets
    "line-ink": `rgb(${triplet(ink)} / 0.82)`,
    "line-ink-soft": `rgb(${triplet(ink)} / 0.18)`,
    "paper-on-ink": `rgb(${triplet(paper)} / 0.92)`,
    "paper-rgb": triplet(paper),
    "paper-hi-rgb": triplet(paperHi),
    "ink-rgb": triplet(ink),
    "ink-deep-rgb": triplet(inkDeep),
    "emerald-rgb": triplet(emerald),
    "steel-rgb": triplet(steel),
    "dawn-rgb": triplet(dawn),
    // slot asset urls (single-sourced from repochan/assets.json)
    "asset-hero": `url("${assets["hero-composite"].src}")`,
    "asset-cta": `url("${assets["cta-composite"].src}")`,
    "asset-pattern": `url("${assets["pattern-tile"].src}")`,
  };
  return `:root {\n${Object.entries(tokens).map(([key, value]) => `  --${key}: ${value};`).join("\n")}\n}`;
}

import assetsConfig from "../../repochan/assets.json";
import siteConfig from "../../repochan/site.json";

// Single source of truth for theme tokens and asset slots. The presentation
// layer never hardcodes colors: buildCssVars() expands the canonical theme
// colors from repochan/site.json into the token set the stylesheet consumes
// (BaseLayout injects the result as CSS variables), and slotSrc exposes the
// asset URLs declared in repochan/assets.json.

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

/** Multiply every channel by f (brighten when f > 1, darken when f < 1). */
function scale(color: Rgb, f: number): Rgb {
  return [color[0] * f, color[1] * f, color[2] * f];
}

function triplet(color: Rgb): string {
  return color.map((v) => Math.max(0, Math.min(255, Math.round(v)))).join(" ");
}

export function buildCssVars(): string {
  const ink = hexToRgbTuple(site.theme.ink); // page ground
  const paper = hexToRgbTuple(site.theme.base); // primary foreground / card
  const sky = hexToRgbTuple(site.theme.primary); // primary interaction accent
  const pink = hexToRgbTuple(site.theme.accents[0] ?? site.theme.primary); // secondary accent
  const violet = hexToRgbTuple(site.theme.accents[1] ?? site.theme.primary); // voice accent
  const mint = hexToRgbTuple(site.theme.accents[2] ?? site.theme.primary); // chip / fact accent
  const amber = hexToRgbTuple(site.theme.accents[3] ?? site.theme.primary); // quote / night accent

  // Derived shades — deterministic functions of the canonical theme colors,
  // chosen to reproduce the approved palette within a few channel units.
  const ink2 = scale(ink, 1.55); // panel ground
  const ink3 = scale(ink, 2.25); // raised card ground
  const voiceDeep = scale(ink, 1.2); // voice-section gradient midpoint

  const tokens: Record<string, string> = {
    ink: rgbToHex(ink),
    ink2: rgbToHex(ink2),
    ink3: rgbToHex(ink3),
    paper: rgbToHex(paper),
    sky: rgbToHex(sky),
    pink: rgbToHex(pink),
    violet: rgbToHex(violet),
    mint: rgbToHex(mint),
    amber: rgbToHex(amber),
    "voice-deep": rgbToHex(voiceDeep),
    // alpha-bearing tokens built on rgb triplets
    "ink-rgb": triplet(ink),
    "ink2-rgb": triplet(ink2),
    "paper-rgb": triplet(paper),
    "sky-rgb": triplet(sky),
    "pink-rgb": triplet(pink),
    "violet-rgb": triplet(violet),
    "amber-rgb": triplet(amber),
    line: `rgb(${triplet(paper)} / 0.14)`,
    "line-ink": `rgb(${triplet(ink)} / 0.12)`,
    // slot asset urls (single-sourced from repochan/assets.json)
    "asset-pattern": `url("${assets.pattern.src}")`,
  };
  return `:root {\n${Object.entries(tokens).map(([key, value]) => `  --${key}: ${value};`).join("\n")}\n}`;
}

/** Slot asset URLs consumed by components, single-sourced from repochan/assets.json. */
export const slotSrc = {
  heroCutout: assets["hero-cutout"].src,
  sceneDay: assets["scene-day"].src,
  sceneNight: assets["scene-night"].src,
  // The three hero float stickers are the bundle's loading / cozy / success cells.
  heroStickers: [
    assets.stickers.items.loading.src,
    assets.stickers.items.cozy.src,
    assets.stickers.items.success.src,
  ],
  // Derived member of the favicon set produced by the icon slot (see its description).
  icon192: "/icon-192.png",
} as const;

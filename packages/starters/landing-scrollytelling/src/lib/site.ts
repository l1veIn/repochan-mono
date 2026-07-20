/**
 * Single source of truth for the site: project facts and the five canonical
 * theme colors come from repochan/site.json; asset URLs come from
 * repochan/assets.json. The presentation layer never hardcodes colors —
 * buildCssVars() expands the canonical colors into the full token set the
 * stylesheet consumes (derived shades are deterministic functions of the
 * canonical five, tuned to reproduce the approved palette within a few
 * channel units). All section copy lives in repochan/i18n/{zh,en}.json.
 */
import assetsConfig from "../../repochan/assets.json";
import siteConfig from "../../repochan/site.json";

export const site = {
  name: siteConfig.project.name,
  repositoryUrl: siteConfig.project.repositoryUrl ?? "",
  installCmd: "npm install -g repochan",
  themeColor: siteConfig.theme.primary,
  ogImage: assetsConfig.assets.foundation.src,
} as const;

export type Locale = "zh" | "en";

export const locales: Record<Locale, { path: string; label: string; langAttr: string }> = {
  zh: { path: "/", label: "中文", langAttr: "zh-CN" },
  en: { path: "/en/", label: "EN", langAttr: "en" },
};

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
  const blue = hexToRgbTuple(siteConfig.theme.primary); // primary accent
  const bg = hexToRgbTuple(siteConfig.theme.base); // page ground
  const txt = hexToRgbTuple(siteConfig.theme.ink); // body text (light ink on dark ground)
  const pink = hexToRgbTuple(siteConfig.theme.accents[0] ?? siteConfig.theme.primary);
  const purple = hexToRgbTuple(siteConfig.theme.accents[1] ?? siteConfig.theme.primary);
  const green = hexToRgbTuple(siteConfig.theme.accents[2] ?? siteConfig.theme.primary);
  const yellow = hexToRgbTuple(siteConfig.theme.accents[3] ?? siteConfig.theme.primary);
  const white: Rgb = [255, 255, 255];

  // Derived shades — deterministic functions of the canonical colors, tuned
  // to reproduce the approved palette within a few channel units.
  const ink = mix(bg, txt, 0.03); // dark text on light chips/buttons
  const bg2 = lighten(bg, 0.035); // ground lifted one step
  const dim = mix(txt, bg, 0.39); // secondary text / hairline borders
  const hi = white; // speech bubble, cursor stroke, lit wire cell
  const termBg = scale(bg, 0.93); // terminal / mini-browser body
  const termFg = mix(txt, bg, 0.18); // terminal default line color
  const txtSoft = mix(txt, bg, 0.13); // hero sub-copy
  const panel1 = mix(bg, purple, 0.08); // dossier gradient top
  const panel2 = mix(bg, purple, 0.045); // dossier gradient bottom
  const bdayBg = scale(yellow, 0.1); // dossier birthday tag ground
  const shade = scale(bg, 0); // pure black for shadows and masks
  // macOS window-chrome dots — fixed OS convention, not theme colors.
  const lightRed: Rgb = [255, 95, 87];
  const lightAmber: Rgb = [254, 188, 46];
  const lightGreen: Rgb = [40, 200, 64];

  const tokens: Record<string, string> = {
    ink: rgbToHex(ink),
    bg: rgbToHex(bg),
    bg2: rgbToHex(bg2),
    blue: rgbToHex(blue),
    pink: rgbToHex(pink),
    purple: rgbToHex(purple),
    green: rgbToHex(green),
    yellow: rgbToHex(yellow),
    txt: rgbToHex(txt),
    dim: rgbToHex(dim),
    hi: rgbToHex(hi),
    "term-bg": rgbToHex(termBg),
    "term-fg": rgbToHex(termFg),
    "txt-soft": rgbToHex(txtSoft),
    "panel-1": rgbToHex(panel1),
    "panel-2": rgbToHex(panel2),
    "bday-bg": rgbToHex(bdayBg),
    shade: rgbToHex(shade),
    "light-red": rgbToHex(lightRed),
    "light-amber": rgbToHex(lightAmber),
    "light-green": rgbToHex(lightGreen),
    // alpha-bearing helpers built on rgb triplets
    "bg-rgb": triplet(bg),
    "txt-rgb": triplet(txt),
    "dim-rgb": triplet(dim),
    "blue-rgb": triplet(blue),
    "pink-rgb": triplet(pink),
    "purple-rgb": triplet(purple),
    "green-rgb": triplet(green),
    "yellow-rgb": triplet(yellow),
    "shade-rgb": triplet(shade),
    mono: "'JetBrains Mono', ui-monospace, monospace",
    sans: "'Noto Sans SC', system-ui, sans-serif",
    hand: "'Permanent Marker', cursive",
    // slot asset urls consumed by CSS backgrounds (single-sourced from repochan/assets.json)
    "asset-studio-wide": `url("${assetsConfig.assets["studio-wide"].src}")`,
    "asset-pattern": `url("${assetsConfig.assets["seamless-pattern"].src}")`,
  };
  return `:root {\n${Object.entries(tokens)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n")}\n}`;
}

/** Web-state bundle publication keys ordered by grid cell (tile index). */
const tileKeys = [
  "welcome",
  "searching",
  "loading",
  "empty",
  "error",
  "success",
  "not-found",
  "cta",
  "cozy",
] as const;

const tileItems = assetsConfig.assets["webstate-tiles"].items;

/** Asset paths, resolved from repochan/assets.json slot state. */
export const assets = {
  studioWide: assetsConfig.assets["studio-wide"].src,
  cutoutWave: assetsConfig.assets["cutout-wave"].src,
  cutoutPoint: assetsConfig.assets["cutout-point"].src,
  foundation: assetsConfig.assets.foundation.src,
  icon: assetsConfig.assets.icon.src,
  pattern: assetsConfig.assets["seamless-pattern"].src,
  poster: assetsConfig.assets.poster.src,
  banner: assetsConfig.assets["readme-banner"].src,
  stickers: assetsConfig.assets["sticker-set"].src,
  tile: (i: number) => tileItems[tileKeys[i]].src,
} as const;

const assetByKey: Record<string, string> = {
  studioWide: assets.studioWide,
  cutoutWave: assets.cutoutWave,
  cutoutPoint: assets.cutoutPoint,
  foundation: assets.foundation,
  icon: assets.icon,
  pattern: assets.pattern,
  poster: assets.poster,
  banner: assets.banner,
  stickers: assets.stickers,
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`tile${i}`, assets.tile(i)])),
};

/** Resolve an i18n asset key (e.g. "tile5") to its public path. */
export function assetPath(key: string): string {
  const path = assetByKey[key];
  if (!path) throw new Error(`Unknown asset key: ${key}`);
  return path;
}

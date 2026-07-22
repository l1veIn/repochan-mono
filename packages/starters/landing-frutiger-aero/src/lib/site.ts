import assetsConfig from "../../repochan/assets.json";
import siteConfig from "../../repochan/site.json";

// Single source of truth for theme + asset slots. The presentation layer
// never hardcodes colors: buildCssVars() expands the canonical theme colors
// from repochan/site.json into the full token set the stylesheet consumes
// (each token emitted as both --name and --name-rgb channels), and injects
// the slot asset URLs from repochan/assets.json.

export type Locale = "zh" | "en";

export const site = siteConfig;
export const assets = assetsConfig.assets;

function hexToRgb(value: string): string {
  const compact = value.replace(/^#/, "");
  const hex = compact.length === 3 ? [...compact].map((part) => `${part}${part}`).join("") : compact;
  if (!/^[\da-f]{6}$/i.test(hex)) throw new Error(`Theme color must be a 3 or 6 digit hex value: ${value}`);
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(" ");
}

export function scalarAsset(slot: keyof typeof assets): string {
  const asset = assets[slot];
  if (!asset || asset.kind !== "scalar" || !("src" in asset)) {
    throw new Error(`Missing scalar asset slot: ${slot}`);
  }
  return asset.src;
}

export function buildCssVars(): string {
  const [
    pink,
    violet,
    mint,
    sun,
    inkDeep,
    sky300,
    sky200,
    sky800,
    sky700,
    sky600,
    cyan800,
    cyan700,
    cyan600,
    mint100,
    mint200,
    emerald600,
    pink200,
    pink600,
    pink700,
    pink400,
    violet200,
    violet600,
    amber200,
    amber600,
    white,
  ] = site.theme.accents;
  const colors = {
    sky: site.theme.primary,
    base: site.theme.base,
    ink: site.theme.ink,
    pink,
    violet,
    mint,
    sun,
    "ink-deep": inkDeep,
    "sky-300": sky300,
    "sky-200": sky200,
    "sky-800": sky800,
    "sky-700": sky700,
    "sky-600": sky600,
    "cyan-800": cyan800,
    "cyan-700": cyan700,
    "cyan-600": cyan600,
    "mint-100": mint100,
    "mint-200": mint200,
    "emerald-600": emerald600,
    "pink-200": pink200,
    "pink-600": pink600,
    "pink-700": pink700,
    "pink-400": pink400,
    "violet-200": violet200,
    "violet-600": violet600,
    "amber-200": amber200,
    "amber-600": amber600,
    white,
  };
  const tokens = Object.entries(colors).flatMap(([name, value]) => [
    `  --${name}: ${value};`,
    `  --${name}-rgb: ${hexToRgb(value)};`,
  ]);
  tokens.push(`  --asset-hero: url("${scalarAsset("hero-master")}");`);
  return `:root {\n${tokens.join("\n")}\n}`;
}

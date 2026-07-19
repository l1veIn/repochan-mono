import assetsConfig from "../../repochan/assets.json";
import en from "../../repochan/i18n/en.json";
import siteConfig from "../../repochan/site.json";

export type LocaleBundle = typeof en;
export type Locale = "en" | "zh";
export type IconName =
  | "artifact"
  | "foundation"
  | "agent"
  | "search"
  | "persona"
  | "assets"
  | "website"
  | "ship";

export const site = siteConfig;
export const assets = assetsConfig.assets;

function hexToRgb(value: string): string {
  const compact = value.replace(/^#/, "");
  const hex = compact.length === 3 ? [...compact].map((part) => `${part}${part}`).join("") : compact;
  if (!/^[\da-f]{6}$/i.test(hex)) throw new Error(`Theme color must be a 3 or 6 digit hex value: ${value}`);
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(" ");
}

export function buildCssVars(): string {
  const [
    cobaltDeep,
    cobaltSoft,
    ivoryLight,
    paper,
    coral,
    coralSoft,
    teal,
    tealDeep,
    tealSoft,
    navy,
    muted,
    white,
    black,
    line,
    lineStrong,
  ] = site.theme.accents;
  const colors = {
    cobalt: site.theme.primary,
    "cobalt-deep": cobaltDeep,
    "cobalt-soft": cobaltSoft,
    ivory: site.theme.base,
    "ivory-light": ivoryLight,
    paper,
    coral,
    "coral-soft": coralSoft,
    teal,
    "teal-deep": tealDeep,
    "teal-soft": tealSoft,
    navy,
    ink: site.theme.ink,
    muted,
    white,
    black,
    line,
    "line-strong": lineStrong,
  };
  const tokens = Object.entries(colors).flatMap(([name, value]) => [
    `  --${name}: ${value};`,
    `  --${name}-rgb: ${hexToRgb(value)};`,
  ]);
  return `:root {\n${tokens.join("\n")}\n}`;
}

export function scalarAsset(slot: keyof typeof assets): string {
  const asset = assets[slot];
  if (!asset || asset.kind !== "scalar") throw new Error(`Missing scalar asset slot: ${slot}`);
  return asset.src;
}

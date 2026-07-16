import assetsConfig from "../../repochan/assets.json";
import siteConfig from "../../repochan/site.json";

function hexToRgb(value: string): string {
  const hex = value.replace(/^#/, "");
  const expanded = hex.length === 3 ? [...hex].map((part) => `${part}${part}`).join("") : hex;
  if (!/^[\da-f]{6}$/i.test(expanded)) throw new Error(`Theme color must be a 3 or 6 digit hex value: ${value}`);
  return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16)).join(" ");
}

export const site = siteConfig;
export const assets = assetsConfig.assets;

export function buildCssVars(): string {
  const [accent1 = site.theme.primary, accent2 = accent1] = site.theme.accents;
  const tokens = {
    "c-primary": site.theme.primary,
    "c-base": site.theme.base,
    "c-ink": site.theme.ink,
    "c-accent-1": accent1,
    "c-accent-2": accent2,
    "c-primary-rgb": hexToRgb(site.theme.primary),
    "c-base-rgb": hexToRgb(site.theme.base),
    "c-ink-rgb": hexToRgb(site.theme.ink),
    "c-accent-1-rgb": hexToRgb(accent1),
    "c-accent-2-rgb": hexToRgb(accent2),
  };
  return `:root {\n${Object.entries(tokens).map(([key, value]) => `  --${key}: ${value};`).join("\n")}\n}`;
}

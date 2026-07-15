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

export function buildFaviconDataUri(): string {
  const [accent1 = site.theme.primary, accent2 = accent1] = site.theme.accents;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill=${JSON.stringify(site.theme.primary)}/><path d="M32 10 51 21v22L32 54 13 43V21z" fill="none" stroke=${JSON.stringify(accent2)} stroke-width="5"/><circle cx="32" cy="32" r="8" fill=${JSON.stringify(accent1)}/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function buildCssVars(): string {
  const [accent1 = site.theme.primary, accent2 = accent1] = site.theme.accents;
  const tokens = {
    "c-primary": site.theme.primary,
    "c-base": site.theme.base,
    "c-accent-1": accent1,
    "c-accent-2": accent2,
    "c-primary-rgb": hexToRgb(site.theme.primary),
    "c-base-rgb": hexToRgb(site.theme.base),
    "c-accent-1-rgb": hexToRgb(accent1),
    "c-accent-2-rgb": hexToRgb(accent2),
  };
  return `:root {\n${Object.entries(tokens).map(([key, value]) => `  --${key}: ${value};`).join("\n")}\n}`;
}

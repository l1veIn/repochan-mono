import type { AssetRef, PageData } from "@repochan/core";
import { compileTheme, formatCSSVars } from "./theme.js";
import { renderSection } from "./templates/index.js";
import type { AssetPathResolver, RenderResult } from "./types.js";
import { escapeHtml, resolveAssetPath } from "./utils.js";

/**
 * Pre-resolved asset mapping: AssetRef (orderId+versionId+file) -> output path.
 * The caller resolves this via core's checkPageAssets() + readOrderResult().
 */
export type ResolvedAssets = Map<string, string>;
// key: `${orderId}/${versionId ?? 'current'}/${file}`
// value: relative output path, e.g. "assets/hero.png"

/** Generate a unique key for an AssetRef. */
export function assetKey(ref: AssetRef): string {
  return `${ref.orderId}/${ref.versionId ?? "current"}/${ref.file}`;
}

function createAssetResolver(resolvedAssets?: ResolvedAssets): AssetPathResolver {
  return (ref) => resolvedAssets?.get(assetKey(ref)) ?? resolveAssetPath(ref);
}

/**
 * Generate the base CSS: reset rules, container utility, and theme variables.
 */
function generateBaseCSS(page: PageData): string {
  const { light, dark } = compileTheme(page.theme);
  const lightVars = formatCSSVars(":root", light);
  const darkVars = formatCSSVars('[data-theme="dark"]', dark);

  return `
${lightVars}

${darkVars}

/* Reset */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }

body {
  font-family: var(--font-family);
  background-color: var(--color-background);
  color: var(--color-text);
  line-height: 1.6;
  transition: background-color 0.3s ease, color 0.3s ease;
}

img { max-width: 100%; height: auto; display: block; }

a { text-decoration: none; color: inherit; }

/* Container */
.container {
  width: 100%;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
}

/* Responsive grid helper */
.grid {
  display: grid;
  gap: 1.5rem;
}

/* Dark mode toggle (optional, via [data-theme]) */
[data-theme="dark"] { color-scheme: dark; }

/* Print-friendly */
@media print {
  nav, footer { display: none; }
  section { break-inside: avoid; }
}
`.trim();
}

/**
 * Render a complete PageData into a static HTML document.
 *
 * @param page The page data (theme + sections)
 * @param resolvedAssets Map of asset keys -> output paths (from checkPageAssets)
 * @returns RenderResult with html, css, and asset copy instructions
 */
export function renderPage(
  page: PageData,
  resolvedAssets?: ResolvedAssets,
): RenderResult {
  const css = generateBaseCSS(page);
  const resolveAsset = createAssetResolver(resolvedAssets);

  const bodyContent = page.sections
    .map((section) => renderSection(section, resolveAsset))
    .join("\n");

  const assets: RenderResult["assets"] = [];
  if (resolvedAssets) {
    for (const [, destPath] of resolvedAssets) {
      assets.push({
        source: "",
        destination: destPath,
      });
    }
  }

  const themeAttr = page.theme.darkMode ? 'data-theme="dark"' : "";

  const html = `<!DOCTYPE html>
<html lang="en"${themeAttr ? ` ${themeAttr}` : ""}>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
${css}
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;

  return { html, css, assets };
}

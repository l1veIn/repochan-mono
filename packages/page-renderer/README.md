# @repochan/page-renderer

Static HTML renderer for RepoChan Page JSON. Takes a `PageData` artifact (produced by the `repochan-page-designer` role) and renders it into a self-contained, **zero-runtime-JS** HTML document.

This is a pure rendering library — it depends on `@repochan/core` only for shared types (`PageData`, `PageTheme`, `AssetRef`). It never reads `.repochan/` itself; the caller resolves assets and hands them in.

## What it does

```
PageData (from .repochan/pages/current.json)
        │
        │  renderPage(page, resolvedAssets?)
        ▼
RenderResult { html, css, assets[] }
```

- **HTML** — complete `<!DOCTYPE html>` document, sections rendered in order, Tailwind CDN + inline `<style>` for theme.
- **CSS** — base reset, container utility, responsive grid, plus theme CSS variables (light + dark).
- **assets** — list of `{ source, destination }` pairs the caller should copy into the output directory.

The output is intentionally framework-free: no React, no build step, no client-side JS. Open the HTML in a browser and it works.

## Public API

```ts
import { renderPage, assetKey } from "@repochan/page-renderer";
import type { RenderResult, ResolvedAssets } from "@repochan/page-renderer";
```

### `renderPage(page, resolvedAssets?)`

Renders a `PageData` into a `RenderResult`.

- `page: PageData` — the page artifact (theme + ordered sections). Type comes from `@repochan/core`'s `PageArtifactSchema`.
- `resolvedAssets?: ResolvedAssets` — optional `Map` from asset key → output path. When provided, the renderer rewrites `AssetRef`s to those output paths throughout the page.
- Returns `{ html, css, assets }`.

### `assetKey(ref)`

Stable key for an `AssetRef`: `` `${orderId}/${versionId ?? "current"}/${file}` ``. Used to build the `ResolvedAssets` map on the caller side.

## Section templates

Each section type has multiple layout variants. The dispatcher (`renderSection`) routes by `type + variant`; unknown combinations return an empty string (graceful degradation).

| Section   | Variants                                    |
|-----------|---------------------------------------------|
| `navbar`  | `simple`, `with-cta`                        |
| `hero`    | `centered`, `split-right`, `split-left`, `full-bg` |
| `features`| `grid-2`, `grid-3`, `grid-4`                |
| `stats`   | `row`, `grid`                               |
| `gallery` | `grid`, `masonry`                           |
| `cta`     | `centered`, `banner`                        |
| `footer`  | `standard`, `minimal`                       |

Adding a new variant = adding a template function under `src/templates/<type>.ts` and a `case` in `src/templates/index.ts`. The section shape itself (content fields) is defined in `@repochan/core`'s `PageArtifactSchema`.

## Theming

`src/theme.ts` compiles a `PageTheme` (primary/secondary/accent/background hex colors + `style` preset + optional `darkMode`/`fontFamily`) into CSS variables:

- `compileTheme(theme)` → `{ light, dark }` variable maps. `style` (`modern` / `playful` / `minimal` / `techy` / `elegant`) selects a `STYLE_PRESETS` base that the explicit colors override.
- `formatCSSVars(selector, vars)` → a CSS block like `:root { --color-primary: #...; }`.
- Helpers: `darken`, `lighten`, `withAlpha`, `isValidHex`.

Dark mode is emitted under `[data-theme="dark"]`; if `page.theme.darkMode` is true the document starts in dark mode.

## Asset resolution (caller's responsibility)

The renderer does **not** touch `.repochan/`. Resolving an `AssetRef` (orderId + versionId + file) to an actual file on disk is the caller's job, because it requires reading order results — a `core` concern.

Typical caller flow (this is what `pi`'s `page.create` does):

```ts
import { checkPageAssets, readOrderResult } from "@repochan/core";
import { renderPage, assetKey } from "@repochan/page-renderer";

// 1. Validate that every AssetRef points to a real delivered file.
const refs = collectAssetRefs(page);
const resolved = await checkPageAssets(projectRoot, refs); // throws if missing

// 2. Build the ResolvedAssets map: assetKey(ref) -> stable output path
const resolvedAssets = new Map();
for (const ref of refs) {
  resolvedAssets.set(assetKey(ref), `assets/${ref.orderId}/${ref.versionId ?? "current"}/${ref.file}`);
}

// 3. Render.
const { html, assets } = renderPage(page, resolvedAssets);

// 4. Caller writes html to pages/site/index.html and copies asset files.
```

This separation keeps the renderer pure and testable without a `.repochan/` fixture.

## Why zero-JS

RepoChan pages are static brand assets — they should open in any browser, embed in any host, and survive for years without a JS runtime. The renderer deliberately avoids:

- client-side frameworks (React/Vue/Svelte),
- hydration / client data fetching,
- any `<script>` beyond the Tailwind CDN (used purely for utility-class styling at view time).

If interactivity is ever needed, the intended path is to layer it on top of this static base in a separate package, not to push it into the renderer.

## Development

```bash
pnpm --filter @repochan/page-renderer build     # tsc → dist/
pnpm --filter @repochan/page-renderer test      # vitest, uses inline fixtures (no .repochan/ needed)
```

Tests live in `test/render.test.ts` and exercise the templates against synthetic `PageData` — they do not require a real `.repochan/` workspace.

## Related

- Section/content schema: `PageArtifactSchema` in [`@repochan/core`](../core/README.md) `src/schemas/index.ts`.
- Page design role (produces `PageData`): [`packages/pi/skills/repochan-page-designer`](../pi/skills/repochan-page-designer/SKILL.md).
- Architectural context: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md).

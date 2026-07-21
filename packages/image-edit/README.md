# @repochan/image-edit

Zero-credential local pixel operations for RepoChan: slicing, matting, compression, resizing, and format conversion.

Pure pixel functions — **no network, no credentials, no `.repochan/` protocol awareness.** Input is an image path (and params); output is derived images or metadata. Page assembly writes derived assets into the pulled Starter's `public/`; order-result versions remain immutable.

> **Page-assembly boundary:** Painter never runs extraction or QA operations on order results — the one sanctioned touchpoint is consuming a layout-guide PNG as an `image gen --reference` composition aid. `repochan-web-designer` may use CLI bindings while implementing an original site; `repochan-page-designer` consumes them through atomic starter commands while localizing a pulled starter. Derived files stay in the assembled site's `public/`, never `.repochan/` or a source starter. See `AGENTS.md` product invariant #5.

## API

All ops are exposed via `@repochan/image-edit`; selected operations also have `repochan image edit <op>` CLI bindings.

**Slicing & stickers**
- `sliceImage(imagePath, rows, cols)` → `{ tiles, sourceFile }` — coordinate preview only; reads the image, computes tile bounds, and writes no files.
- `sliceGridToFiles(imagePath, outDir, { rows, cols, padding, nameTemplate, overwrite })` → `{ sourceFile, tiles }` — crop a grid into individual tile PNGs on disk.
- `extractStickersFromImage(imagePath, options, outDir)` → `{ stickers, sourceFile, config }` — ML matting (ISNet via `@imgly`) + blob detection → transparent sticker PNGs written to `outDir`.
- `findConnectedComponents(alpha, width, height, threshold)` → blobs — locate foreground regions in an alpha mask.
- `extractMatteGrid(imagePath, outDir, options)` → `{ items, matteColor, ... }` — deterministic grid extraction: whole-sheet chroma → centroid cell geometry → debris handling → alpha QA → trim/normalize (default since PR7: strategy `chroma-grid` + pipeline `v2`; `equal-cell` per-cell chroma + `v1` remain as explicit escape hatches). It accepts semantic cell mapping/subsets, emits named transparent PNGs on a fixed canvas, and rejects empty, edge-touching, or out-of-range foreground before writing any outputs.
- `extractAssets(imagePath, outDir, options)` → `{ items, qa, matteColor, ... }` — unified grid extraction behind a strategy enum: `chroma-grid` (default; whole-sheet chroma → centroid cell geometry → debris handling), `equal-cell` (pre-PR7 legacy fixed-grid crop → per-cell chroma, explicit escape hatch), `ml-blobs` (ML matting + blob detection), `hybrid` (chroma-grid with explicit ML fallback). Centroid geometry: the noise floor is relative to the average seed-cell area (`minBlobFraction`, absolute floor `noiseMinAbs` 60), so small floating decorations survive; border-hugging debris unions into the owner bbox by default (`debrisPolicy: "drop"` opts out). Structured QA failures raise `ExtractError` carrying `defects[]` (`empty_cell`, `edge_touch` / `sheet_edge_touch`, `foreground_ratio_low/high`, `frame_count_mismatch`, `matte_subject_collision`, `chroma_residue`, `ml_unavailable`, `invalid_options`) plus a `qa` report (`strategyUsed`, `pipeline`, matte info, metrics). CLI: `repochan image edit extract` (`--strategy`, `--pipeline`, `--matte-select`, `--mapping`, `--normalize`, `--json`).
- `writeLayoutGuide(outPath, { rows, cols, ... })` — deterministic geometry PNG (cell grid + ~10% safe-area inset) used as an `image gen --reference` composition guide for grid assets; it is a generation-side aid, not an extraction step. CLI: `repochan image edit layout-guide --rows R --cols C --out guide.png`.

**Iconfont (hollow-icon sheet → lucide-style SVG set)**
- `extractIconfont(imagePath, outDir, { rows, cols, mapping, chroma, geometry, normalizeSize, viewBox, overwrite })` → `{ icons, spriteFile, indexFile }` — extract a rows×cols outline-icon sheet via `extractAssets` (chroma-grid), vectorize each tile's alpha silhouette with the vendored imagetracer.js (`src/vendor/`, public domain; see `NOTICE`), and write true-vector SVGs: one `<svg viewBox="0 0 24 24" fill="currentColor"><path d="…"/></svg>` per icon, plus `sprite.svg` (`<symbol id="icon-{name}">`) and `index.json` (`repochan.iconfont.v1`: name/file/bbox/pathCount). Tiles are normalized onto a `normalizeSize` canvas (default 512) and path coordinates are scaled uniformly onto the `viewBox` (default 24); `geometry.alphaThreshold` (default 128) binarizes tile alpha for tracing. No embedded bitmaps; holes are reversed-direction subpaths under the default nonzero fill rule. Publishing is atomic staging with the same `overwrite` latch as `extractAssets`. CLI: `repochan image edit iconfont <sheet> --rows R --cols C --mapping a,b,c --out DIR [--pipeline v2] [--matte auto|#hex] [--matte-select corner|subject-aware] [--normalize 512] [--view-box 24] [--overwrite] [--json]`. Also available as the starter postprocess op `iconfont` (multi-output, must be the final step; args `rows`/`cols`/`mapping`/`normalizeSize`/`viewBox`/`pipeline`/`matteSelect`).

**Chroma pipelines (dual-track).** Every chroma path defaults to pipeline `v2` (PR7): soft-unmix keying — a behavior-aligned TypeScript port of sprite-gen's `extract.py`, Apache-2.0; see `NOTICE`. Pipeline `v1` (legacy Euclidean distance → smoothstep alpha, byte-frozen) remains as an explicit escape hatch via `pipeline: "v1"` / `--pipeline v1` on `chroma-key` and `extract`. Matte auto-selection defaults to corner sampling (`matteSelect: "corner"`); `"subject-aware"` first verifies each candidate matte against the sampled background (candidates that are not the sheet's actual background are excluded; when none match, it falls back to the corner-sampled color with a warning), then uses subject clearance as the tie-breaker and can hard-fail `matte_subject_collision`.

**Offline vs ML.** `slice*`, `chroma-key`, `extract` with `equal-cell` / `chroma-grid`, `layout-guide`, seam validation, compress/resize/ico/gif are fully offline and deterministic. `bg-remove`, `extract-stickers`, and `extract` strategies `ml-blobs` / `hybrid` run ISNet matting via `@imgly/background-removal-node`, which may download model weights on first use (network access); ML assist is always explicit — `hybrid` requires `--ml-fallback`.

**Seam validation**
- `validateSeamlessTile(imagePath, { threshold, boardOutFile, overwrite })` → structured edge metrics, pass/fail, provenance, and optional board metadata. The `premultiplied-rgba-l1-v1` metric compares each left/right and top/bottom edge pair using normalized L1 distance over premultiplied RGB plus alpha, reports mean and maximum deltas for each axis, and uses the larger edge mean as its score. `score <= threshold` passes (default threshold `0.02`). A requested board is a literal 3×3 PNG repetition for human hotspot and readability inspection.
- `computeTileSeamMetrics(rgba, width, height)` → pure in-memory form of the same deterministic metric. Transparent pixels are premultiplied, so invisible RGB noise does not create a false seam.

**Matting (background removal)**
- `removeImageBackground(imagePath, outFile, { model, overwrite })` → `{ sourceFile, outFile, width, height }` — ISNet matting → transparent PNG.
- `chromaKeyImage(imagePath, outFile, { matteColor, threshold, softness, spillSuppression })` → result — deterministic matte extraction (Euclidean RGB distance → alpha, spill suppression, RGB scrub). Use when the source has a known matte/solid background.
- `parseMatteColor(input)` / `matteColorToHex(matte)` — helpers for matte color input/output.

**Compression & resize**
- `inspectImage(imagePath)` → `{ format, width, height }` — decode-backed format inspection used before local assets are marked ready; `imageFormatForExtension(path)` normalizes supported file extensions.
- `compressImage(imagePath, outFile, { format, quality, maxWidth, overwrite })` → `{ sourceFile, outFile, format, quality, width, height, originalBytes, compressedBytes, ratio }` — WebP/JPEG/AVIF/PNG conversion with optional downscale.
- `resizeImage(imagePath, outDir, { targets, overwrite, fit })` → `{ sourceFile, outDir, outputs }` — multi-size PNG output (e.g. 16/32/48/180/512 for favicon/app-icon pipelines).

**Encoding**
- `generateIco(imagePath, outFile, { sizes, overwrite })` → `{ sourceFile, outFile, sizes }` — zero-dependency multi-resolution `.ico` encoder.
- `framesToGif(framePaths, outFile, { fps, delay, loop, overwrite })` → `{ outFile, frameCount, width, height, delay, loop }` — animated GIF from a frame sequence.

**Geometry helpers**
- `readPngSize(path)` → `{ width, height }` — read PNG dimensions from the IHDR chunk.
- `computeTileCells(width, height, rows, cols)` → `TilesMeta` — pure geometry: equal-sized cell rects for a grid.

## Dependencies

`@imgly/background-removal-node` (ISNet matting; also the source of the vendored `sharp` used for resize/compress/encode) and `gifenc` (GIF encoding). No `@repochan/core` dependency — this package is a pure downstream pixel tool.

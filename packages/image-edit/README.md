# @repochan/image-edit

Zero-credential local pixel operations for RepoChan: slicing, matting, compression, resizing, and format conversion.

Pure pixel functions — **no network, no credentials, no `.repochan/` protocol awareness.** Input is an image path (and params); output is derived images or metadata. Page assembly writes derived assets into the pulled Starter's `public/`; order-result versions remain immutable.

> **Page-assembly boundary:** Painter never runs these operations. `repochan-web-designer` may use CLI bindings while implementing an original site; `repochan-page-designer` consumes them through atomic starter commands while localizing a pulled starter. Derived files stay in the assembled site's `public/`, never `.repochan/` or a source starter. See `AGENTS.md` product invariant #5.

## API

All ops are exposed via `@repochan/image-edit`; selected operations also have `repochan image edit <op>` CLI bindings.

**Slicing & stickers**
- `sliceImage(imagePath, rows, cols)` → `{ tiles, sourceFile }` — coordinate preview only; reads the image, computes tile bounds, and writes no files.
- `sliceGridToFiles(imagePath, outDir, { rows, cols, padding, nameTemplate, overwrite })` → `{ sourceFile, tiles }` — crop a grid into individual tile PNGs on disk.
- `extractStickersFromImage(imagePath, options, outDir)` → `{ stickers, sourceFile, config }` — ML matting (ISNet via `@imgly`) + blob detection → transparent sticker PNGs written to `outDir`.
- `findConnectedComponents(alpha, width, height, threshold)` → blobs — locate foreground regions in an alpha mask.
- `extractMatteGrid(imagePath, outDir, options)` → `{ items, matteColor, ... }` — deterministic equal-cell → chroma → alpha QA → trim/normalize pipeline. It accepts semantic cell mapping/subsets, emits named transparent PNGs on a fixed canvas, and rejects empty, edge-touching, or out-of-range foreground before writing any outputs.

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

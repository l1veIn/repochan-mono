# @repochan/image-edit

Zero-credential local pixel operations for RepoChan: slicing, matting, compression, resizing, and format conversion.

Pure pixel functions — **no network, no credentials, no `.repochan/` protocol awareness.** Input is an image path (and params); output is derived images or metadata. Persistence into protocol directories is the caller's job (the CLI orchestrates that via `@repochan/core`).

> **Design-layer user:** the `repochan-page-designer` skill is the sole design-layer consumer of these operations. It post-processes upstream Painter deliveries into site-ready assets and writes them into the web project (`repochan-page/public/`), never back into `.repochan/`. See `AGENTS.md` product invariant #5.

## API

All ops are exposed via `@repochan/image-edit`. The CLI wraps each as `repochan image edit <op>`.

**Slicing & stickers**
- `sliceImage(imagePath, rows, cols)` → `{ tiles, sourceFile }` — read an image and compute tile coordinates (metadata-only).
- `sliceGridToFiles(imagePath, outDir, { rows, cols, padding, nameTemplate, overwrite })` → `{ sourceFile, tiles }` — crop a grid into individual tile PNGs on disk.
- `extractStickersFromImage(imagePath, options, outDir)` → `{ stickers, sourceFile, config }` — ML matting (ISNet via `@imgly`) + blob detection → transparent sticker PNGs written to `outDir`.
- `findConnectedComponents(alpha, width, height, threshold)` → blobs — locate foreground regions in an alpha mask.

**Matting (background removal)**
- `removeImageBackground(imagePath, outFile, { model, overwrite })` → `{ sourceFile, outFile, width, height }` — ISNet matting → transparent PNG.
- `chromaKeyImage(imagePath, outFile, { matteColor, threshold, softness, spillSuppression })` → result — deterministic matte extraction (Euclidean RGB distance → alpha, spill suppression, RGB scrub). Use when the source has a known matte/solid background.
- `parseMatteColor(input)` / `matteColorToHex(matte)` — helpers for matte color input/output.

**Compression & resize**
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

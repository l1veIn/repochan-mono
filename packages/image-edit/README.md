# @repochan/image-edit

Zero-credential local pixel operations for RepoChan: grid slicing and ML-based sticker extraction.

Pure pixel functions — **no network, no credentials, no `.repochan/` protocol awareness.** Input is an image path (and params); output is tiles metadata or transparent sticker PNGs plus metadata. Persistence into protocol directories is the caller's job (the CLI orchestrates that via `@repochan/core`).

## API

- `readPngSize(path)` → `{ width, height }` — read PNG dimensions from the IHDR chunk.
- `computeTileCells(width, height, rows, cols)` → `TilesMeta` — pure geometry: equal-sized cell rects for a grid.
- `sliceImage(imagePath, rows, cols)` → `{ tiles, sourceFile }` — read a PNG and compute its tile coordinates.
- `findConnectedComponents(alpha, width, height, threshold)` → blobs — locate foreground regions in an alpha mask.
- `extractStickersFromImage(imagePath, options, outDir)` → `{ stickers, sourceFile, config }` — ML matting (ISNet via `@imgly`) + blob detection → transparent sticker PNGs written to `outDir`.

## Dependencies

Only `@imgly/background-removal-node` (which vendors its own sharp). No `@repochan/core` dependency — this package is a pure downstream pixel tool.

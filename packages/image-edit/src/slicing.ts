import { promises as fs } from "node:fs";
import path from "node:path";
import { loadSharp } from "./sharp.js";

// ---------------------------------------------------------------------------
// PNG IHDR reading (zero-dependency)
// ---------------------------------------------------------------------------
// PNG layout: 8-byte signature, then chunks. The first chunk is always IHDR,
// whose data segment is 13 bytes: width(4 BE) height(4 BE) bitDepth(1)
// colorType(1) compression(1) filter(1) interlace(1). We only need width/height,
// which sit at file offset 16 and 20.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Reads pixel dimensions from a PNG's IHDR chunk. Throws on non-PNG / truncated files. */
export async function readPngSize(filePath: string): Promise<{ width: number; height: number }> {
  const handle = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(24);
    const { bytesRead } = await handle.read(header, 0, 24, 0);
    if (bytesRead < 24) throw new Error(`PNG header too short (${bytesRead} bytes): ${filePath}`);
    // Verify signature.
    for (let i = 0; i < 8; i++) {
      if (header[i] !== PNG_SIGNATURE[i]) throw new Error(`Not a PNG (bad signature): ${filePath}`);
    }
    // IHDR chunk type marker lives at offset 12-15: "IHDR".
    const chunkType = header.subarray(12, 16).toString("ascii");
    if (chunkType !== "IHDR") throw new Error(`PNG IHDR chunk missing (got "${chunkType}"): ${filePath}`);
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    if (!width || !height) throw new Error(`PNG IHDR reports zero dimension (${width}x${height}): ${filePath}`);
    return { width, height };
  } finally {
    await handle.close();
  }
}

// ---------------------------------------------------------------------------
// Pure geometry
// ---------------------------------------------------------------------------

/** One cell of a sliced grid: row/col index and the source-rect in pixels. */
export type TileCell = {
  row: number;
  col: number;
  /** Top-left X of this cell in the source image, in pixels. */
  x: number;
  /** Top-left Y of this cell in the source image, in pixels. */
  y: number;
  /** Cell width in pixels. */
  w: number;
  /** Cell height in pixels. */
  h: number;
};

/** The serialized tile metadata for a sliced grid image. */
export type TilesMeta = {
  rows: number;
  cols: number;
  /** Source image width in pixels. */
  width: number;
  /** Source image height in pixels. */
  height: number;
  /** Cell width = floor(width / cols). */
  cellW: number;
  /** Cell height = floor(height / rows). */
  cellH: number;
  cells: TileCell[];
};

/**
 * Compute the per-cell rectangles for a rows×cols grid covering a width×height
 * canvas. Cells are equal-sized (cellW = floor(width/cols), cellH =
 * floor(height/rows)); any remainder pixels from non-evenly-divisible canvases
 * stay as right/bottom gutters — not absorbed into cells, so every cell stays
 * uniform. Pure and deterministic: no generation-quality awareness.
 */
export function computeTileCells(
  width: number,
  height: number,
  rows: number,
  cols: number,
): TilesMeta {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error(`computeTileCells: rows and cols must be positive integers (got rows=${rows}, cols=${cols}).`);
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`computeTileCells: width and height must be positive integers (got ${width}x${height}).`);
  }
  const cellW = Math.floor(width / cols);
  const cellH = Math.floor(height / rows);
  if (cellW < 1 || cellH < 1) {
    throw new Error(
      `computeTileCells: canvas ${width}x${height} too small for ${rows}x${cols} grid (cell would be ${cellW}x${cellH}).`,
    );
  }
  const cells: TileCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({ row, col, x: col * cellW, y: row * cellH, w: cellW, h: cellH });
    }
  }
  return { rows, cols, width, height, cellW, cellH, cells };
}

/**
 * Slice a grid PNG into tile coordinates. Pure pixel operation: reads the
 * PNG header, computes equal-sized cell rectangles, returns the tile metadata.
 * Does NOT generate per-cell image files and does NOT touch any protocol
 * directory — the caller decides where (if anywhere) to persist the result.
 *
 * @param imagePath absolute path to a PNG grid image
 * @param rows      grid row count
 * @param cols      grid column count
 */
export async function sliceImage(
  imagePath: string,
  rows: number,
  cols: number,
): Promise<{ tiles: TilesMeta; sourceFile: string }> {
  const { width, height } = await readPngSize(imagePath);
  const tiles = computeTileCells(width, height, rows, cols);
  const sourceFile = imagePath.split(/[\\/]/).pop()!;
  return { tiles, sourceFile };
}

// ---------------------------------------------------------------------------
// Grid-to-files slicing: crop a grid PNG into individual tile image files
// ---------------------------------------------------------------------------

/** One output tile written by {@link sliceGridToFiles}. */
export type SlicedTile = {
  /** Row-major index, 0-based (tile-0, tile-1, …), in reading order. */
  index: number;
  /** Relative path from the output directory, e.g. "tile-0.png". */
  file: string;
  /** The actual crop rectangle used (after padding), in source pixels. */
  crop: { x: number; y: number; w: number; h: number };
  /** Output tile dimensions in pixels (= crop w/h). */
  width: number;
  height: number;
};

/** Options for {@link sliceGridToFiles}. */
export type SliceGridOptions = {
  rows: number;
  cols: number;
  /** Pixels to inset each cell on all four sides before cropping. Shrinks the crop to dodge white gutters / borders / labels. Default 0. */
  padding?: number;
  /** Name template for output files; `{i}` is replaced by the 0-based index. Default "tile-{i}.png". */
  nameTemplate?: string;
  /** Replace an existing output directory. Default false. */
  overwrite?: boolean;
};

export type SliceGridResult = {
  sourceFile: string;
  tiles: SlicedTile[];
};

/**
 * Slice a grid PNG into individual tile image files on disk.
 *
 *   1. Read the PNG dimensions, compute equal-sized cell rectangles via
 *      {@link computeTileCells}.
 *   2. Inset each cell by `padding` px on all sides (default 0) so the crop
 *      avoids white gutters / borders / edge labels that AI sheets often add.
 *      Padding is clamped so a crop never goes zero-size.
 *   3. Crop and write each tile as a PNG via the package's pinned Sharp.
 *
 * Pure pixel operation: writes PNGs to `outDir` and returns metadata. Does NOT
 * touch any `.repochan/` protocol directory — the caller persists metadata
 * wherever it wants.
 *
 * @param imagePath absolute path to a PNG grid image
 * @param outDir    directory to write tile PNGs (created; cleared if overwrite)
 * @param options   { rows, cols, padding?, nameTemplate?, overwrite? }
 */
export async function sliceGridToFiles(
  imagePath: string,
  outDir: string,
  options: SliceGridOptions,
): Promise<SliceGridResult> {
  const rows = options.rows;
  const cols = options.cols;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error(`sliceGridToFiles: rows and cols must be positive integers (got rows=${rows}, cols=${cols}).`);
  }
  const padding = Math.max(0, options.padding ?? 0);
  const nameTemplate = options.nameTemplate ?? "tile-{i}.png";
  const overwrite = options.overwrite ?? false;

  const { width, height } = await readPngSize(imagePath);
  const grid = computeTileCells(width, height, rows, cols);
  const sourceFile = imagePath.split(/[\\/]/).pop()!;

  // Prepare output directory.
  if ((await exists(outDir)) && !overwrite) {
    throw new Error(`sliceGridToFiles: output directory already exists: ${outDir}. Pass overwrite=true to replace.`);
  }
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  // Clamp padding so a crop stays at least 1px in each dimension.
  const maxPadX = Math.max(0, Math.floor(grid.cellW / 2) - 1);
  const maxPadY = Math.max(0, Math.floor(grid.cellH / 2) - 1);
  const padX = Math.min(padding, maxPadX);
  const padY = Math.min(padding, maxPadY);

  const sharp = (await loadSharp()).default;
  const tiles: SlicedTile[] = [];

  for (let i = 0; i < grid.cells.length; i++) {
    const cell = grid.cells[i];
    const cropX = cell.x + padX;
    const cropY = cell.y + padY;
    const cropW = cell.w - padX * 2;
    const cropH = cell.h - padY * 2;
    const file = nameTemplate.replace("{i}", String(i));
    const outFile = path.join(outDir, file);
    await sharp(imagePath)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .png()
      .toFile(outFile);
    tiles.push({ index: i, file, crop: { x: cropX, y: cropY, w: cropW, h: cropH }, width: cropW, height: cropH });
  }

  return { sourceFile, tiles };
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

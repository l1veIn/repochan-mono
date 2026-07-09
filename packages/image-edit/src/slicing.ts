import { promises as fs } from "node:fs";

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

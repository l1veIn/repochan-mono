import { promises as fs } from "node:fs";
import path from "node:path";
import type { JsonObject } from "../types.js";
import { exists, initProtocol, orderJsonPath, orderVersionDir, orderVersionsDir, readJson, stamp, writeJson } from "../protocol/index.js";
import { validateInput } from "../validate.js";
import { OrderSliceParamsSchema } from "../schemas/index.js";
import { isPlainObject, validateOrderId, validateVersionId } from "../utils/index.js";
import { IMAGE_EXTENSIONS } from "../entities/shared.js";

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

/** The serialized tile metadata written into meta.json's `tiles` field. */
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

// ---------------------------------------------------------------------------
// Slicing action: compute tiles for an order result version
// ---------------------------------------------------------------------------

/**
 * Compute slicing coordinates for an order's result version and persist them
 * into both `meta.json` (under the `tiles` key) and the order.json mirror at
 * `orderAsset.versions[<versionId>].meta.tiles`.
 *
 * The slicer does NOT generate per-cell image files and does NOT assess
 * generation quality (cleanliness, borders, irregular rows). It only aligns to
 * the declared rows×cols grid. When the underlying grid image is irregular
 * (e.g. a "4×4" sheet that is actually 4-4-3-3), equal slicing will cut
 * through stickers — that is a generation-quality issue, not a slicing bug, and
 * is diagnosed by the separate scripts/diagnose-slicing.ts tool.
 *
 * The version directory must contain exactly one image file; multiple images
 * are ambiguous and rejected with the offending filenames listed.
 */
export async function sliceOrderResult(
  projectRoot: string,
  params: JsonObject,
): Promise<{ orderId: string; versionId: string; tiles: TilesMeta; sourceFile: string }> {
  validateInput("order.slice", OrderSliceParamsSchema, params);
  await initProtocol(projectRoot);

  const orderId = validateOrderId(String(params.orderId));
  const rows = Number(params.rows);
  const cols = Number(params.cols);
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error(`order.slice: rows and cols must be positive integers (got rows=${params.rows}, cols=${params.cols}).`);
  }

  // Resolve versionId with the same priority as readOrderResult: explicit →
  // currentVersion → latest existing version directory (lexicographic max).
  let versionId: string | undefined = typeof params.versionId === "string" && params.versionId ? params.versionId : undefined;
  if (!versionId) {
    const order = await readJson(orderJsonPath(projectRoot, orderId));
    if (typeof order.currentVersion === "string" && order.currentVersion) {
      versionId = order.currentVersion;
    } else {
      const versionsDir = orderVersionsDir(projectRoot, orderId);
      const entries = (await fs.readdir(versionsDir).catch(() => [] as string[])).filter((e) => e !== "meta.json");
      versionId = entries.sort().at(-1);
    }
  }
  if (!versionId) throw new Error(`order.slice: order ${orderId} has no result version. Pass versionId or create a result first.`);
  versionId = validateVersionId(versionId);

  const versionDir = orderVersionDir(projectRoot, orderId, versionId);
  if (!(await exists(versionDir))) throw new Error(`order.slice: order ${orderId} has no result version ${versionId}.`);

  // The grid image: exactly one image file in the version dir.
  const entries = await fs.readdir(versionDir).catch(() => [] as string[]);
  const imageFiles = entries.filter((entry) => IMAGE_EXTENSIONS.includes(path.extname(entry).toLowerCase()));
  if (imageFiles.length === 0) {
    throw new Error(`order.slice: no image file found in ${orderId}/${versionId}. Slicing requires a grid image.`);
  }
  if (imageFiles.length > 1) {
    throw new Error(
      `order.slice: ${imageFiles.length} image files found in ${orderId}/${versionId}; slicing needs exactly one. ` +
        `Found: ${imageFiles.join(", ")}. Refusing to guess — specify a single grid image (remove the others or re-run create_result).`,
    );
  }
  const sourceFile = imageFiles[0];
  const sourcePath = path.join(versionDir, sourceFile);

  // Only PNG carries a header we can read without a dependency. Generated
  // chibi grids are .png; non-PNG is an explicit, recoverable error.
  if (path.extname(sourceFile).toLowerCase() !== ".png") {
    throw new Error(
      `order.slice: ${sourceFile} is not a PNG. Header-based slicing currently supports PNG only ` +
        `(generated grids are PNG; if you have a JPEG/WebP grid, convert it first).`,
    );
  }

  const { width, height } = await readPngSize(sourcePath);
  const tiles = computeTileCells(width, height, rows, cols);

  // Write tiles into meta.json (non-destructive — merge under `tiles` key).
  const metaPath = path.join(versionDir, "meta.json");
  const meta = ((await exists(metaPath)) ? await readJson(metaPath) : {}) as JsonObject;
  meta.tiles = tiles;
  meta.updatedAt = stamp();
  await writeJson(metaPath, meta, true);

  // Mirror into order.json's orderAsset.versions[versionId].meta.tiles so
  // readers that never touch the version dir still see the coordinates — same
  // dual-write shape createOrderResult uses.
  const orderPath = orderJsonPath(projectRoot, orderId);
  const order = await readJson(orderPath);
  if (order.orderAsset && Array.isArray(order.orderAsset.versions)) {
    const idx = order.orderAsset.versions.findIndex((v: any) => v && v.versionId === versionId);
    if (idx >= 0) {
      const v = order.orderAsset.versions[idx];
      v.meta = isPlainObject(v.meta) ? v.meta : {};
      v.meta.tiles = tiles;
    }
  }
  order.updatedAt = stamp();
  await writeJson(orderPath, order, true);

  return { orderId, versionId, tiles, sourceFile };
}

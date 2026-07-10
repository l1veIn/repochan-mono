import { promises as fs } from "node:fs";
import path from "node:path";
import { readPngSize } from "./slicing.js";
import { matteImage, loadImglySharp, type MatteModel } from "./imgly.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Metadata for one extracted transparent sticker. */
export type StickerMeta = {
  /** Row-major index, 0-based (s00, s01, ...), in reading order (top-to-bottom, left-to-right). */
  index: number;
  /** Relative path from the output directory, e.g. "s05.png". */
  file: string;
  /** True bounding box of this sticker in the source grid (from blob detection, NOT equal-cell). */
  bbox: { x: number; y: number; w: number; h: number };
  /** Centroid of the sticker's foreground pixels — the true center. */
  centroid: { x: number; y: number };
  /** Output sticker dimensions (= bbox w/h; varies per sticker, NOT normalized). */
  width: number;
  height: number;
};

/** Options for sticker extraction from a grid image. */
export type ExtractStickersOptions = {
  rows: number;
  cols: number;
  /** ISNet model size: 'small' (~40MB, default) / 'medium' / 'large'. First run downloads, later runs use cache. */
  model?: "small" | "medium" | "large";
  /** Replace an existing output directory. Default false. */
  overwrite?: boolean;
};

export type ExtractStickersResult = {
  sourceFile: string;
  stickers: StickerMeta[];
  /** Engine diagnostics for the caller to persist if it wants. */
  config: { model: "small" | "medium" | "large"; engine: "imgly-isnet"; method: "blob-detection"; expected: number; detected: number };
};

// ---------------------------------------------------------------------------
// Connected-component analysis
// ---------------------------------------------------------------------------

/**
 * Find connected components in an alpha mask via flood-fill (4-connectivity).
 * Each component = one contiguous region of pixels with alpha >= threshold.
 * Returns bounding boxes + centroids + sizes. Used to locate each sticker's
 * true position from the ML matting output — far more accurate than equal-cell
 * slicing because AI grids drift (rows offset by tens of px from the ideal).
 */
export function findConnectedComponents(
  alpha: Uint8Array,
  width: number,
  height: number,
  threshold: number,
): Array<{ x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; size: number }> {
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const blobs: Array<{ x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; size: number }> = [];
  for (let start = 0; start < alpha.length; start++) {
    if (visited[start] || alpha[start] < threshold) continue;
    stack.length = 0;
    stack.push(start);
    let size = 0, sumX = 0, sumY = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    while (stack.length) {
      const p = stack.pop()!;
      if (visited[p] || alpha[p] < threshold) continue;
      visited[p] = 1;
      const x = p % width, y = (p / width) | 0;
      size++; sumX += x; sumY += y;
      if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x > x1) x1 = x; if (y > y1) y1 = y;
      if (x > 0) stack.push(p - 1);
      if (x < width - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - width);
      if (y < height - 1) stack.push(p + width);
    }
    blobs.push({ x0, y0, x1, y1, cx: sumX / size, cy: sumY / size, size });
  }
  return blobs;
}

// ---------------------------------------------------------------------------
// Sticker extraction: pure pixel pipeline
// ---------------------------------------------------------------------------

/**
 * Background-removal + smart-slicing pipeline for a single grid image:
 *
 *   1. Run ML matting (ISNet via @imgly) on the WHOLE grid once. The alpha
 *      mask both (a) removes the background and (b) locates each sticker.
 *   2. Connected-component analysis on the alpha mask finds each sticker's
 *      TRUE bounding box — this fixes misalignment that equal-cell slicing
 *      cannot (AI grids drift: rows offset by tens of px from the ideal).
 *   3. Crop each sticker by its real bbox. Dimensions vary per sticker;
 *      frontend centers each in a uniform container if needed.
 *
 * Refuses to guess when the blob count ≠ rows×cols: overlapping stickers
 * merge into one blob (too few), holed stickers split into several (too
 * many). Both mean the grid is structurally wrong and needs regeneration.
 *
 * Works on ANY background (plain/illustrated/gradient) — ISNet is a general
 * foreground segmenter, not a white-threshold heuristic.
 *
 * Pure pixel operation: writes transparent PNGs to `outDir` and returns
 * metadata. Does NOT touch any `.repochan/` protocol directory — the caller
 * persists the returned metadata wherever it wants.
 *
 * @param imagePath  absolute path to a PNG grid image
 * @param options    { rows, cols, model?, overwrite? }
 * @param outDir     directory to write sticker PNGs (created; cleared if overwrite)
 */
export async function extractStickersFromImage(
  imagePath: string,
  options: ExtractStickersOptions,
  outDir: string,
): Promise<ExtractStickersResult> {
  const rows = options.rows;
  const cols = options.cols;
  const model = options.model ?? "small";
  const overwrite = options.overwrite ?? false;

  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error(`extractStickersFromImage: rows and cols must be positive integers (got rows=${rows}, cols=${cols}).`);
  }

  const sourceFile = imagePath.split(/[\\/]/).pop()!;
  const { width, height } = await readPngSize(imagePath);

  if ((await exists(outDir)) && !overwrite) {
    throw new Error(`extractStickersFromImage: output directory already exists: ${outDir}. Pass overwrite=true to replace.`);
  }
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  // ── Step 1: ML matting on the whole grid. ──────────────────────────────
  const srcBuf = await fs.readFile(imagePath);
  const { data: gridData, channels: gridChannels } = await matteImage(srcBuf, "image/png", model as MatteModel);

  // ── Step 2: locate stickers via the matting alpha mask. ────────────────
  const alpha = new Uint8Array(width * height);
  for (let p = 0, q = 3; p < alpha.length; p++, q += gridChannels) alpha[p] = gridData[q];
  const allBlobs = findConnectedComponents(alpha, width, height, 128);
  // Stickers are sizable blobs; drop tiny noise (< 0.5% of canvas).
  const minBlobSize = Math.floor(width * height * 0.005);
  const stickerBlobs = allBlobs.filter((b) => b.size >= minBlobSize);

  const expected = rows * cols;
  if (stickerBlobs.length !== expected) {
    const detail = stickerBlobs.slice(0, 8).map((b) => `(${b.x0},${b.y0})-${b.x1},${b.y1} ${b.size}px`).join("  ");
    throw new Error(
      `extractStickersFromImage: detected ${stickerBlobs.length} foreground regions but expected ${rows}×${cols}=${expected}. ` +
        `The grid is structurally irregular (overlapping stickers merge, holed stickers split). ` +
        `Regenerate the grid with cleaner separation, or adjust rows/cols. Top blobs: ${detail}`,
    );
  }

  // Sort into reading order: top-to-bottom by row, then left-to-right by col.
  stickerBlobs.sort((a, b) => a.cy - b.cy);
  const rowBand = Math.ceil(stickerBlobs.length / rows);
  const sorted: typeof stickerBlobs = [];
  for (let r = 0; r < rows; r++) {
    const band = stickerBlobs.slice(r * rowBand, Math.min((r + 1) * rowBand, stickerBlobs.length));
    band.sort((a, b) => a.cx - b.cx);
    sorted.push(...band);
  }

  // ── Step 3: crop each sticker by its true bounding box. ───────────────
  const sharp = (await loadImglySharp()).default;
  const stickers: StickerMeta[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const blob = sorted[i];
    const bw = blob.x1 - blob.x0 + 1;
    const bh = blob.y1 - blob.y0 + 1;
    const cellBuf = Buffer.alloc(bw * bh * 4);
    for (let dy = 0; dy < bh; dy++) {
      for (let dx = 0; dx < bw; dx++) {
        const srcIdx = (width * (blob.y0 + dy) + (blob.x0 + dx)) * gridChannels;
        const dstIdx = (bw * dy + dx) << 2;
        cellBuf[dstIdx] = gridData[srcIdx];
        cellBuf[dstIdx + 1] = gridData[srcIdx + 1];
        cellBuf[dstIdx + 2] = gridData[srcIdx + 2];
        cellBuf[dstIdx + 3] = gridChannels >= 4 ? gridData[srcIdx + 3] : 255;
      }
    }

    const stickerIdx = String(i).padStart(2, "0");
    const outFile = `s${stickerIdx}.png`;
    await sharp(cellBuf, { raw: { width: bw, height: bh, channels: 4 } }).png().toFile(path.join(outDir, outFile));

    stickers.push({
      index: i,
      file: outFile,
      bbox: { x: blob.x0, y: blob.y0, w: bw, h: bh },
      centroid: { x: Math.round(blob.cx), y: Math.round(blob.cy) },
      width: bw,
      height: bh,
    });
  }

  return {
    sourceFile,
    stickers,
    config: { model, engine: "imgly-isnet", method: "blob-detection", expected, detected: stickerBlobs.length },
  };
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

import { promises as fs } from "node:fs";
import { extractAssets, ExtractError } from "./extract.js";
import type { MatteModel } from "./imgly.js";

// ---------------------------------------------------------------------------
// Types (FROZEN compatibility contract — design doc §8)
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
  /** ISNet model size from the locally installed optional ML capability. */
  model?: MatteModel;
  /** Replace an existing output directory. Default false. */
  overwrite?: boolean;
};

export type ExtractStickersResult = {
  sourceFile: string;
  stickers: StickerMeta[];
  /** Engine diagnostics for the caller to persist if it wants. */
  config: { model: MatteModel; engine: "imgly-isnet"; method: "blob-detection"; expected: number; detected: number };
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
// Sticker extraction: adapter over extractAssets({ strategy: "ml-blobs" })
// ---------------------------------------------------------------------------

/**
 * Background-removal + smart-slicing pipeline for a single grid image.
 *
 * Internally delegates to `extractAssets({ strategy: "ml-blobs" })`
 * (whole-image ISNet matting → connected-component blob detection → per-blob
 * crop) and adapts the result back to the FROZEN `ExtractStickersResult`
 * shape (design §8): the CLI `--json` keys `{ sourceFile, outDir, stickers,
 * config }` and the `StickerMeta` fields must not change.
 *
 * Publishing is atomic (staging rename): on failure the output directory is
 * never left half-written — an intentional behavior change from the previous
 * rm+mkdir approach (design §8).
 *
 * NOTE: ml-blobs requires the optional local image-ML capability. Execution is
 * offline after that capability is explicitly installed. Refuses to guess when
 * the blob count ≠ rows×cols: overlapping
 * stickers merge into one blob (too few), holed stickers split into several
 * (too many). Both mean the grid is structurally wrong and needs regeneration.
 *
 * @param imagePath  absolute path to a PNG grid image
 * @param options    { rows, cols, model?, overwrite? }
 * @param outDir     directory to write sticker PNGs (published atomically)
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
  if ((await exists(outDir)) && !overwrite) {
    throw new Error(`extractStickersFromImage: output directory already exists: ${outDir}. Pass overwrite=true to replace.`);
  }

  try {
    const result = await extractAssets(imagePath, outDir, {
      strategy: "ml-blobs",
      rows,
      cols,
      overwrite,
      hybrid: { model },
    });

    return {
      sourceFile: result.sourceFile,
      stickers: result.items.map((item) => ({
        index: item.index,
        file: item.file,
        // ml-blobs items always carry sourceBounds/cropSize/centroid.
        bbox: item.geometry.sourceBounds!,
        centroid: item.centroid!,
        width: item.geometry.cropSize!.w,
        height: item.geometry.cropSize!.h,
      })),
      config: { model, engine: "imgly-isnet", method: "blob-detection", expected: rows * cols, detected: result.items.length },
    };
  } catch (error) {
    // Adapter contract: legacy callers expect plain Errors with the
    // extractStickersFromImage prefix (e.g. the blob-count refusal).
    if (error instanceof ExtractError && error.defects.length > 0) {
      throw new Error(`extractStickersFromImage: ${error.defects[0].detail}`);
    }
    if (error instanceof Error && error.message.startsWith("extractAssets: ")) {
      throw new Error(`extractStickersFromImage: ${error.message.slice("extractAssets: ".length)}`);
    }
    throw error;
  }
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

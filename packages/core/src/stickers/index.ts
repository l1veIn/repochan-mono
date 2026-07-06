import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { JsonObject } from "../types.js";
import { exists, orderJsonPath, orderVersionDir, readJson, stamp, writeJson } from "../protocol/index.js";
import { validateInput } from "../validate.js";
import { OrderExtractStickersParamsSchema } from "../schemas/index.js";
import { isPlainObject, validateOrderId, validateVersionId } from "../utils/index.js";
import { readPngSize } from "../slicing/index.js";
import { removeBackground } from "@imgly/background-removal-node";

// ---------------------------------------------------------------------------
// imgly resource path resolution
// ---------------------------------------------------------------------------
// @imgly/background-removal-node locates its model + resources.json relative to
// a publicPath config. Under pnpm symlinks the lib's default import.meta.url
// resolution breaks, so we resolve the package dir ourselves and pass an
// explicit file:// URI (must end with "/" so "./resources.json" resolves
// inside dist/, not its parent).
const require = createRequire(import.meta.url);
const IMGLY_DIST = path.dirname(require.resolve("@imgly/background-removal-node"));
const IMGLY_PUBLIC_PATH = `file://${IMGLY_DIST}/`;

// imgly's own vendored sharp (0.32) — used only for the post-matting slice.
// We import it dynamically so core's own dependency tree stays sharp-free at
// static-analysis time; the only sharp that loads is imgly's, avoiding the
// dual-libvips conflict.
async function loadImglySharp() {
  // Resolve sharp from within imgly's node_modules so we use its 0.32 build,
  // not a separately-installed one.
  const sharpPath = require.resolve("sharp", { paths: [IMGLY_DIST] });
  return import(sharpPath);
}

// ---------------------------------------------------------------------------
// Sticker extraction action
// ---------------------------------------------------------------------------

/** Metadata for one extracted transparent sticker. */
export type StickerMeta = {
  /** Row-major index, 0-based (s00, s01, ...), in reading order (top-to-bottom, left-to-right). */
  index: number;
  /** Relative path from the version dir, e.g. "stickers/s05.png". */
  file: string;
  /** True bounding box of this sticker in the source grid (from blob detection, NOT equal-cell). */
  bbox: { x: number; y: number; w: number; h: number };
  /** Centroid of the sticker's foreground pixels — the true center. */
  centroid: { x: number; y: number };
  /** Output sticker dimensions (= bbox w/h; varies per sticker, NOT normalized). */
  width: number;
  height: number;
};

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

/**
 * Background-removal + smart-slicing pipeline for a grid image:
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
 */
export async function extractStickers(
  projectRoot: string,
  params: JsonObject,
): Promise<{ orderId: string; versionId: string; sourceFile: string; stickers: StickerMeta[] }> {
  validateInput("order.extract_stickers", OrderExtractStickersParamsSchema, params);

  const orderId = validateOrderId(String(params.orderId));
  const rows = Number(params.rows);
  const cols = Number(params.cols);
  const model = (typeof params.model === "string" && ["small", "medium", "large"].includes(params.model)
    ? params.model
    : "small") as "small" | "medium" | "large";
  const overwrite = params.overwrite === true;

  // Resolve versionId (same priority as sliceOrderResult).
  let versionId: string | undefined = typeof params.versionId === "string" && params.versionId ? params.versionId : undefined;
  if (!versionId) {
    const order = await readJson(orderJsonPath(projectRoot, orderId));
    if (typeof order.currentVersion === "string" && order.currentVersion) {
      versionId = order.currentVersion;
    } else {
      const versionsRoot = path.join(orderVersionDir(projectRoot, orderId, "__noop__"), "..");
      const entries = (await fs.readdir(versionsRoot).catch(() => [] as string[])).filter((e) => e !== "meta.json");
      versionId = entries.sort().at(-1);
    }
  }
  if (!versionId) throw new Error(`order.extract_stickers: order ${orderId} has no result version.`);
  versionId = validateVersionId(versionId);

  const versionDir = orderVersionDir(projectRoot, orderId, versionId);
  if (!(await exists(versionDir))) throw new Error(`order.extract_stickers: order ${orderId} has no result version ${versionId}.`);

  // Find the single grid image.
  const entries = await fs.readdir(versionDir).catch(() => [] as string[]);
  const imageFiles = entries.filter((e) => [".png"].includes(path.extname(e).toLowerCase()));
  if (imageFiles.length === 0) throw new Error(`order.extract_stickers: no PNG in ${orderId}/${versionId}.`);
  if (imageFiles.length > 1) {
    throw new Error(
      `order.extract_stickers: ${imageFiles.length} PNGs in ${orderId}/${versionId}; needs exactly one. Found: ${imageFiles.join(", ")}.`,
    );
  }
  const sourceFile = imageFiles[0];
  const sourcePath = path.join(versionDir, sourceFile);

  const { width, height } = await readPngSize(sourcePath);

  const stickersDir = path.join(versionDir, "stickers");
  if ((await exists(stickersDir)) && !overwrite) {
    throw new Error(`order.extract_stickers: ${orderId}/${versionId}/stickers already exists. Pass overwrite=true to replace.`);
  }
  await fs.rm(stickersDir, { recursive: true, force: true });
  await fs.mkdir(stickersDir, { recursive: true });

  // ── Step 1: ML matting on the whole grid. ──────────────────────────────
  // imgly needs a Blob/File with a MIME type; a bare Buffer has none and it
  // throws "Unsupported format:".
  const srcBuf = await fs.readFile(sourcePath);
  const mattedBlob = await removeBackground(new Blob([srcBuf], { type: "image/png" }), {
    publicPath: IMGLY_PUBLIC_PATH,
    model,
  });
  const mattedBuf = Buffer.from(await mattedBlob.arrayBuffer());

  // Use imgly's own vendored sharp (0.32) to decode + extract, so core itself
  // has no direct sharp dependency.
  const sharp = (await loadImglySharp()).default;
  const raw = await sharp(mattedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const gridData = raw.data;
  const gridChannels = raw.info.channels;

  // ── Step 2: locate stickers via the matting alpha mask. ────────────────
  // The alpha channel IS the location signal: each sticker is a connected
  // blob of high-alpha pixels. Connected-component analysis finds each
  // sticker's true bounding box — which beats equal-cell slicing because AI
  // grids are not perfectly aligned (rows drift by tens of px). This is the
  // key fix for "切歪/切到相邻图": we cut where the sticker actually is, not
  // where an ideal grid would put it.
  const alpha = new Uint8Array(width * height);
  for (let p = 0, q = 3; p < alpha.length; p++, q += gridChannels) alpha[p] = gridData[q];
  const allBlobs = findConnectedComponents(alpha, width, height, 128);
  // Stickers are sizable blobs; drop tiny noise (< 0.5% of canvas).
  const minBlobSize = Math.floor(width * height * 0.005);
  const stickers_blobs = allBlobs.filter((b) => b.size >= minBlobSize);

  const expected = rows * cols;
  if (stickers_blobs.length !== expected) {
    // Blob count mismatch means the grid is structurally wrong: overlapping
    // stickers merge into one blob (too few), or a sticker with holes splits
    // into several (too many). We refuse to guess — surfacing the exact count
    // so the user/agent knows this grid needs regeneration.
    const detail = stickers_blobs.slice(0, 8).map((b) => `(${b.x0},${b.y0})-${b.x1},${b.y1} ${b.size}px`).join("  ");
    throw new Error(
      `order.extract_stickers: detected ${stickers_blobs.length} foreground regions but expected ${rows}×${cols}=${expected}. ` +
        `The grid is structurally irregular (overlapping stickers merge, holed stickers split). ` +
        `Regenerate the grid with cleaner separation, or adjust rows/cols. Top blobs: ${detail}`,
    );
  }

  // Sort into reading order: top-to-bottom by row, then left-to-right by col.
  // Cluster by Y-centroid into `rows` bands, then sort each band by X-centroid.
  stickers_blobs.sort((a, b) => a.cy - b.cy);
  const rowBand = Math.ceil(stickers_blobs.length / rows);
  const sorted: typeof stickers_blobs = [];
  for (let r = 0; r < rows; r++) {
    const band = stickers_blobs.slice(r * rowBand, Math.min((r + 1) * rowBand, stickers_blobs.length));
    band.sort((a, b) => a.cx - b.cx);
    sorted.push(...band);
  }

  // ── Step 3: crop each sticker by its true bounding box. ───────────────
  // Each sticker keeps its own dimensions (not normalized to a uniform size)
  // — precise and never clips neighbors. Frontend centers each in a uniform
  // container if needed.
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
    await sharp(cellBuf, { raw: { width: bw, height: bh, channels: 4 } }).png().toFile(path.join(stickersDir, outFile));

    stickers.push({
      index: i,
      file: `stickers/${outFile}`,
      bbox: { x: blob.x0, y: blob.y0, w: bw, h: bh },
      centroid: { x: Math.round(blob.cx), y: Math.round(blob.cy) },
      width: bw,
      height: bh,
    });
  }

  // ── Write meta.json.stickers + order.json mirror (non-destructive). ─────
  const metaPath = path.join(versionDir, "meta.json");
  const meta = ((await exists(metaPath)) ? await readJson(metaPath) : {}) as JsonObject;
  meta.stickers = stickers;
  meta.stickersConfig = { model, engine: "imgly-isnet", method: "blob-detection", expected, detected: stickers_blobs.length, sourceFile };
  meta.updatedAt = stamp();
  await writeJson(metaPath, meta, true);

  const order = await readJson(orderJsonPath(projectRoot, orderId));
  if (order.orderAsset && Array.isArray(order.orderAsset.versions)) {
    const v = order.orderAsset.versions.find((vv: any) => vv && vv.versionId === versionId);
    if (v) {
      v.meta = isPlainObject(v.meta) ? v.meta : {};
      v.meta.stickers = stickers;
      v.meta.stickersConfig = { model, engine: "imgly-isnet", sourceFile };
    }
  }
  order.updatedAt = stamp();
  await writeJson(orderJsonPath(projectRoot, orderId), order, true);

  return { orderId, versionId, sourceFile, stickers };
}

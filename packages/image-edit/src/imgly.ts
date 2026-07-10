import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { removeBackground } from "@imgly/background-removal-node";

// ---------------------------------------------------------------------------
// imgly resource path resolution — shared by stickers.ts and bg-remove.ts
// ---------------------------------------------------------------------------
// @imgly/background-removal-node locates its model + resources.json relative to
// a publicPath config. Under pnpm symlinks the lib's default import.meta.url
// resolution breaks, so we resolve the package dir ourselves and pass an
// explicit file:// URI (must end with "/" so "./resources.json" resolves
// inside dist/, not its parent).
const require = createRequire(import.meta.url);
export const IMGLY_DIST = path.dirname(require.resolve("@imgly/background-removal-node"));
export const IMGLY_PUBLIC_PATH = `file://${IMGLY_DIST}/`;

// imgly's own vendored sharp (0.32) — used for post-matting pixel work.
// We import it dynamically so this package's own dependency tree stays
// sharp-free at static-analysis time; the only sharp that loads is imgly's,
// avoiding the dual-libvips conflict.
export async function loadImglySharp() {
  // Resolve sharp from within imgly's node_modules so we use its 0.32 build,
  // not a separately-installed one.
  const sharpPath = require.resolve("sharp", { paths: [IMGLY_DIST] });
  return import(sharpPath);
}

/** ISNet model size accepted by @imgly/background-removal-node. */
export type MatteModel = "small" | "medium" | "large";

/**
 * Run ML matting (ISNet via @imgly) on a source image buffer and return the
 * foreground (transparent-background) pixels as raw RGBA, plus dimensions.
 *
 * Shared by `extractStickersFromImage` (sticker blob detection) and
 * `removeImageBackground` (standalone bg-remove). Keeps the matting step in
 * one place so both callers stay consistent.
 *
 * @param srcBuf    source image bytes (PNG/JSBuffer)
 * @param mimeType  MIME type for the imgly Blob (default image/png)
 * @param model     ISNet model size (default 'small')
 */
export async function matteImage(
  srcBuf: Buffer,
  mimeType = "image/png",
  model: MatteModel = "small",
): Promise<{ data: Buffer; width: number; height: number; channels: number }> {
  const mattedBlob = await removeBackground(new Blob([new Uint8Array(srcBuf)], { type: mimeType }), {
    publicPath: IMGLY_PUBLIC_PATH,
    model,
  });
  const mattedBuf = Buffer.from(await mattedBlob.arrayBuffer());

  // Use imgly's own vendored sharp (0.32) to decode, so this package has no
  // direct sharp dependency.
  const sharp = (await loadImglySharp()).default;
  const raw = await sharp(mattedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: raw.data, width: raw.info.width, height: raw.info.height, channels: raw.info.channels };
}

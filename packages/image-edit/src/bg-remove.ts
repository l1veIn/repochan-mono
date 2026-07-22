import { promises as fs } from "node:fs";
import path from "node:path";
import { matteImage, type MatteModel } from "./imgly.js";
import { loadSharp } from "./sharp.js";

/**
 * Remove the background from a single image, writing a transparent PNG.
 *
 * Uses the same ISNet ML matting engine as `extractStickersFromImage`, but
 * stops after matting — no blob detection or cropping. The whole foreground
 * is kept as one transparent image.
 *
 * Pure pixel operation: writes one PNG to `outPath` and returns metadata.
 * Does NOT touch any `.repochan/` protocol directory.
 *
 * @param imagePath  absolute path to the source image
 * @param outPath    absolute path for the output transparent PNG
 * @param options    { model?, overwrite? }
 */
export async function removeImageBackground(
  imagePath: string,
  outPath: string,
  options: { model?: MatteModel; overwrite?: boolean } = {},
): Promise<{ sourceFile: string; outFile: string; width: number; height: number }> {
  const model = options.model ?? "small";
  const overwrite = options.overwrite ?? false;

  if ((await exists(outPath)) && !overwrite) {
    throw new Error(`removeImageBackground: output already exists: ${outPath}. Pass overwrite=true to replace.`);
  }

  const sourceFile = imagePath.split(/[\\/]/).pop()!;

  // Detect MIME from extension so imgly gets a useful hint.
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";

  const srcBuf = await fs.readFile(imagePath);
  const { data, width, height, channels } = await matteImage(srcBuf, mimeType, model);

  // Write the matted RGBA pixels out as a transparent PNG.
  const sharp = (await loadSharp()).default;
  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(outPath);

  const outFile = outPath.split(/[\\/]/).pop()!;
  return { sourceFile, outFile, width, height };
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

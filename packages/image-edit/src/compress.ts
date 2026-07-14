import { promises as fs } from "node:fs";
import path from "node:path";
import { loadImglySharp } from "./imgly.js";

// ---------------------------------------------------------------------------
// Compress: convert an image to WebP/JPEG/AVIF with optional resize.
// ---------------------------------------------------------------------------

export type CompressFormat = "webp" | "jpeg" | "avif" | "png";

export type CompressOptions = {
  /** Output format. Default: webp. */
  format?: CompressFormat;
  /** Quality 1-100. Default: 80 (webp/jpeg), 50 (avif). */
  quality?: number;
  /** Max width in pixels. If set, image is downscaled to fit. Default: no resize. */
  maxWidth?: number;
  /** Replace existing output file. Default false. */
  overwrite?: boolean;
};

export type CompressResult = {
  sourceFile: string;
  outFile: string;
  format: CompressFormat;
  quality: number;
  width: number;
  height: number;
  /** Original file size in bytes. */
  originalBytes: number;
  /** Compressed file size in bytes. */
  compressedBytes: number;
  /** Compression ratio (original / compressed). */
  ratio: number;
};

/**
 * Compress a source image into WebP/JPEG/AVIF with optional downscale.
 * Uses imgly's vendored sharp.
 *
 * @param imagePath  absolute path to source image
 * @param outPath    absolute path to output file
 * @param options    { format?, quality?, maxWidth?, overwrite? }
 */
export async function compressImage(
  imagePath: string,
  outPath: string,
  options: CompressOptions = {},
): Promise<CompressResult> {
  const format = options.format ?? "webp";
  const quality = options.quality ?? (format === "avif" ? 50 : 80);

  const sharp = (await loadImglySharp()).default;
  const sourceFile = imagePath.split(/[\\/]/).pop()!;
  const originalBytes = (await fs.stat(imagePath)).size;

  let pipeline = sharp(imagePath);

  if (options.maxWidth) {
    pipeline = pipeline.resize(options.maxWidth, null, { fit: "inside", withoutEnlargement: true });
  }

  switch (format) {
    case "webp":
      pipeline = pipeline.webp({ quality });
      break;
    case "jpeg":
      pipeline = pipeline.flatten({ background: "#000000" }).jpeg({ quality, progressive: true, mozjpeg: true });
      break;
    case "avif":
      pipeline = pipeline.avif({ quality });
      break;
    case "png":
      pipeline = pipeline.png({ quality, compressionLevel: 9 });
      break;
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });

  if (!options.overwrite && (await exists(outPath))) {
    throw new Error(`compressImage: output file already exists: ${outPath}. Pass overwrite=true to replace.`);
  }

  const info = await pipeline.toFile(outPath);
  const compressedBytes = info.size;

  return {
    sourceFile,
    outFile: outPath,
    format,
    quality,
    width: info.width,
    height: info.height,
    originalBytes,
    compressedBytes,
    ratio: originalBytes / compressedBytes,
  };
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

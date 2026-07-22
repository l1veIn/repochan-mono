import path from "node:path";
import { loadSharp } from "./sharp.js";

export type SupportedImageFormat = "png" | "jpeg" | "webp" | "avif" | "gif";

export type ImageInspection = {
  format: SupportedImageFormat;
  width: number;
  height: number;
};

const EXTENSION_FORMATS: Record<string, SupportedImageFormat> = {
  ".png": "png",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".webp": "webp",
  ".avif": "avif",
  ".gif": "gif",
};

export function imageFormatForExtension(filePath: string): SupportedImageFormat | undefined {
  return EXTENSION_FORMATS[path.extname(filePath).toLowerCase()];
}

/** Decode an image and report the format detected from its bytes. */
export async function inspectImage(imagePath: string): Promise<ImageInspection> {
  const sharp = (await loadSharp()).default;
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(imagePath).metadata();
  } catch (error) {
    throw new Error(`Unsupported or unreadable image: ${imagePath}`, { cause: error });
  }
  const format = (metadata.format === "heif" ? "avif" : metadata.format) as SupportedImageFormat | undefined;
  if (!format || !Object.values(EXTENSION_FORMATS).includes(format) || !metadata.width || !metadata.height) {
    throw new Error(`Unsupported or unreadable image: ${imagePath}`);
  }
  return { format, width: metadata.width, height: metadata.height };
}

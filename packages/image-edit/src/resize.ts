import { promises as fs } from "node:fs";
import path from "node:path";
import { loadImglySharp } from "./imgly.js";
import { readPngSize } from "./slicing.js";

// ---------------------------------------------------------------------------
// Resize: scale a source image to one or more target sizes
// ---------------------------------------------------------------------------

/** One requested output size. */
export type ResizeTarget = {
  /** Target width in pixels. */
  width: number;
  /** Target height in pixels. If omitted, maintains aspect ratio to `width`. */
  height?: number;
  /** Output filename (within outDir). If omitted, auto-generated as `<stem>-<W>x<H>.png`. */
  filename?: string;
};

/** Options for {@link resizeImage}. */
export type ResizeOptions = {
  targets: ResizeTarget[];
  /** Replace existing output files. Default false. */
  overwrite?: boolean;
  /** Sharp fit mode for non-proportional resizing. Default 'inside' (preserves aspect, fits within W×H). */
  fit?: "cover" | "contain" | "inside" | "fill";
};

export type ResizeResult = {
  sourceFile: string;
  sourceWidth: number;
  sourceHeight: number;
  outputs: Array<{
    file: string;
    width: number;
    height: number;
    path: string;
  }>;
};

/**
 * Resize a source image into one or more PNG files at specified dimensions.
 *
 * Uses imgly's vendored sharp (no extra dependency). Each target produces a
 * separate PNG in `outDir`. If a target omits `height`, aspect ratio is
 * preserved.
 *
 * Pure pixel operation: writes PNGs to disk. Does NOT touch any `.repochan/`
 * protocol directory.
 *
 * @param imagePath absolute path to a source PNG/JPG/WebP image
 * @param outDir    directory to write resized PNGs (created if missing)
 * @param options   { targets, overwrite?, fit? }
 */
export async function resizeImage(
  imagePath: string,
  outDir: string,
  options: ResizeOptions,
): Promise<ResizeResult> {
  if (!options.targets || options.targets.length === 0) {
    throw new Error("resizeImage: at least one target size is required.");
  }
  const overwrite = options.overwrite ?? false;
  const fit = options.fit ?? "inside";

  const sourceFile = imagePath.split(/[\\/]/).pop()!;
  let sourceWidth: number;
  let sourceHeight: number;
  try {
    ({ width: sourceWidth, height: sourceHeight } = await readPngSize(imagePath));
  } catch {
    // Not a PNG — let sharp read it.
    const sharp = (await loadImglySharp()).default;
    const meta = await sharp(imagePath).metadata();
    sourceWidth = meta.width!;
    sourceHeight = meta.height!;
  }

  await fs.mkdir(outDir, { recursive: true });

  const sharp = (await loadImglySharp()).default;
  const stem = sourceFile.replace(/\.[^.]+$/, "");
  const outputs: ResizeResult["outputs"] = [];

  for (const target of options.targets) {
    const w = target.width;
    const h = target.height ?? Math.round((w * sourceHeight) / sourceWidth);
    const file = target.filename ?? `${stem}-${w}x${h}.png`;
    const outPath = path.join(outDir, file);

    if (!overwrite && (await exists(outPath))) {
      throw new Error(`resizeImage: output file already exists: ${outPath}. Pass overwrite=true to replace.`);
    }

    await sharp(imagePath)
      .resize(w, h, { fit })
      .png()
      .toFile(outPath);

    outputs.push({ file, width: w, height: h, path: outPath });
  }

  return { sourceFile, sourceWidth, sourceHeight, outputs };
}

// ---------------------------------------------------------------------------
// ICO: encode a multi-resolution .ico file from one or more PNG buffers
// ---------------------------------------------------------------------------

/**
 * The .ico format is straightforward:
 *   - ICONDIR header (6 bytes): reserved(2)=0, type(2)=1, count(2)=N
 *   - ICONDIRENTRY array (16 bytes each): one per image
 *   - Image data: concatenated PNG blobs (PNG-in-ICO, supported by all modern browsers/OS)
 *
 * We use embedded PNG (not BMP) for each size — universally supported since
 * Windows Vista and all modern browsers.
 */

export type IcoSize = {
  width: number;
  height: number;
};

export type IcoOptions = {
  /** Sizes to embed in the .ico. Each is read from `imagePath` and resized. Default: [16, 32, 48, 180, 256]. */
  sizes?: number[];
  /** Replace existing output file. Default false. */
  overwrite?: boolean;
};

export type IcoResult = {
  sourceFile: string;
  outFile: string;
  sizes: IcoSize[];
};

/**
 * Generate a multi-resolution `.ico` file from a source image.
 *
 * Reads the source, resizes it to each requested size as PNG, then packs the
 * PNGs into a single `.ico` file. Default sizes cover favicon, taskbar, and
 * high-DPI: 16, 32, 48, 180 (Apple touch), 256.
 *
 * @param imagePath absolute path to source image (PNG/JPG/WebP)
 * @param outPath   absolute path to output `.ico` file
 * @param options   { sizes?, overwrite? }
 */
export async function generateIco(
  imagePath: string,
  outPath: string,
  options: IcoOptions = {},
): Promise<IcoResult> {
  const sizes = options.sizes ?? [16, 32, 48, 180, 256];
  const overwrite = options.overwrite ?? false;

  if (!outPath.toLowerCase().endsWith(".ico")) {
    throw new Error(`generateIco: output path must end with .ico (got: ${outPath})`);
  }

  if (!overwrite && (await exists(outPath))) {
    throw new Error(`generateIco: output file already exists: ${outPath}. Pass overwrite=true to replace.`);
  }

  const sharp = (await loadImglySharp()).default;
  const sourceFile = imagePath.split(/[\\/]/).pop()!;

  // Resize source to each requested size, keep PNG buffers in memory.
  const pngBuffers: Buffer[] = [];
  for (const sz of sizes) {
    const buf = await sharp(imagePath)
      .resize(sz, sz, { fit: "inside" })
      .png()
      .toBuffer();
    pngBuffers.push(buf);
  }

  // Pack into .ico format.
  const ico = packIco(pngBuffers, sizes);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, ico);

  return {
    sourceFile,
    outFile: outPath,
    sizes: sizes.map((s) => ({ width: s, height: s })),
  };
}

/**
 * Pack an array of PNG buffers into a single .ico file (PNG-in-ICO format).
 * Zero-dependency binary encoder.
 */
function packIco(pngBuffers: Buffer[], sizes: number[]): Buffer {
  const count = pngBuffers.length;

  // ICONDIR: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = 1 (icon)
  header.writeUInt16LE(count, 4); // image count

  // ICONDIRENTRY: 16 bytes each
  const entries = Buffer.alloc(16 * count);
  let dataOffset = 6 + 16 * count;
  for (let i = 0; i < count; i++) {
    const sz = sizes[i];
    const buf = pngBuffers[i];
    const off = i * 16;
    // Width (1 byte; 0 means 256)
    entries.writeUInt8(sz >= 256 ? 0 : sz, off + 0);
    // Height (1 byte; 0 means 256)
    entries.writeUInt8(sz >= 256 ? 0 : sz, off + 1);
    // Color palette count (1 byte; 0 = no palette)
    entries.writeUInt8(0, off + 2);
    // Reserved (1 byte)
    entries.writeUInt8(0, off + 3);
    // Color planes (2 bytes)
    entries.writeUInt16LE(1, off + 4);
    // Bits per pixel (2 bytes)
    entries.writeUInt16LE(32, off + 6);
    // Image data size (4 bytes)
    entries.writeUInt32LE(buf.length, off + 8);
    // Image data offset (4 bytes)
    entries.writeUInt32LE(dataOffset, off + 12);
    dataOffset += buf.length;
  }

  return Buffer.concat([header, entries, ...pngBuffers]);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

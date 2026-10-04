import { promises as fs } from "node:fs";
import path from "node:path";
import { loadSharp } from "./sharp.js";

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
 * Uses the package's pinned Sharp. Each target produces a
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
  const sharp = (await loadSharp()).default;
  // Buffer input gives every target the same snapshot and releases the source
  // file handle before publication, including when resizing in place on Windows.
  const input = await fs.readFile(imagePath);
  const meta = await sharp(input).metadata();
  const sourceWidth = meta.width!;
  const sourceHeight = meta.height!;
  const stem = sourceFile.replace(/\.[^.]+$/, "");
  const names = new Set<string>();
  const destination = path.resolve(outDir);
  const targets = options.targets.map((target) => {
    const width = target.width;
    const height = target.height ?? Math.round((width * sourceHeight) / sourceWidth);
    if (![width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 2147483647)) {
      throw new Error("resizeImage: target dimensions must be positive integers no larger than 2147483647.");
    }
    const file = target.filename ?? `${stem}-${width}x${height}.png`;
    const key = file.normalize("NFC").toLowerCase();
    if (!file || file === "." || file === ".." || /[\\/:\0]/.test(file)
      || path.basename(file) !== file || path.win32.basename(file) !== file) {
      throw new Error(`resizeImage: output name must be a safe basename (got ${JSON.stringify(file)}).`);
    }
    if (names.has(key)) throw new Error(`resizeImage: output filenames must be unique (${file}).`);
    names.add(key);
    return { file, width, height, path: path.join(destination, file) };
  });
  async function checkTarget(file: string): Promise<boolean> {
    const stat = await fs.lstat(file).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    });
    if (stat && !overwrite) throw new Error(`resizeImage: output file already exists: ${file}. Pass overwrite=true to replace.`);
    if (stat && !stat.isFile()) throw new Error(`resizeImage: output must be a regular file: ${file}.`);
    return Boolean(stat);
  }
  for (const target of targets) await checkTarget(target.path);

  const parent = path.dirname(destination);
  await fs.mkdir(parent, { recursive: true });
  const staging = await fs.mkdtemp(path.join(parent, `.${path.basename(destination)}.resize-`));
  const files = path.join(staging, "files");
  const backups = path.join(staging, "backups");
  const moved: Array<{ path: string; backup: string }> = [];
  const published: string[] = [];
  let preserveBackups = false;
  const destinationExisted = await exists(destination);
  const outputs: ResizeResult["outputs"] = [];
  try {
    await fs.mkdir(files);
    await fs.mkdir(backups);
    for (const target of targets) {
      const info = await sharp(input).resize(target.width, target.height, { fit }).png().toFile(path.join(files, target.file));
      outputs.push({ file: target.file, width: info.width, height: info.height, path: target.path });
    }
    // Recheck the entire set after generation, before touching prior outputs.
    for (const target of targets) await checkTarget(target.path);
    await fs.mkdir(destination, { recursive: true });
    for (const [index, target] of targets.entries()) {
      if (await checkTarget(target.path)) {
        const backup = path.join(backups, String(index));
        await fs.rename(target.path, backup);
        moved.push({ path: target.path, backup });
      }
      const source = path.join(files, target.file);
      // link is an atomic no-clobber publish if another writer won the race.
      if (overwrite) await fs.rename(source, target.path);
      else await fs.link(source, target.path);
      published.push(target.path);
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const file of published.reverse()) await fs.unlink(file).catch((failure) => rollbackErrors.push(failure));
    for (const prior of moved.reverse()) await fs.rename(prior.backup, prior.path).catch((failure) => rollbackErrors.push(failure));
    if (!destinationExisted) await fs.rmdir(destination).catch(() => undefined);
    if (rollbackErrors.length) {
      preserveBackups = true;
      throw new AggregateError([error, ...rollbackErrors], `resizeImage: publication failed; recovery files remain at ${staging}`);
    }
    throw error;
  } finally {
    if (!preserveBackups) await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
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

  if (sizes.length === 0 || sizes.some((size) => !Number.isInteger(size) || size < 1 || size > 256)) {
    throw new Error("generateIco: sizes must contain integers from 1 to 256.");
  }

  if (!outPath.toLowerCase().endsWith(".ico")) {
    throw new Error(`generateIco: output path must end with .ico (got: ${outPath})`);
  }

  if (!overwrite && (await exists(outPath))) {
    throw new Error(`generateIco: output file already exists: ${outPath}. Pass overwrite=true to replace.`);
  }

  const sharp = (await loadSharp()).default;
  const sourceFile = imagePath.split(/[\\/]/).pop()!;

  // Resize source to each requested size, keep PNG buffers in memory.
  const pngBuffers: Buffer[] = [];
  for (const sz of sizes) {
    const buf = await sharp(imagePath)
      .resize(sz, sz, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
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

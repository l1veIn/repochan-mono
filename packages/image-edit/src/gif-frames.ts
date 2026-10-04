import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import { loadSharp } from "./sharp.js";

// gifenc's Node entry exports an object while its bundler entry defaults to
// the encoder function. Resolve the Node entry consistently in this library.
const { GIFEncoder, quantize, applyPalette } = createRequire(import.meta.url)("gifenc") as typeof import("gifenc");

/** Options for combining frames into an animated GIF. */
export type FramesToGifOptions = {
  /** Frames per second. Used to derive per-frame delay in ms. Default 10 (100ms/frame). */
  fps?: number;
  /** Per-frame delay in ms. Overrides fps. An array must match the frame count; a scalar applies to all. */
  delay?: number | number[];
  /** Repeat count. -1 = play once, 0 = infinite (default). */
  loop?: number;
  /** Max palette colors per frame (GIF limit 256). Default 256. */
  palette?: number;
  /** Replace an existing output file. Default false. */
  overwrite?: boolean;
};

export type FramesToGifResult = {
  outFile: string;
  frameCount: number;
  width: number;
  height: number;
  /** First frame's actual encoded delay in ms, rounded to GIF's 10ms precision. */
  delay: number;
  loop: number;
};

/**
 * Combine multiple image frames into one animated GIF.
 *
 * Reads each frame file, normalizes it to raw RGBA at a uniform size (first
 * frame's dimensions; later frames are resized to match via pinned Sharp), and
 * encodes with gifenc because Sharp does not reliably write multi-frame GIFs.
 *
 * Pure pixel operation: writes one GIF to `outPath`. Does NOT touch any
 * `.repochan/` protocol directory.
 *
 * @param framePaths  absolute paths to frame images (PNG/JPG), in playback order
 * @param outPath     absolute path for the output .gif
 * @param options     fps / delay / loop / palette / overwrite
 */
export async function framesToGif(
  framePaths: string[],
  outPath: string,
  options: FramesToGifOptions = {},
): Promise<FramesToGifResult> {
  if (!Array.isArray(framePaths) || framePaths.length < 2) {
    throw new Error(`framesToGif: need at least 2 frames (got ${framePaths?.length ?? 0}).`);
  }
  if ((await exists(outPath)) && !options.overwrite) {
    throw new Error(`framesToGif: output already exists: ${outPath}. Pass overwrite=true to replace.`);
  }

  const loop = options.loop ?? 0;
  const fps = options.fps ?? 10;
  const perFrameDelay = resolveDelay(options.delay, fps, framePaths.length);
  const maxColors = options.palette ?? 256;
  if (!Number.isInteger(loop) || loop < -1 || loop > 65535) {
    throw new Error("framesToGif: loop must be an integer from -1 to 65535.");
  }
  if (!Number.isInteger(maxColors) || maxColors < 2 || maxColors > 256) {
    throw new Error("framesToGif: palette must be an integer from 2 to 256.");
  }

  // Decode all frames to uniform-size RGBA via the package's pinned Sharp.
  const sharp = (await loadSharp()).default;

  // Read the first frame to establish the target dimensions.
  const firstMeta = await sharp(framePaths[0]).metadata();
  const width = firstMeta.width!;
  const height = firstMeta.height!;

  const rawFrames: Uint8Array[] = [];
  for (const fp of framePaths) {
    let pipeline = sharp(fp).ensureAlpha().resize(width, height, { fit: "fill" });
    const { data } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    rawFrames.push(new Uint8Array(data));
  }

  // Encode with gifenc.
  const gif = GIFEncoder();
  for (let i = 0; i < rawFrames.length; i++) {
    const rgba = rawFrames[i];
    // GIF supports one transparent palette entry. Reserve it explicitly so
    // color quantization cannot merge transparent pixels into opaque colors.
    const opaque = new Uint8Array(rgba.length);
    let opaqueLength = 0;
    let hasTransparency = false;
    for (let offset = 0; offset < rgba.length; offset += 4) {
      if (rgba[offset + 3] <= 127) {
        hasTransparency = true;
      } else {
        opaque.set(rgba.subarray(offset, offset + 3), opaqueLength);
        opaque[opaqueLength + 3] = 255;
        opaqueLength += 4;
      }
    }
    const palette = opaqueLength > 0
      ? quantize(opaque.slice(0, opaqueLength), maxColors - Number(hasTransparency), { format: "rgba4444" })
      : [];
    const index = palette.length > 0
      ? applyPalette(rgba, palette, "rgba4444")
      : new Uint8Array(width * height);
    const transparentIndex = palette.length;
    if (hasTransparency) {
      palette.push([0, 0, 0, 0]);
      for (let pixel = 0; pixel < index.length; pixel++) {
        if (rgba[pixel * 4 + 3] <= 127) index[pixel] = transparentIndex;
      }
    }
    gif.writeFrame(index, width, height, {
      palette,
      delay: perFrameDelay[i],
      repeat: loop,
      transparent: hasTransparency,
      transparentIndex,
    });
  }
  gif.finish();

  await fs.writeFile(outPath, gif.bytes());

  return {
    outFile: outPath.split(/[\\/]/).pop()!,
    frameCount: rawFrames.length,
    width,
    height,
    delay: perFrameDelay[0],
    loop,
  };
}

/**
 * Resolve per-frame delays. Priority: explicit delay option > fps-derived.
 * Returns an array of length `frameCount`.
 */
function resolveDelay(delay: number | number[] | undefined, fps: number, frameCount: number): number[] {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error("framesToGif: fps must be finite and positive.");
  }
  let delays: number[];
  if (Array.isArray(delay)) {
    if (delay.length !== frameCount) {
      throw new Error(`framesToGif: delay array must contain exactly ${frameCount} entries.`);
    }
    delays = delay;
  } else {
    delays = new Array(frameCount).fill(delay ?? 1000 / fps);
  }
  return Array.from(delays, (value) => {
    if (!Number.isFinite(value) || value < 0 || value > 655350) {
      throw new Error("framesToGif: delay must be finite and from 0 to 655350ms.");
    }
    // The GIF graphic control extension stores an unsigned 16-bit count of
    // centiseconds. Pass the same quantized value to gifenc and the result.
    return Math.round(value / 10) * 10;
  });
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

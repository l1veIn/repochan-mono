import { promises as fs } from "node:fs";
import gifenc from "gifenc";
import { loadSharp } from "./sharp.js";

const { GIFEncoder, quantize, applyPalette } = gifenc;

/** Options for combining frames into an animated GIF. */
export type FramesToGifOptions = {
  /** Frames per second. Used to derive per-frame delay in ms. Default 10 (100ms/frame). */
  fps?: number;
  /** Per-frame delay in ms. Overrides fps when given. Length should match frames; a single value applies to all. */
  delay?: number | number[];
  /** Number of times to loop. 0 = infinite (default). */
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
  const gif = GIFEncoder(width, height);
  for (let i = 0; i < rawFrames.length; i++) {
    const rgba = rawFrames[i];
    const palette = quantize(rgba, maxColors, { format: "rgba4444" });
    const index = applyPalette(rgba, palette, "rgba4444");
    gif.writeFrame(index, width, height, { palette, delay: perFrameDelay[i] });
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
  if (Array.isArray(delay)) {
    if (delay.length === frameCount) return delay;
    // Broadcast single-element array or pad/truncate.
    const d = delay[0] ?? Math.round(1000 / fps);
    return new Array(frameCount).fill(d);
  }
  if (typeof delay === "number") {
    return new Array(frameCount).fill(delay);
  }
  return new Array(frameCount).fill(Math.round(1000 / fps));
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

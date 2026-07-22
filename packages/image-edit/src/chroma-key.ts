import { promises as fs } from "node:fs";
import path from "node:path";
import { loadSharp } from "./sharp.js";

// ---------------------------------------------------------------------------
// Chroma keying — deterministic matte extraction (no ML model required).
// ---------------------------------------------------------------------------
// Ported from gpt-image-2-skill's transparent extract algorithm.
// The pipeline:
//   1. Estimate or use provided matte color (the flat background color).
//   2. For each pixel: Euclidean RGB distance to matte → smoothstep → alpha.
//   3. Decontaminate: unpremultiply the pixel against the matte color.
//   4. Suppress matte spill at edges (pull dominant matte channels down).
//   5. Scrub: force near-transparent pixels to [0,0,0,0] to kill fringes.

// ── Constants (matching gpt-image-2-skill defaults) ────────────────────────

const TRANSPARENT_ALPHA_MAX = 5;
const DEFAULT_THRESHOLD = 28.0;
const DEFAULT_SOFTNESS = 34.0;
const DEFAULT_SPILL_SUPPRESSION = 0.85;

/** Hard acceptance bound for decoded rasters (design doc §10): width, height, and total pixels. */
export const DEFAULT_MAX_DIMENSION = 8192;

/**
 * Throw when a decoded raster exceeds the max dimension guard.
 * Applied at every raw decode entry to stop oversized PNGs from OOMing the agent.
 */
export function assertMaxDimensions(width: number, height: number, maxDimension = DEFAULT_MAX_DIMENSION): void {
  if (width > maxDimension || height > maxDimension || width * height > maxDimension * maxDimension) {
    throw new Error(`image exceeds max dimension ${maxDimension}`);
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export type MatteColor = [number, number, number]; // [r, g, b] 0-255

export type ChromaKeyOptions = {
  /** Matte (background) color. If omitted, auto-sampled from image corners. Default: auto. */
  matteColor?: MatteColor | "auto";
  /** Distance below which a pixel is fully transparent. Default 28.0 (v1) / 96 (v2). */
  threshold?: number;
  /** Smooth transition band above threshold. Default 34.0. v1 only, ignored by v2. */
  softness?: number;
  /** Edge spill suppression strength 0–1. Default 0.85. v1 only, ignored by v2. */
  spillSuppression?: number;
  /** Chroma pipeline version. Default "v2" (PR7); "v1" is the byte-frozen legacy escape hatch. */
  pipeline?: "v1" | "v2";
  /** v2 only: in-band blend distance ceiling. Default 180. */
  fringeThreshold?: number;
  /** v2 only: minimum key tint for blend/spill classes. Default 18. */
  fringeDelta?: number;
  /** v2 only: Chebyshev depth reach for soft-alpha unmix. Default 4. */
  unmixReach?: number;
  /** v2 only: max trapped-spill cluster size as fraction of subject pixels. Default 0.005. */
  spillMaxFraction?: number;
  /** Color space. "ycbcr" is reserved and currently throws Unsupported. */
  mode?: "rgb" | "ycbcr";
  /** Max width/height (and total pixel bound) guard. Default 8192. */
  maxDimension?: number;
};

export type ChromaKeyResult = {
  sourceFile: string;
  outFile: string;
  matteColor: MatteColor;
  matteColorSource: "provided" | "auto-sampled";
  threshold: number;
  softness: number;
  spillSuppression: number;
};

// ── Color math ─────────────────────────────────────────────────────────────

function colorDistance(a: MatteColor, b: MatteColor): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Estimate the matte color by sampling the four corners of the image.
 *
 * Uses per-channel mode (most frequent value) with quantization bins to
 * handle AI-generated matte jitter (e.g. #ff00ff may be rendered as ~247,4,239).
 * Mode is more robust than median when the subject bleeds into the corners —
 * background pixels still dominate the frequency count.
 */
export function estimateMatteColor(data: Buffer, width: number, height: number, channels: number, cornerSample = 32): MatteColor {
  const sample = Math.min(width, height, cornerSample);
  const binSize = 8; // quantize to bins of 8 (0-7→0, 8-15→8, … 248-255→248)
  const binCount = Math.ceil(256 / binSize);

  const rBins = new Array(binCount).fill(0);
  const gBins = new Array(binCount).fill(0);
  const bBins = new Array(binCount).fill(0);

  for (let y = 0; y < sample; y++) {
    for (let x = 0; x < sample; x++) {
      for (const [px, py] of [
        [x, y],
        [width - 1 - x, y],
        [x, height - 1 - y],
        [width - 1 - x, height - 1 - y],
      ]) {
        const idx = (py * width + px) * channels;
        rBins[Math.min(binCount - 1, Math.floor(data[idx] / binSize))]++;
        gBins[Math.min(binCount - 1, Math.floor(data[idx + 1] / binSize))]++;
        bBins[Math.min(binCount - 1, Math.floor(data[idx + 2] / binSize))]++;
      }
    }
  }

  // Find the bin with the highest count per channel, return its bin center.
  const modeBin = (bins: number[]): number => {
    let max = 0;
    let maxIdx = 0;
    for (let i = 0; i < bins.length; i++) {
      if (bins[i] > max) {
        max = bins[i];
        maxIdx = i;
      }
    }
    return Math.min(255, maxIdx * binSize + Math.floor(binSize / 2));
  };

  return [modeBin(rBins), modeBin(gBins), modeBin(bBins)];
}

// ── Spill suppression ──────────────────────────────────────────────────────

/**
 * Suppress matte-color spill at edges. For high-contrast mattes (green,
 * magenta, cyan), pull the dominant matte channels down toward the reference
 * of the other channels. Weighted by matte-similarity and edge proximity.
 */
function suppressMatteSpill(
  rgba: [number, number, number, number],
  matte: MatteColor,
  alpha: number,
  amount: number,
): void {
  const clampedAmount = Math.max(0, Math.min(1, amount));
  if (clampedAmount <= 0 || alpha <= TRANSPARENT_ALPHA_MAX) return;

  const maxMatte = Math.max(matte[0], matte[1], matte[2]);
  const minMatte = Math.min(matte[0], matte[1], matte[2]);
  // Only applies to high-contrast mattes (pure green/magenta/cyan).
  if (maxMatte < 192 || maxMatte - minMatte < 128) return;

  const dominantChannels: number[] = [];
  const otherChannels: number[] = [];
  for (let c = 0; c < 3; c++) {
    if (matte[c] >= maxMatte - 8) dominantChannels.push(c);
    else otherChannels.push(c);
  }
  if (dominantChannels.length === 0 || otherChannels.length === 0) return;

  const rgb: MatteColor = [rgba[0], rgba[1], rgba[2]];
  const maxDistance = 255 * Math.sqrt(3);
  const matteSimilarity = Math.max(0, Math.min(1, 1 - colorDistance(rgb, matte) / maxDistance));
  const alphaEdgeFactor = Math.sqrt(Math.max(0, Math.min(1, 1 - alpha / 255)));
  const strength = clampedAmount * Math.max(Math.sqrt(matteSimilarity), alphaEdgeFactor);
  if (strength <= 0.01) return;

  const reference = Math.max(...otherChannels.map((c) => rgba[c]));
  for (const c of dominantChannels) {
    if (rgba[c] <= reference) continue;
    const excess = rgba[c] - reference;
    rgba[c] = Math.round(rgba[c] - excess * strength);
  }
}

// ── Core extraction ────────────────────────────────────────────────────────

/**
 * Extract alpha via chroma keying from an RGBA buffer.
 * Returns a new RGBA buffer with the subject isolated on transparent background.
 */
export function extractChromaKey(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  matte: MatteColor,
  threshold = DEFAULT_THRESHOLD,
  softness = DEFAULT_SOFTNESS,
  spillSuppression = DEFAULT_SPILL_SUPPRESSION,
): Buffer {
  const low = Math.max(0, threshold);
  const high = Math.max(low + 1, threshold + Math.max(1, softness));
  const output = Buffer.alloc(width * height * 4);

  for (let p = 0, q = 0; p < data.length && q < output.length; p += channels, q += 4) {
    const src: MatteColor = [data[p], data[p + 1], data[p + 2]];
    const srcAlpha = channels >= 4 ? data[p + 3] : 255;

    const distance = colorDistance(src, matte);
    const t = Math.max(0, Math.min(1, (distance - low) / (high - low)));
    const alpha = Math.round(Math.max(0, Math.min(255, smoothstep(t) * 255)));

    if (alpha <= TRANSPARENT_ALPHA_MAX) {
      // Fully transparent — scrub to [0,0,0,0].
      output[q] = 0;
      output[q + 1] = 0;
      output[q + 2] = 0;
      output[q + 3] = 0;
      continue;
    }

    // Decontaminate: unpremultiply against matte.
    const alphaF = alpha / 255;
    const rgba: [number, number, number, number] = [0, 0, 0, 0];
    for (let c = 0; c < 3; c++) {
      rgba[c] = Math.round(
        Math.max(0, Math.min(255, (src[c] - matte[c] * (1 - alphaF)) / Math.max(0.001, alphaF))),
      );
    }

    // Suppress matte spill at edges.
    suppressMatteSpill(rgba, matte, alpha, spillSuppression);

    rgba[3] = Math.min(alpha, srcAlpha);
    output[q] = rgba[0];
    output[q + 1] = rgba[1];
    output[q + 2] = rgba[2];
    output[q + 3] = rgba[3];
  }

  return output;
}

// ── File-level API ─────────────────────────────────────────────────────────

/**
 * Chroma-key a source image: read it, extract alpha via matte color, write a
 * transparent PNG. Uses the package's pinned Sharp for decode/encode.
 *
 * @param imagePath  absolute path to source image (PNG/JPG)
 * @param outPath    absolute path to output transparent PNG
 * @param options    { matteColor?, threshold?, softness?, spillSuppression? }
 */
export async function chromaKeyImage(
  imagePath: string,
  outPath: string,
  options: ChromaKeyOptions = {},
): Promise<ChromaKeyResult> {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const softness = options.softness ?? DEFAULT_SOFTNESS;
  const spillSuppression = options.spillSuppression ?? DEFAULT_SPILL_SUPPRESSION;

  const sharp = (await loadSharp()).default;
  const raw = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const { width, height, channels } = info;
  assertMaxDimensions(width, height, options.maxDimension ?? DEFAULT_MAX_DIMENSION);

  // v2 (the PR7 default) and reserved modes delegate to the dual-track
  // pipeline. Dynamic import keeps chroma-key.ts ↔ chroma-pipeline.ts
  // acyclic; the explicit v1 escape-hatch path below stays byte-identical.
  const pipeline = options.pipeline ?? "v2";
  if (pipeline === "v2" || (options.mode && options.mode !== "rgb")) {
    const { runChromaPipeline } = await import("./chroma-pipeline.js");
    const result = runChromaPipeline(data, width, height, channels, {
      pipeline,
      matteColor: options.matteColor,
      threshold: options.threshold,
      fringeThreshold: options.fringeThreshold,
      fringeDelta: options.fringeDelta,
      unmixReach: options.unmixReach,
      spillMaxFraction: options.spillMaxFraction,
      mode: options.mode,
      maxDimension: options.maxDimension,
    });
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await sharp(result.data, { raw: { width, height, channels: 4 } }).png().toFile(outPath);
    const sourceFile = imagePath.split(/[\\/]/).pop()!;
    return {
      sourceFile,
      outFile: outPath,
      matteColor: result.matteColor,
      matteColorSource: result.matteColorSource,
      threshold: options.threshold ?? 96,
      softness,
      spillSuppression,
    };
  }

  // Resolve matte color: provided or auto-sampled.
  let matte: MatteColor;
  let matteColorSource: "provided" | "auto-sampled";
  if (options.matteColor && options.matteColor !== "auto") {
    matte = options.matteColor;
    matteColorSource = "provided";
  } else {
    matte = estimateMatteColor(data, width, height, channels);
    matteColorSource = "auto-sampled";
  }

  const outputData = extractChromaKey(data, width, height, channels, matte, threshold, softness, spillSuppression);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await sharp(outputData, { raw: { width, height, channels: 4 } }).png().toFile(outPath);

  const sourceFile = imagePath.split(/[\\/]/).pop()!;
  return {
    sourceFile,
    outFile: outPath,
    matteColor: matte,
    matteColorSource,
    threshold,
    softness,
    spillSuppression,
  };
}

// ── Matte color parsing ────────────────────────────────────────────────────

/**
 * Parse a matte color string. Supports named colors and #RRGGBB hex.
 * Returns `"auto"` for auto-sampling.
 */
export function parseMatteColor(value: string): MatteColor | "auto" {
  const v = value.trim().toLowerCase();
  if (v === "auto" || v === "sample" || v === "auto-sample") return "auto";
  const named: Record<string, MatteColor> = {
    black: [0, 0, 0],
    white: [255, 255, 255],
    green: [0, 255, 0],
    "chroma-green": [0, 255, 0],
    magenta: [255, 0, 255],
    cyan: [0, 255, 255],
    blue: [0, 0, 255],
  };
  if (named[v]) return named[v];
  const hex = v.startsWith("#") ? v.slice(1) : v;
  if (hex.length !== 6) throw new Error(`Invalid matte color: ${value}. Use a named color or #RRGGBB.`);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) throw new Error(`Invalid matte color hex: ${value}`);
  return [r, g, b];
}

/**
 * Convert a MatteColor to a hex string for display.
 */
export function matteColorToHex(c: MatteColor): string {
  return `#${c[0].toString(16).padStart(2, "0")}${c[1].toString(16).padStart(2, "0")}${c[2].toString(16).padStart(2, "0")}`;
}

import { promises as fs } from "node:fs";
import path from "node:path";
import { loadSharp } from "./sharp.js";

export const SEAM_METRIC_ID = "premultiplied-rgba-l1-v1" as const;

export type SeamEdgeMetrics = {
  /** Number of opposing edge pixel pairs. */
  samples: number;
  /** Arithmetic mean of the normalized per-pair deltas. */
  meanDelta: number;
  /** Largest normalized per-pair delta; useful for locating a hotspot. */
  maxDelta: number;
};

export type TileSeamMetrics = {
  leftRight: SeamEdgeMetrics;
  topBottom: SeamEdgeMetrics;
  /** max(leftRight.meanDelta, topBottom.meanDelta). */
  score: number;
};

export type SeamValidationOptions = {
  /** Maximum accepted score, inclusive, normalized to 0..1. Default 0.02. */
  threshold?: number;
  /** Optional PNG path for a literal 3x3 repetition board. */
  boardOutFile?: string;
  /** Replace an existing board file. Default false. */
  overwrite?: boolean;
};

export type SeamValidationResult = {
  sourceFile: string;
  width: number;
  height: number;
  metrics: TileSeamMetrics;
  threshold: number;
  pass: boolean;
  metric: {
    id: typeof SEAM_METRIC_ID;
    description: string;
    range: readonly [0, 1];
  };
  provenance: {
    operation: "validate-seamless-tile";
    version: 1;
    sourcePath: string;
    decodedChannels: 4;
  };
  board?: {
    outFile: string;
    rows: 3;
    cols: 3;
    width: number;
    height: number;
  };
};

/**
 * Compute deterministic edge mismatch metrics for decoded RGBA pixels.
 *
 * `premultiplied-rgba-l1-v1` compares opposing edge pixels after RGB is
 * premultiplied by alpha. A pair delta is the mean absolute difference of
 * premultiplied R/G/B and alpha, divided by 255, so it is in [0, 1]. Hidden
 * RGB in fully transparent pixels therefore cannot create a false seam.
 * Each edge reports the mean and maximum pair delta. The validation score is
 * the larger of the two edge means; a score equal to the threshold passes.
 */
export function computeTileSeamMetrics(
  rgba: Uint8Array,
  width: number,
  height: number,
): TileSeamMetrics {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
    throw new Error(`computeTileSeamMetrics: width and height must be integers >= 2 (got ${width}x${height}).`);
  }
  const expected = width * height * 4;
  if (rgba.length !== expected) {
    throw new Error(`computeTileSeamMetrics: expected ${expected} RGBA bytes, got ${rgba.length}.`);
  }

  const horizontal: number[] = [];
  for (let y = 0; y < height; y++) {
    horizontal.push(pixelDelta(rgba, (y * width) * 4, (y * width + width - 1) * 4));
  }
  const vertical: number[] = [];
  for (let x = 0; x < width; x++) {
    vertical.push(pixelDelta(rgba, x * 4, ((height - 1) * width + x) * 4));
  }
  const leftRight = summarize(horizontal);
  const topBottom = summarize(vertical);
  return { leftRight, topBottom, score: Math.max(leftRight.meanDelta, topBottom.meanDelta) };
}

/** Load a tile, validate its opposing edges, and optionally write a 3x3 board. */
export async function validateSeamlessTile(
  imagePath: string,
  options: SeamValidationOptions = {},
): Promise<SeamValidationResult> {
  const threshold = options.threshold ?? 0.02;
  if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`validateSeamlessTile: threshold must be a finite number from 0 to 1 (got ${threshold}).`);
  }

  const sharp = (await loadSharp()).default;
  const decoded = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = decoded.info;
  const rgba = decoded.data;
  const metrics = computeTileSeamMetrics(rgba, width, height);
  const result: SeamValidationResult = {
    sourceFile: path.basename(imagePath),
    width,
    height,
    metrics,
    threshold,
    pass: metrics.score <= threshold,
    metric: {
      id: SEAM_METRIC_ID,
      description: "Mean normalized L1 delta of premultiplied RGBA across opposing edges; score is the larger edge mean.",
      range: [0, 1],
    },
    provenance: {
      operation: "validate-seamless-tile",
      version: 1,
      sourcePath: path.resolve(imagePath),
      decodedChannels: 4,
    },
  };

  if (options.boardOutFile) {
    if (!options.overwrite && await exists(options.boardOutFile)) {
      throw new Error(`validateSeamlessTile: board file already exists: ${options.boardOutFile}. Pass overwrite=true to replace.`);
    }
    const boardWidth = width * 3;
    const boardHeight = height * 3;
    const composites = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        composites.push({
          input: rgba,
          raw: { width, height, channels: 4 as const },
          left: col * width,
          top: row * height,
        });
      }
    }
    await fs.mkdir(path.dirname(options.boardOutFile), { recursive: true });
    await sharp({
      create: { width: boardWidth, height: boardHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite(composites).png().toFile(options.boardOutFile);
    result.board = {
      outFile: options.boardOutFile,
      rows: 3,
      cols: 3,
      width: boardWidth,
      height: boardHeight,
    };
  }

  return result;
}

function pixelDelta(rgba: Uint8Array, a: number, b: number): number {
  const alphaA = rgba[a + 3] / 255;
  const alphaB = rgba[b + 3] / 255;
  const rgbDelta =
    Math.abs(rgba[a] * alphaA - rgba[b] * alphaB)
    + Math.abs(rgba[a + 1] * alphaA - rgba[b + 1] * alphaB)
    + Math.abs(rgba[a + 2] * alphaA - rgba[b + 2] * alphaB);
  return (rgbDelta + Math.abs(rgba[a + 3] - rgba[b + 3])) / (4 * 255);
}

function summarize(values: readonly number[]): SeamEdgeMetrics {
  return {
    samples: values.length,
    meanDelta: values.reduce((sum, value) => sum + value, 0) / values.length,
    maxDelta: Math.max(...values),
  };
}

async function exists(file: string): Promise<boolean> {
  try { await fs.access(file); return true; } catch { return false; }
}

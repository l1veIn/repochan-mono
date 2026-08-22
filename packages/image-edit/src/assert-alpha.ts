import { promises as fs } from "node:fs";
import path from "node:path";
import { loadSharp } from "./sharp.js";
import { assertMaxDimensions } from "./chroma-key.js";

export type AlphaAssertDefectCode =
  | "missing_alpha"
  | "insufficient_transparent"
  | "opaque_corners";

export type AlphaAssertDefect = {
  code: AlphaAssertDefectCode;
  metric: number;
  detail: string;
};

export type AlphaAssertOptions = {
  /** Alpha below this is counted as transparent. Default 16. */
  alphaThreshold?: number;
  /** Minimum share of pixels below alphaThreshold. Default 0.15. */
  minTransparentRatio?: number;
  /** Maximum alpha allowed at any of the four corners. Default 16. */
  maxCornerAlpha?: number;
  /** Replace an existing output. Default false. */
  overwrite?: boolean;
  maxDimension?: number;
};

export type AlphaAssertStats = {
  width: number;
  height: number;
  channels: number;
  hasAlpha: boolean;
  transparentRatio: number;
  partialRatio: number;
  opaqueRatio: number;
  corners: { tl: number; tr: number; bl: number; br: number };
};

export type AlphaAssertResult = {
  sourceFile: string;
  outFile: string;
  stats: AlphaAssertStats;
};

export class AlphaAssertError extends Error {
  readonly name = "AlphaAssertError";
  constructor(
    message: string,
    readonly defects: AlphaAssertDefect[],
    readonly stats?: AlphaAssertStats,
  ) {
    super(message);
  }
}

const DEFAULT_ALPHA_THRESHOLD = 16;
const DEFAULT_MIN_TRANSPARENT_RATIO = 0.15;
const DEFAULT_MAX_CORNER_ALPHA = 16;

/**
 * Require a real alpha channel with a usable transparent field.
 * Catches gpt-image-2's RGB "painted checkerboard / near-white" failure mode.
 * On success, copies the source to outPath unchanged.
 */
export async function assertImageAlpha(
  imagePath: string,
  outPath: string,
  options: AlphaAssertOptions = {},
): Promise<AlphaAssertResult> {
  const alphaThreshold = options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD;
  const minTransparentRatio = options.minTransparentRatio ?? DEFAULT_MIN_TRANSPARENT_RATIO;
  const maxCornerAlpha = options.maxCornerAlpha ?? DEFAULT_MAX_CORNER_ALPHA;

  const sharp = (await loadSharp()).default;
  const input = await fs.readFile(imagePath);
  const metadata = await sharp(input).metadata();
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assertMaxDimensions(info.width, info.height, options.maxDimension);

  const n = info.width * info.height;
  let transparent = 0;
  let partial = 0;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a < alphaThreshold) transparent++;
    else if (a < 240) partial++;
    else opaque++;
  }
  const sample = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
  const stats: AlphaAssertStats = {
    width: info.width,
    height: info.height,
    channels: metadata.channels ?? info.channels,
    hasAlpha: Boolean(metadata.hasAlpha) && (metadata.channels ?? 0) >= 4,
    transparentRatio: transparent / n,
    partialRatio: partial / n,
    opaqueRatio: opaque / n,
    corners: {
      tl: sample(0, 0),
      tr: sample(info.width - 1, 0),
      bl: sample(0, info.height - 1),
      br: sample(info.width - 1, info.height - 1),
    },
  };

  const defects: AlphaAssertDefect[] = [];
  if (!stats.hasAlpha) {
    defects.push({
      code: "missing_alpha",
      metric: stats.channels,
      detail: `source has ${stats.channels} channel(s) and hasAlpha=${metadata.hasAlpha}; native transparent output must be RGBA`,
    });
  }
  if (stats.transparentRatio < minTransparentRatio) {
    defects.push({
      code: "insufficient_transparent",
      metric: stats.transparentRatio,
      detail: `transparentRatio ${stats.transparentRatio.toFixed(4)} < ${minTransparentRatio} (threshold ${alphaThreshold})`,
    });
  }
  const cornerValues = Object.values(stats.corners);
  if (cornerValues.some((a) => a > maxCornerAlpha)) {
    defects.push({
      code: "opaque_corners",
      metric: Math.max(...cornerValues),
      detail: `corners ${JSON.stringify(stats.corners)} exceed maxCornerAlpha ${maxCornerAlpha}`,
    });
  }
  if (defects.length) {
    throw new AlphaAssertError(
      `assert-alpha failed: ${defects.map((d) => d.code).join(", ")}`,
      defects,
      stats,
    );
  }

  const resolvedOut = path.resolve(outPath);
  const resolvedIn = path.resolve(imagePath);
  if (resolvedOut !== resolvedIn) {
    if (!options.overwrite) {
      try {
        await fs.access(resolvedOut);
        throw new Error(`assert-alpha: output exists (${resolvedOut}); pass overwrite=true`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    await fs.mkdir(path.dirname(resolvedOut), { recursive: true });
    await fs.copyFile(resolvedIn, resolvedOut);
  }

  return {
    sourceFile: imagePath.split(/[\\/]/).pop()!,
    outFile: resolvedOut,
    stats,
  };
}

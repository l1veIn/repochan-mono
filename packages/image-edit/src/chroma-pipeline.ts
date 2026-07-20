// ---------------------------------------------------------------------------
// Dual-track chroma pipeline: v2 (default since PR7, soft-unmix) and v1
// (frozen legacy escape hatch).
//
// The v2 algorithm (key tint scoring, pixel classification, 8-connected
// Chebyshev depth BFS, soft-alpha unmix, trapped-spill despill) is ported
// from sprite-gen (https://github.com/aldegad/sprite-gen),
// sprite_gen/extract.py `remove_chroma_background`, licensed under
// Apache-2.0. This is a behavior-aligned TypeScript rewrite; constants match
// the source and docs/design/cutout-slice-stability.md §1.2 — do not retune
// them ad hoc. See NOTICE for attribution.
//
// v1 delegates to extractChromaKey in chroma-key.ts and stays byte-identical
// to the legacy behavior; it is reached only via explicit `pipeline: "v1"`.
// `pipeline` defaults to "v2".
// ---------------------------------------------------------------------------

import {
  extractChromaKey,
  estimateMatteColor,
  assertMaxDimensions,
  DEFAULT_MAX_DIMENSION,
  type MatteColor,
} from "./chroma-key.js";

// ── v2 constants (sprite-gen aligned, normative — see design doc §1.2) ─────

const V2_DEFAULT_THRESHOLD = 96; // hard cut (DEFAULT_KEY_THRESHOLD)
const V2_DEFAULT_FRINGE_THRESHOLD = 180; // DEFAULT_FRINGE_KEY_THRESHOLD
const V2_DEFAULT_FRINGE_DELTA = 18; // DEFAULT_FRINGE_DELTA
const V2_DEFAULT_UNMIX_REACH = 4;
const V2_DEFAULT_SPILL_MAX_FRACTION = 0.005;
const V2_IN_BAND_UNMIX_KEY_DEPTH = 2; // _IN_BAND_UNMIX_KEY_DEPTH
const V2_SPILL_MIN_TINT = 40; // _SPILL_MIN_TINT

// v1 defaults (mirrors chroma-key.ts; v1 delegates so these only feed result metadata)
const V1_DEFAULT_THRESHOLD = 28;
const V1_DEFAULT_SOFTNESS = 34;
const V1_DEFAULT_SPILL_SUPPRESSION = 0.85;

// Pixel classes (decided once on the source colors, before any mutation).
const CLASS_KEYED = 0; // erased: transparent input or hard key cut
const CLASS_SUBJECT = 1; // not key-tinted — never touched
const CLASS_BLEND_IN_BAND = 2; // key-tinted, within fringeThreshold of the key
const CLASS_BLEND_OUT_OF_BAND = 3; // key-tinted, farther than fringeThreshold

const DEPTH_UNSEEN = 255;

// ── Types ──────────────────────────────────────────────────────────────────

export type ChromaPipelineOptions = {
  /** Pipeline version. Default "v2" (PR7); "v1" is the frozen legacy escape hatch. */
  pipeline?: "v1" | "v2";
  /** Matte (background) color. If omitted or "auto", corner-sampled. */
  matteColor?: MatteColor | "auto";
  /** Hard-cut distance. v1 default 28; v2 default 96. */
  threshold?: number;
  /** v1 only: smooth transition band above threshold. Default 34. Ignored by v2. */
  softness?: number;
  /** v1 only: edge spill suppression strength 0–1. Default 0.85. Ignored by v2. */
  spillSuppression?: number;
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

export type ChromaPipelineStats = {
  /** Pixels hard-cut to (0,0,0,0). */
  keyedPixels: number;
  /** Pixels classified as non-key-tinted subject (never unmixed). */
  subjectPixels: number;
  /** Key-tinted pixels within fringeThreshold of the key. */
  blendInBandPixels: number;
  /** Key-tinted pixels farther than fringeThreshold. */
  blendOutOfBandPixels: number;
  /** Blend pixels separated into despilled RGB + partial alpha. */
  unmixedPixels: number;
  /** Trapped-spill clusters despilled (RGB only, alpha preserved). */
  spillClustersDespilled: number;
  /** Pixels inside those clusters. */
  spillPixelsDespilled: number;
};

export type ChromaPipelineResult = {
  /** RGBA output buffer (width * height * 4). */
  data: Buffer;
  width: number;
  height: number;
  pipeline: "v1" | "v2";
  matteColor: MatteColor;
  matteColorSource: "provided" | "auto-sampled";
  /** v2 pass statistics. Undefined for v1 (no classification pass exists). */
  stats?: ChromaPipelineStats;
};

// ── Color math ─────────────────────────────────────────────────────────────

function colorDistance(a: MatteColor, b: MatteColor): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * How strongly a color leans toward the chroma key's channel signature:
 * average of the key's dominant channels (>=192) minus average of its
 * quiet channels (<64). Returns 0 when the key has no clear channel split.
 * Linear in the channels, so a (1-k)·subject + k·key blend scores k·keyTint
 * above the subject's own tint.
 */
export function keyTintScore(color: MatteColor, chromaKey: MatteColor): number {
  const keyed: number[] = [];
  const unkeyed: number[] = [];
  for (let i = 0; i < 3; i++) {
    if (chromaKey[i] >= 192) keyed.push(i);
    else if (chromaKey[i] < 64) unkeyed.push(i);
  }
  if (keyed.length === 0 || unkeyed.length === 0) return 0;
  const keyedAvg = keyed.reduce((sum, i) => sum + color[i], 0) / keyed.length;
  const unkeyedAvg = unkeyed.reduce((sum, i) => sum + color[i], 0) / unkeyed.length;
  return keyedAvg - unkeyedAvg;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Estimate the key fraction of a blend pixel and remove it from the RGB.
 * Blend model: observed = (1-k)·subject + k·key. Returns [coverage, rgb];
 * coverage <= 0 means fully key (rgb returned as [0,0,0]).
 */
function despillColor(
  color: MatteColor,
  chromaKey: MatteColor,
  keyTint: number,
  tint: number,
): [number, MatteColor] {
  const k = Math.min(tint / keyTint, 1);
  const coverage = 1 - k;
  if (coverage <= 0) return [0, [0, 0, 0]];
  const rgb: MatteColor = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    rgb[c] = clamp255(Math.round((color[c] - k * chromaKey[c]) / coverage));
  }
  return [coverage, rgb];
}

/** Separate a key/subject blend pixel into despilled RGB + partial alpha. */
function unmixKeyBlend(
  color: MatteColor,
  alpha: number,
  chromaKey: MatteColor,
  keyTint: number,
  tint: number,
): [number, number, number, number] {
  const [coverage, despilled] = despillColor(color, chromaKey, keyTint, tint);
  const outAlpha = Math.round(alpha * coverage);
  if (outAlpha <= 0) return [0, 0, 0, 0];
  return [despilled[0], despilled[1], despilled[2], outAlpha];
}

// ── v2 core ────────────────────────────────────────────────────────────────

function runChromaPipelineV2(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  key: MatteColor,
  threshold: number,
  fringeThreshold: number,
  fringeDelta: number,
  unmixReach: number,
  spillMaxFraction: number,
): { output: Buffer; stats: ChromaPipelineStats } {
  const pixelCount = width * height;
  const output = Buffer.alloc(pixelCount * 4);
  const classes = new Uint8Array(pixelCount);
  const depths = new Uint8Array(pixelCount).fill(DEPTH_UNSEEN);
  const keyedIndices: number[] = [];

  const stats: ChromaPipelineStats = {
    keyedPixels: 0,
    subjectPixels: 0,
    blendInBandPixels: 0,
    blendOutOfBandPixels: 0,
    unmixedPixels: 0,
    spillClustersDespilled: 0,
    spillPixelsDespilled: 0,
  };

  // Copy to RGBA and classify each pixel on its source color.
  for (let i = 0; i < pixelCount; i++) {
    const p = i * channels;
    const q = i * 4;
    const color: MatteColor = [data[p], data[p + 1], data[p + 2]];
    const alpha = channels >= 4 ? data[p + 3] : 255;

    if (alpha === 0 || colorDistance(color, key) <= threshold) {
      classes[i] = CLASS_KEYED;
      depths[i] = 0;
      keyedIndices.push(i);
      stats.keyedPixels++;
      continue; // output already zero-filled → (0,0,0,0)
    }

    output[q] = color[0];
    output[q + 1] = color[1];
    output[q + 2] = color[2];
    output[q + 3] = alpha;

    if (keyTintScore(color, key) < fringeDelta) {
      classes[i] = CLASS_SUBJECT;
      stats.subjectPixels++;
    } else if (colorDistance(color, key) <= fringeThreshold) {
      classes[i] = CLASS_BLEND_IN_BAND;
      stats.blendInBandPixels++;
    } else {
      classes[i] = CLASS_BLEND_OUT_OF_BAND;
      stats.blendOutOfBandPixels++;
    }
  }

  const keyTint = keyTintScore(key, key);
  const maxReach = Math.min(DEPTH_UNSEEN - 1, keyTint > 0 ? unmixReach : 0);

  // Chebyshev depth (8-connected) to the nearest keyed pixel — outer
  // background and interior holes alike. The walk is not blocked by subject
  // pixels, so an isolated key blend locked inside subject material still
  // gets a depth.
  let frontier = keyedIndices;
  let depth = 0;
  while (frontier.length > 0 && depth < maxReach) {
    depth++;
    const next: number[] = [];
    for (const index of frontier) {
      const x = index % width;
      const y = Math.floor(index / width);
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbor = ny * width + nx;
          if (depths[neighbor] === DEPTH_UNSEEN) {
            depths[neighbor] = depth;
            next.push(neighbor);
          }
        }
      }
    }
    frontier = next;
  }

  // Soft-alpha unmix — binary erase cannot represent antialiased coverage:
  // out-of-band blends always (within reach); in-band blends only within the
  // AA band nearest the key (depth <= 2). Deeper in-band key-tinted material
  // stays byte-identical.
  if (keyTint > 0 && unmixReach > 0) {
    for (let i = 0; i < pixelCount; i++) {
      if (!(depths[i] > 0 && depths[i] <= unmixReach)) continue;
      const cls = classes[i];
      if (cls === CLASS_BLEND_IN_BAND) {
        if (depths[i] > V2_IN_BAND_UNMIX_KEY_DEPTH) continue;
      } else if (cls !== CLASS_BLEND_OUT_OF_BAND) {
        continue;
      }
      const q = i * 4;
      const color: MatteColor = [output[q], output[q + 1], output[q + 2]];
      const [r, g, b, a] = unmixKeyBlend(color, output[q + 3], key, keyTint, keyTintScore(color, key));
      output[q] = r;
      output[q + 1] = g;
      output[q + 2] = b;
      output[q + 3] = a;
      stats.unmixedPixels++;
    }
  }

  // Trapped-spill despill — generators paint key-colored spill *inside* the
  // subject too far from any keyed pixel for the depth pass to reach. Among
  // the still-tinted pixels left after the passes above, a small connected
  // cluster is spill; a large one is intentional key-tinted material and
  // stays untouched. Spill keeps its alpha — it sits inside opaque subject,
  // so this is color correction, not coverage.
  if (keyTint > 0 && keyedIndices.length > 0 && spillMaxFraction > 0) {
    const subjectCount = pixelCount - stats.keyedPixels;
    const spillLimit = Math.max(32, Math.round(subjectCount * spillMaxFraction));

    const tintsLeft = new Map<number, number>();
    for (let i = 0; i < pixelCount; i++) {
      const q = i * 4;
      if (output[q + 3] === 0) continue;
      const tint = keyTintScore([output[q], output[q + 1], output[q + 2]], key);
      if (tint >= fringeDelta) tintsLeft.set(i, tint);
    }

    const visited = new Uint8Array(pixelCount);
    for (const start of tintsLeft.keys()) {
      if (visited[start]) continue;
      // 8-connected cluster of still-tinted pixels.
      const cluster: number[] = [];
      const stack = [start];
      visited[start] = 1;
      while (stack.length > 0) {
        const index = stack.pop()!;
        cluster.push(index);
        const x = index % width;
        const y = Math.floor(index / width);
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const neighbor = ny * width + nx;
            if (!visited[neighbor] && tintsLeft.has(neighbor)) {
              visited[neighbor] = 1;
              stack.push(neighbor);
            }
          }
        }
      }
      if (cluster.length > spillLimit) continue;
      // Design doc §1.2: treat when cluster max tint >= spillMinTint (40).
      let maxTint = 0;
      for (const index of cluster) maxTint = Math.max(maxTint, tintsLeft.get(index)!);
      if (maxTint < V2_SPILL_MIN_TINT) continue;
      for (const index of cluster) {
        const q = index * 4;
        const color: MatteColor = [output[q], output[q + 1], output[q + 2]];
        const [coverage, despilled] = despillColor(color, key, keyTint, keyTintScore(color, key));
        if (coverage > 0) {
          output[q] = despilled[0];
          output[q + 1] = despilled[1];
          output[q + 2] = despilled[2];
          // alpha untouched (pinhole guard)
        }
      }
      stats.spillClustersDespilled++;
      stats.spillPixelsDespilled += cluster.length;
    }
  }

  return { output, stats };
}

// ── Public entry ───────────────────────────────────────────────────────────

/**
 * Run the dual-track chroma pipeline on a raw RGB(A) buffer.
 *
 * - `pipeline: "v2"` (default since PR7) runs the sprite-gen aligned hard
 *   cut + soft-alpha unmix + trapped-spill despill. `softness`/
 *   `spillSuppression` are v1-only and ignored by v2.
 * - `pipeline: "v1"` (explicit escape hatch) delegates to the frozen v1
 *   extraction (Euclidean distance → smoothstep alpha → unpremultiply →
 *   spill suppression) and is byte-identical to `extractChromaKey`.
 */
export function runChromaPipeline(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  options: ChromaPipelineOptions = {},
): ChromaPipelineResult {
  if (options.mode === "ycbcr") {
    throw new Error('Unsupported chroma mode "ycbcr": reserved for a future release, use "rgb"');
  }
  assertMaxDimensions(width, height, options.maxDimension ?? DEFAULT_MAX_DIMENSION);
  if (channels < 3) {
    throw new Error(`Unsupported channel count ${channels}: expected RGB or RGBA data`);
  }

  const pipeline = options.pipeline ?? "v2";

  let matte: MatteColor;
  let matteColorSource: "provided" | "auto-sampled";
  if (options.matteColor && options.matteColor !== "auto") {
    matte = options.matteColor;
    matteColorSource = "provided";
  } else {
    matte = estimateMatteColor(data, width, height, channels);
    matteColorSource = "auto-sampled";
  }

  if (pipeline === "v1") {
    const output = extractChromaKey(
      data,
      width,
      height,
      channels,
      matte,
      options.threshold ?? V1_DEFAULT_THRESHOLD,
      options.softness ?? V1_DEFAULT_SOFTNESS,
      options.spillSuppression ?? V1_DEFAULT_SPILL_SUPPRESSION,
    );
    return { data: output, width, height, pipeline, matteColor: matte, matteColorSource };
  }

  const { output, stats } = runChromaPipelineV2(
    data,
    width,
    height,
    channels,
    matte,
    options.threshold ?? V2_DEFAULT_THRESHOLD,
    options.fringeThreshold ?? V2_DEFAULT_FRINGE_THRESHOLD,
    options.fringeDelta ?? V2_DEFAULT_FRINGE_DELTA,
    options.unmixReach ?? V2_DEFAULT_UNMIX_REACH,
    options.spillMaxFraction ?? V2_DEFAULT_SPILL_MAX_FRACTION,
  );
  return { data: output, width, height, pipeline, matteColor: matte, matteColorSource, stats };
}

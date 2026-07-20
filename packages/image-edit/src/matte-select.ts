// ---------------------------------------------------------------------------
// Matte color selection (design doc §2).
//
// - "corner" (default): legacy corner-mode sampling via estimateMatteColor.
//   Keeps `matteColor: "auto"` byte-compatible with today's behavior; a weak
//   clearance is reported as a warning, never a hard failure here.
// - "subject-aware" (opt-in): FIRST verifies background existence — candidates
//   farther than eraseRadius from the corner-sampled background are excluded
//   (a candidate that is not the sheet's actual background would key nothing;
//   production defect: green sheet + mint subject picked magenta and erased
//   nothing → foreground-ratio hard fail). When no candidate matches the
//   measured background, falls back to the corner-sampled color with a
//   warning (source "auto-sampled", never a hard collision). Among the
//   surviving candidates, subject clearance is the tie-breaker: reject
//   candidates inside the erase radius of subject pixels; when every survivor
//   fails, take the max score and flag clearsEraseRadius=false (the hard-fail
//   decision lives in the caller, see matte_subject_collision §2).
// ---------------------------------------------------------------------------

import { estimateMatteColor, type MatteColor } from "./chroma-key.js";

// Hard thresholds of the active pipeline (design doc §1.2 constant table).
const V1_HARD_THRESHOLD = 28;
const V2_HARD_THRESHOLD = 96;

const DEFAULT_CANDIDATES: MatteColor[] = [
  [255, 0, 255], // magenta
  [0, 255, 0], // green
  [0, 255, 255], // cyan
];

// ── Types ──────────────────────────────────────────────────────────────────

export type MatteSelectCandidateScore = {
  matte: MatteColor;
  score: number;
  minSubjectDistance: number;
  clearsEraseRadius: boolean;
};

export type MatteSelectResult = {
  matte: MatteColor;
  /** How the key was chosen. */
  source: "provided" | "auto-sampled" | "auto-subject-aware";
  /** Higher = safer distance from subject (subject-aware scoring). Corner mode may use 0. */
  score: number;
  /** Euclidean RGB distance from matte to nearest non-background subject sample. */
  minSubjectDistance: number;
  /** true iff minSubjectDistance >= eraseRadius used for hard-cut. */
  clearsEraseRadius: boolean;
  eraseRadius: number;
  candidateScores: MatteSelectCandidateScore[];
  /** Non-fatal notes (e.g. corner-auto weak clearance). */
  warnings?: string[];
};

export type MatteSelectOptions = {
  /** Default "corner" for back-compat of "auto". */
  mode?: "corner" | "subject-aware";
  /** Default: magenta, green, cyan. */
  candidates?: MatteColor[];
  /** Default: active pipeline hard threshold (v1→28, v2→96). */
  eraseRadius?: number;
  /** Pipeline whose hard threshold derives the default eraseRadius. Default "v2" (PR7). */
  pipeline?: "v1" | "v2";
  /** Corner sample window passed to estimateMatteColor. Default 32. */
  cornerSample?: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function colorDistance(a: MatteColor, b: MatteColor): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Background-cluster tolerance for subject detection: two estimateMatteColor
 * quantization bins (binSize 8). A pixel further than this from the
 * background reference is a subject sample — independent of eraseRadius, so
 * `clearsEraseRadius` can genuinely answer "will the hard cut eat subject
 * material?" (matte_subject_collision signal).
 */
const SUBJECT_MASK_TOLERANCE = 16;

/**
 * Collect subject samples: opaque pixels clearly outside the background
 * cluster (distance > SUBJECT_MASK_TOLERANCE).
 */
function collectSubjectSamples(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  background: MatteColor,
): MatteColor[] {
  const pixelCount = width * height;
  const samples: MatteColor[] = [];
  for (let i = 0; i < pixelCount; i++) {
    const p = i * channels;
    if (channels >= 4 && data[p + 3] === 0) continue;
    const color: MatteColor = [data[p], data[p + 1], data[p + 2]];
    if (colorDistance(color, background) > SUBJECT_MASK_TOLERANCE) samples.push(color);
  }
  return samples;
}

function minDistanceToSamples(color: MatteColor, samples: MatteColor[]): number {
  let min = Infinity;
  for (const sample of samples) {
    const d = colorDistance(color, sample);
    if (d < min) min = d;
  }
  return min;
}

// ── Public entry ───────────────────────────────────────────────────────────

/**
 * Measure how clear a *provided* matte is of subject pixels: distance from the
 * matte to the nearest non-background sample (background = corner estimate),
 * and whether that distance clears the erase radius. Pure computation — the
 * matte_subject_collision hard-fail decision lives in the caller (§2 rule 2).
 */
export function measureMatteClearance(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  matte: MatteColor,
  eraseRadius: number,
  cornerSample = 32,
): { minSubjectDistance: number; clearsEraseRadius: boolean } {
  const background = estimateMatteColor(data, width, height, channels, cornerSample);
  const samples = collectSubjectSamples(data, width, height, channels, background);
  const minSubjectDistance = minDistanceToSamples(matte, samples);
  return { minSubjectDistance, clearsEraseRadius: minSubjectDistance >= eraseRadius };
}

/**
 * Choose a matte (chroma key) color for a raw RGB(A) buffer.
 * Pure computation — no I/O, no hard failures (see matte_subject_collision).
 */
export function selectMatteColor(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  options: MatteSelectOptions = {},
): MatteSelectResult {
  const mode = options.mode ?? "corner";
  const eraseRadius =
    options.eraseRadius ?? (options.pipeline === "v1" ? V1_HARD_THRESHOLD : V2_HARD_THRESHOLD);
  const warnings: string[] = [];

  if (mode === "corner") {
    const matte = estimateMatteColor(data, width, height, channels, options.cornerSample ?? 32);
    const samples = collectSubjectSamples(data, width, height, channels, matte);
    const minSubjectDistance = minDistanceToSamples(matte, samples);
    const clearsEraseRadius = minSubjectDistance >= eraseRadius;
    if (!clearsEraseRadius) {
      warnings.push(
        `corner-auto matte is within erase radius of subject pixels ` +
          `(minSubjectDistance=${minSubjectDistance.toFixed(1)} < eraseRadius=${eraseRadius})`,
      );
    }
    return {
      matte,
      source: "auto-sampled",
      score: 0,
      minSubjectDistance,
      clearsEraseRadius,
      eraseRadius,
      candidateScores: [{ matte, score: 0, minSubjectDistance, clearsEraseRadius }],
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  // subject-aware: score each candidate by clearance from subject pixels.
  const background = estimateMatteColor(data, width, height, channels, options.cornerSample ?? 32);
  const samples = collectSubjectSamples(data, width, height, channels, background);
  const candidates = options.candidates ?? DEFAULT_CANDIDATES;
  const candidateScores: MatteSelectCandidateScore[] = candidates.map((matte) => {
    const minSubjectDistance = minDistanceToSamples(matte, samples);
    return {
      matte,
      score: minSubjectDistance,
      minSubjectDistance,
      clearsEraseRadius: minSubjectDistance >= eraseRadius,
    };
  });

  // Background existence verification (PR7 production fix): a candidate that
  // is not within eraseRadius of the measured background cannot be the sheet's
  // matte — keying with it would erase nothing (foreground-ratio hard fail).
  // "Far from the subject" is only a tie-breaker AMONG background-verified
  // candidates, never a substitute for being the actual background.
  const backgroundMatched = candidateScores.filter(
    (candidate) => colorDistance(candidate.matte, background) <= eraseRadius,
  );
  if (backgroundMatched.length === 0) {
    // No candidate is the actual background: fall back to the corner-sampled
    // color (same non-hard-fail semantics as corner mode).
    warnings.push(
      `subject-aware matte select: no candidate matches the sampled background ` +
        `within eraseRadius=${eraseRadius}; falling back to the corner-sampled matte`,
    );
    const minSubjectDistance = minDistanceToSamples(background, samples);
    return {
      matte: background,
      source: "auto-sampled",
      score: 0,
      minSubjectDistance,
      clearsEraseRadius: minSubjectDistance >= eraseRadius,
      eraseRadius,
      candidateScores,
      warnings,
    };
  }

  const eligible = backgroundMatched.filter((c) => c.clearsEraseRadius);
  const pool = eligible.length > 0 ? eligible : backgroundMatched;
  // Max score wins; ties resolve to the earlier candidate (stable order).
  let best = pool[0];
  for (const candidate of pool) {
    if (candidate.score > best.score) best = candidate;
  }
  if (eligible.length === 0) {
    warnings.push(
      `subject-aware matte select: no candidate clears eraseRadius=${eraseRadius}; ` +
        `picked max score ${best.score.toFixed(1)} (clearsEraseRadius=false)`,
    );
  }

  return {
    matte: best.matte,
    source: "auto-subject-aware",
    score: best.score,
    minSubjectDistance: best.minSubjectDistance,
    clearsEraseRadius: best.clearsEraseRadius,
    eraseRadius,
    candidateScores,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

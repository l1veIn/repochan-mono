// ---------------------------------------------------------------------------
// Unified extraction entry: extractAssets (design doc §9).
//
// One library entry for all grid/cutout extraction, with four strategies:
//
//   - "chroma-grid" (DEFAULT since PR7): whole-sheet chroma ONCE, then
//     centroid-components geometry (computeCentroidGridGeometry), union-crop
//     QA; seed-cell edge contact is a soft metric only, the hard gates are
//     sheet outer-boundary contact and empty cells (§5).
//   - "equal-cell"  (explicit escape hatch): equal seed cells, PER-CELL
//     chroma (pre-PR7 status quo of extractMatteGrid — pixel-compat
//     invariant: explicit v1 output stays byte-identical to the legacy
//     behavior), cell-perimeter edge QA.
//   - "ml-blobs":   whole-image ISNet matting + blob count (the stickers
//     path). Requires the optional, locally installed image-ML capability.
//   - "hybrid":     chroma-grid first; on QA failure, ML assist per failed
//     cell, then QA again. Requires hybrid.mlFallback === true (§7).
//
// The default chroma pipeline is v2 (soft-unmix) since PR7; v1 is the frozen
// escape hatch. Escape-hatch rollback: explicit strategy "equal-cell" and/or
// chroma.pipeline "v1".
//
// Hard failure rules (§2):
//   - matte_subject_collision: subject-aware auto with !clearsEraseRadius, or
//     provided matte with minSubjectDistance < eraseRadius. Corner auto only
//     warns (legacy behavior preserved).
//   - chroma_residue: recomputed on the chroma OUTPUT RGBA (see
//     chroma-residue.ts — never pipeline depth==0), ratio > residueMaxFraction.
//
// Publishing is atomic (staging rename with backup rollback), the overwrite
// latch is explicit, and every decode entry passes assertMaxDimensions (§10).
// ---------------------------------------------------------------------------

import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  assertMaxDimensions,
  DEFAULT_MAX_DIMENSION,
  type MatteColor,
} from "./chroma-key.js";
import { runChromaPipeline } from "./chroma-pipeline.js";
import {
  measureMatteClearance,
  selectMatteColor,
  type MatteSelectResult,
} from "./matte-select.js";
import { measureChromaResidue } from "./chroma-residue.js";
import { computeCentroidGridGeometry, type GridCellAssignment } from "./grid-geometry.js";
import { computeTileCells, readPngSize, type TileCell } from "./slicing.js";
import { findConnectedComponents } from "./connected-components.js";
import { matteImage, type MatteModel } from "./imgly.js";
import { loadSharp } from "./sharp.js";
import type {
  GridSemanticCell,
  GridSemanticMapping,
  MatteGridItem,
} from "./matte-grid.js";

// ── Public types (design doc §9 — normative field list) ────────────────────

export type ExtractStrategy = "equal-cell" | "chroma-grid" | "ml-blobs" | "hybrid";

export type ExtractDefectCode =
  | "empty_cell"
  | "edge_touch" // equal-cell: seed-cell perimeter (legacy)
  | "sheet_edge_touch" // chroma-grid/hybrid: full-sheet outer edge
  | "foreground_ratio_low"
  | "foreground_ratio_high"
  | "frame_count_mismatch" // ml-blobs blob count ≠ rows*cols
  | "matte_subject_collision" // §2 hard rules
  | "chroma_residue" // §2 hard rules
  | "ml_unavailable"
  | "invalid_options"; // strategy/geometry/hybrid conflicts (may also throw pre-run)

export type ExtractDefect = {
  code: ExtractDefectCode;
  key?: string;
  index?: number;
  detail: string;
  metric?: number;
};

export type HybridPolicy = {
  /** Required true when strategy === "hybrid". Default false only meaningful as field default on chroma-grid. */
  mlFallback?: boolean;
  model?: MatteModel;
  /**
   * Geometry for ML assist after chroma-grid fail:
   * - "seed-cell": crop equal-cell (may reintroduce drift) — simple salvage
   * - "dilated-seed": seed cell expanded by dilateFraction (default 0.15) then ML
   * - "source-bounds": if partial chroma crop exists, ML that bbox
   * default: "dilated-seed"
   */
  mlCrop?: "seed-cell" | "dilated-seed" | "source-bounds";
  dilateFraction?: number; // default 0.15
};

export type ExtractAssetsOptions = {
  /** Default "chroma-grid" (PR7); "equal-cell" is the explicit escape hatch. */
  strategy?: ExtractStrategy;
  rows: number;
  cols: number;
  /** Required for named outputs (all strategies except pure ml-blobs sNN). */
  mapping?: GridSemanticMapping;
  /** Full grid assignment + QA always runs; only these keys are published. */
  subset?: readonly string[];
  chroma?: {
    /** Default "v2" (PR7); "v1" is the frozen legacy escape hatch. */
    pipeline?: "v1" | "v2";
    matteColor?: MatteColor | "auto";
    threshold?: number;
    softness?: number;
    spillSuppression?: number;
    fringeThreshold?: number;
    fringeDelta?: number;
    unmixReach?: number;
    spillMaxFraction?: number;
    mode?: "rgb" | "ycbcr";
    /** corner = legacy auto; subject-aware = scored candidates. Default "corner" when matteColor is auto/omitted. */
    matteSelect?: "corner" | "subject-aware";
  };
  geometry?: {
    mode?: "equal-cell" | "centroid-components"; // must agree with strategy (§3)
    minBlobFraction?: number; // default 0.005 — relative to the average seed-cell area (PR7), not the whole sheet
    debrisFraction?: number; // default 0.30
    debrisBorderTolPx?: number; // default 2
    noiseMinAbs?: number; // default 60
    mergedSpanFactor?: number; // default 1.5
    alphaThreshold?: number; // CC; default 16 chroma / 128 ml-blobs
    debrisPolicy?: "drop" | "keep-with-owner"; // default "keep-with-owner" (PR7): border-touching small components merge into the cell owner's bbox (sticker decorations near cell edges); "drop" is the explicit opt-out
  };
  normalize?: {
    canvasSize: number | { width: number; height: number };
    padding?: number;
    align?: "center" | "feet"; // default center; feet = bottom-aligned
  };
  qa?: {
    alphaThreshold?: number; // default 16
    minForegroundRatio?: number; // default 0.005
    maxForegroundRatio?: number; // default 0.8
    maxEdgeTouchRatio?: number; // equal-cell hard; default 0
    maxSheetEdgeTouchRatio?: number; // chroma-grid hard; default 0
    residueMaxFraction?: number; // chroma_residue; default 0.001
    residueEdgeDepthPx?: number; // default 2; dist to transparent for residue
    requireFullCount?: boolean; // default true for full mapping
    maxBodyScaleCv?: number; // optional soft only
  };
  hybrid?: HybridPolicy; // required mlFallback:true when strategy===hybrid
  format?: "png" | "webp";
  quality?: number;
  overwrite?: boolean;
  maxDimension?: number; // default 8192
};

export type ExtractQaReport = {
  ok: boolean;
  defects: ExtractDefect[];
  matte: MatteSelectResult;
  strategyUsed: ExtractStrategy | "hybrid:chroma-grid" | "hybrid:ml-cell";
  pipeline: "v1" | "v2";
  metrics?: {
    chromaResidueRatio?: number;
    sheetEdgeTouchRatio?: number;
    warnings?: string[];
  };
};

export type ExtractAssetsResult = {
  sourceFile: string;
  rows: number;
  cols: number;
  items: MatteGridItem[];
  qa: ExtractQaReport;
  matteColor: MatteColor;
  matteColorSource: MatteSelectResult["source"];
};

export class ExtractError extends Error {
  readonly name = "ExtractError";
  constructor(
    message: string,
    readonly defects: ExtractDefect[],
    readonly qa?: ExtractQaReport,
  ) {
    super(message);
  }
}

// ── Resolved options ───────────────────────────────────────────────────────

type ResolvedQa = {
  alphaThreshold: number;
  minForegroundRatio: number;
  maxForegroundRatio: number;
  maxEdgeTouchRatio: number;
  maxSheetEdgeTouchRatio: number;
  residueMaxFraction: number;
  residueEdgeDepthPx: number;
  requireFullCount: boolean;
  maxBodyScaleCv?: number;
};

type Resolved = {
  strategy: ExtractStrategy;
  rows: number;
  cols: number;
  semanticCells: GridSemanticCell[]; // empty for ml-blobs
  subset?: readonly string[];
  pipeline: "v1" | "v2";
  providedMatte?: MatteColor;
  matteSelect: "corner" | "subject-aware";
  chroma: {
    threshold?: number;
    softness?: number;
    spillSuppression?: number;
    fringeThreshold?: number;
    fringeDelta?: number;
    unmixReach?: number;
    spillMaxFraction?: number;
    mode?: "rgb" | "ycbcr";
  };
  geometry: {
    minBlobFraction?: number;
    debrisFraction?: number;
    debrisBorderTolPx?: number;
    noiseMinAbs?: number;
    mergedSpanFactor?: number;
    alphaThreshold?: number;
    debrisPolicy?: "drop" | "keep-with-owner";
  };
  canvas: { width: number; height: number };
  padding: number;
  align: "center" | "feet";
  qa: ResolvedQa;
  hybridModel: MatteModel;
  mlCrop: "seed-cell" | "dilated-seed" | "source-bounds";
  dilateFraction: number;
  format: "png" | "webp";
  quality: number;
  overwrite: boolean;
  maxDimension: number;
};

const V1_HARD_THRESHOLD = 28;
const V2_HARD_THRESHOLD = 96;
const ML_BLOB_ALPHA_THRESHOLD = 128; // ml-blobs CC threshold (legacy; design §4)

function invalidOptions(detail: string): ExtractError {
  return new ExtractError(`extractAssets: invalid options: ${detail}`, [
    { code: "invalid_options", detail },
  ]);
}

function resolveOptions(options: ExtractAssetsOptions): Resolved {
  const { rows, cols } = options;
  const strategy = options.strategy ?? "chroma-grid"; // PR7 default
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw invalidOptions(`rows and cols must be positive integers (got rows=${rows}, cols=${cols}).`);
  }
  if (strategy !== "equal-cell" && strategy !== "chroma-grid" && strategy !== "ml-blobs" && strategy !== "hybrid") {
    throw invalidOptions(`unknown strategy "${String(strategy)}"; use equal-cell | chroma-grid | ml-blobs | hybrid.`);
  }

  // ── strategy ↔ geometry.mode pairing (design §3) ──
  const geometryMode = options.geometry?.mode;
  if (strategy === "equal-cell" && geometryMode !== undefined && geometryMode !== "equal-cell") {
    throw invalidOptions(`strategy "equal-cell" requires geometry.mode "equal-cell" (got "${String(geometryMode)}").`);
  }
  if ((strategy === "chroma-grid" || strategy === "hybrid") && geometryMode !== undefined && geometryMode !== "centroid-components") {
    throw invalidOptions(`strategy "${strategy}" requires geometry.mode "centroid-components" (got "${String(geometryMode)}").`);
  }
  if (strategy === "ml-blobs" && options.geometry !== undefined) {
    throw invalidOptions(`strategy "ml-blobs" does not accept a geometry configuration (geometry is N/A for blob detection).`);
  }
  if (strategy === "ml-blobs" && options.subset !== undefined) {
    throw invalidOptions(`strategy "ml-blobs" does not accept subset (output keys are positional sNN).`);
  }

  // ── hybrid contract (design §7): no legal "hybrid without ML" config ──
  if (strategy === "hybrid" && options.hybrid?.mlFallback !== true) {
    throw invalidOptions("hybrid requires hybrid.mlFallback === true; use strategy chroma-grid otherwise");
  }
  if (options.hybrid?.mlCrop !== undefined && !["seed-cell", "dilated-seed", "source-bounds"].includes(options.hybrid.mlCrop)) {
    throw invalidOptions(`hybrid.mlCrop must be seed-cell | dilated-seed | source-bounds (got "${String(options.hybrid.mlCrop)}").`);
  }
  const dilateFraction = options.hybrid?.dilateFraction ?? 0.15;
  if (typeof dilateFraction !== "number" || dilateFraction < 0 || dilateFraction > 1) {
    throw invalidOptions(`hybrid.dilateFraction must be between 0 and 1 (got ${dilateFraction}).`);
  }
  const hybridModel = options.hybrid?.model ?? "small";
  if (hybridModel !== "small" && hybridModel !== "medium") {
    throw invalidOptions(`hybrid.model must be small | medium (got "${String(hybridModel)}").`);
  }

  // ── mapping / subset (named strategies) ──
  let semanticCells: GridSemanticCell[] = [];
  if (strategy !== "ml-blobs") {
    if (options.mapping === undefined) {
      throw invalidOptions(`strategy "${strategy}" requires a semantic mapping (named outputs).`);
    }
    semanticCells = normalizeMapping(options.mapping, rows * cols);
    if (options.subset) validateSubset(semanticCells, options.subset);
  }

  // ── normalize (named strategies) ──
  let canvas = { width: 0, height: 0 };
  let padding = 0;
  let align: "center" | "feet" = "center";
  if (strategy !== "ml-blobs") {
    canvas = normalizeCanvas(options.normalize?.canvasSize);
    padding = options.normalize?.padding ?? 0;
    if (!Number.isInteger(padding) || padding < 0 || padding * 2 >= canvas.width || padding * 2 >= canvas.height) {
      throw invalidOptions(`padding must be a non-negative integer smaller than half the canvas (got ${padding}).`);
    }
    align = options.normalize?.align ?? "center";
    if (align !== "center" && align !== "feet") {
      throw invalidOptions(`normalize.align must be "center" | "feet" (got "${String(align)}").`);
    }
  }

  // ── qa ──
  const qa = normalizeQa(options.qa);

  // ── geometry numerics (chroma-grid/hybrid) ──
  const geometry = options.geometry ?? {};
  for (const key of ["minBlobFraction", "debrisFraction"] as const) {
    const value = geometry[key];
    if (value !== undefined && (typeof value !== "number" || value < 0 || value > 1)) {
      throw invalidOptions(`geometry.${key} must be between 0 and 1 (got ${value}).`);
    }
  }
  if (geometry.noiseMinAbs !== undefined && (!Number.isInteger(geometry.noiseMinAbs) || geometry.noiseMinAbs < 0)) {
    throw invalidOptions(`geometry.noiseMinAbs must be a non-negative integer (got ${geometry.noiseMinAbs}).`);
  }
  if (geometry.debrisBorderTolPx !== undefined && (!Number.isInteger(geometry.debrisBorderTolPx) || geometry.debrisBorderTolPx < 0)) {
    throw invalidOptions(`geometry.debrisBorderTolPx must be a non-negative integer (got ${geometry.debrisBorderTolPx}).`);
  }
  if (geometry.mergedSpanFactor !== undefined && (typeof geometry.mergedSpanFactor !== "number" || geometry.mergedSpanFactor < 1)) {
    throw invalidOptions(`geometry.mergedSpanFactor must be >= 1 (got ${geometry.mergedSpanFactor}).`);
  }
  if (geometry.alphaThreshold !== undefined && (!Number.isInteger(geometry.alphaThreshold) || geometry.alphaThreshold < 1 || geometry.alphaThreshold > 255)) {
    throw invalidOptions(`geometry.alphaThreshold must be an integer from 1 to 255 (got ${geometry.alphaThreshold}).`);
  }

  const chroma = options.chroma ?? {};
  const pipeline = chroma.pipeline ?? "v2"; // PR7 default
  if (pipeline !== "v1" && pipeline !== "v2") {
    throw invalidOptions(`chroma.pipeline must be "v1" | "v2" (got "${String(pipeline)}").`);
  }
  const matteSelect = chroma.matteSelect ?? "corner";
  if (matteSelect !== "corner" && matteSelect !== "subject-aware") {
    throw invalidOptions(`chroma.matteSelect must be "corner" | "subject-aware" (got "${String(matteSelect)}").`);
  }

  const format = options.format ?? "png";
  if (format !== "png" && format !== "webp") {
    throw invalidOptions(`format must be "png" | "webp" (got "${String(format)}").`);
  }

  return {
    strategy,
    rows,
    cols,
    semanticCells,
    subset: options.subset,
    pipeline,
    providedMatte: chroma.matteColor && chroma.matteColor !== "auto" ? chroma.matteColor : undefined,
    matteSelect,
    chroma: {
      threshold: chroma.threshold,
      softness: chroma.softness,
      spillSuppression: chroma.spillSuppression,
      fringeThreshold: chroma.fringeThreshold,
      fringeDelta: chroma.fringeDelta,
      unmixReach: chroma.unmixReach,
      spillMaxFraction: chroma.spillMaxFraction,
      mode: chroma.mode,
    },
    geometry: {
      minBlobFraction: geometry.minBlobFraction,
      debrisFraction: geometry.debrisFraction,
      debrisBorderTolPx: geometry.debrisBorderTolPx,
      noiseMinAbs: geometry.noiseMinAbs,
      mergedSpanFactor: geometry.mergedSpanFactor,
      alphaThreshold: geometry.alphaThreshold,
      debrisPolicy: geometry.debrisPolicy,
    },
    canvas,
    padding,
    align,
    qa,
    hybridModel,
    mlCrop: options.hybrid?.mlCrop ?? "dilated-seed",
    dilateFraction,
    format,
    quality: options.quality ?? 80,
    overwrite: options.overwrite ?? false,
    maxDimension: options.maxDimension ?? DEFAULT_MAX_DIMENSION,
  };
}

function normalizeMapping(mapping: GridSemanticMapping, cellCount: number): GridSemanticCell[] {
  if (!mapping || (Array.isArray(mapping) && mapping.length === 0)) {
    throw invalidOptions("mapping must contain at least one semantic cell.");
  }
  let entries: GridSemanticCell[];
  if (Array.isArray(mapping)) {
    entries = mapping.map((value, index) => (typeof value === "string" ? { key: value, index } : value));
  } else {
    entries = Object.entries(mapping).map(([key, index]) => ({ key, index }));
  }
  const keys = new Set<string>();
  const indices = new Set<number>();
  for (const entry of entries) {
    if (!entry || typeof entry.key !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.key)) {
      throw invalidOptions(`invalid semantic key "${entry?.key ?? ""}"; use lowercase kebab-case.`);
    }
    if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= cellCount) {
      throw invalidOptions(`mapping index ${entry.index} for "${entry.key}" is outside 0..${cellCount - 1}.`);
    }
    if (keys.has(entry.key)) throw invalidOptions(`duplicate semantic key "${entry.key}".`);
    if (indices.has(entry.index)) throw invalidOptions(`duplicate mapping index ${entry.index}.`);
    keys.add(entry.key);
    indices.add(entry.index);
  }
  return entries;
}

function validateSubset(mapping: GridSemanticCell[], subset: readonly string[]): void {
  const requested = new Set<string>();
  for (const key of subset) {
    if (requested.has(key)) throw invalidOptions(`duplicate subset key "${key}".`);
    requested.add(key);
  }
  const byKey = new Map(mapping.map((entry) => [entry.key, entry]));
  for (const key of subset) {
    if (!byKey.has(key)) throw invalidOptions(`subset key "${key}" is not present in mapping.`);
  }
}

function normalizeCanvas(value: number | { width: number; height: number } | undefined): { width: number; height: number } {
  const result = typeof value === "number" ? { width: value, height: value } : value;
  if (!result || !Number.isInteger(result.width) || !Number.isInteger(result.height) || result.width < 1 || result.height < 1) {
    throw invalidOptions("normalize.canvasSize must contain positive integer dimensions.");
  }
  return result;
}

function normalizeQa(value: ExtractAssetsOptions["qa"]): ResolvedQa {
  const result: ResolvedQa = {
    alphaThreshold: value?.alphaThreshold ?? 16,
    minForegroundRatio: value?.minForegroundRatio ?? 0.005,
    maxForegroundRatio: value?.maxForegroundRatio ?? 0.8,
    maxEdgeTouchRatio: value?.maxEdgeTouchRatio ?? 0,
    maxSheetEdgeTouchRatio: value?.maxSheetEdgeTouchRatio ?? 0,
    residueMaxFraction: value?.residueMaxFraction ?? 0.001,
    residueEdgeDepthPx: value?.residueEdgeDepthPx ?? 2,
    requireFullCount: value?.requireFullCount ?? true,
    maxBodyScaleCv: value?.maxBodyScaleCv,
  };
  if (!Number.isInteger(result.alphaThreshold) || result.alphaThreshold < 1 || result.alphaThreshold > 255) {
    throw invalidOptions("qa.alphaThreshold must be an integer from 1 to 255.");
  }
  for (const key of ["minForegroundRatio", "maxForegroundRatio", "maxEdgeTouchRatio", "maxSheetEdgeTouchRatio", "residueMaxFraction"] as const) {
    const ratio = result[key];
    if (typeof ratio !== "number" || ratio < 0 || ratio > 1) {
      throw invalidOptions(`qa.${key} must be between 0 and 1.`);
    }
  }
  if (result.minForegroundRatio > result.maxForegroundRatio) {
    throw invalidOptions("minForegroundRatio cannot exceed maxForegroundRatio.");
  }
  if (!Number.isInteger(result.residueEdgeDepthPx) || result.residueEdgeDepthPx < 0 || result.residueEdgeDepthPx > 8) {
    throw invalidOptions("qa.residueEdgeDepthPx must be an integer from 0 to 8.");
  }
  return result;
}

// ── Matte resolution + §2 collision hard rules ─────────────────────────────

function resolveMatte(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  resolved: Resolved,
): MatteSelectResult {
  const eraseRadius = resolved.chroma.threshold ?? (resolved.pipeline === "v2" ? V2_HARD_THRESHOLD : V1_HARD_THRESHOLD);
  if (resolved.providedMatte) {
    const matte = resolved.providedMatte;
    const { minSubjectDistance, clearsEraseRadius } = measureMatteClearance(
      data, width, height, channels, matte, eraseRadius,
    );
    return {
      matte,
      source: "provided",
      score: 0,
      minSubjectDistance,
      clearsEraseRadius,
      eraseRadius,
      candidateScores: [{ matte, score: 0, minSubjectDistance, clearsEraseRadius }],
    };
  }
  return selectMatteColor(data, width, height, channels, {
    mode: resolved.matteSelect,
    eraseRadius,
    pipeline: resolved.pipeline,
  });
}

/**
 * §2 matte_subject_collision hard rules:
 * (1) subject-aware auto and final !clearsEraseRadius → hard fail;
 * (2) provided matte and minSubjectDistance < eraseRadius → hard fail;
 * corner auto → warnings only (legacy behavior), never a defect here.
 */
function matteCollisionDefect(matte: MatteSelectResult): ExtractDefect | null {
  if (matte.source === "provided" && !matte.clearsEraseRadius) {
    return {
      code: "matte_subject_collision",
      metric: matte.minSubjectDistance,
      detail:
        `provided matte is within erase radius of subject pixels ` +
        `(minSubjectDistance=${matte.minSubjectDistance.toFixed(1)} < eraseRadius=${matte.eraseRadius})`,
    };
  }
  if (matte.source === "auto-subject-aware" && !matte.clearsEraseRadius) {
    return {
      code: "matte_subject_collision",
      metric: matte.minSubjectDistance,
      detail:
        `subject-aware matte select found no candidate clearing the erase radius ` +
        `(minSubjectDistance=${matte.minSubjectDistance.toFixed(1)} < eraseRadius=${matte.eraseRadius})`,
    };
  }
  return null;
}

// ── Shared pixel helpers ───────────────────────────────────────────────────

type PreparedItem = { meta: MatteGridItem; png: Buffer };

type CellOutcome = {
  preparedByKey: Map<string, PreparedItem>;
  defects: ExtractDefect[];
  warnings: string[];
  chromaResidueRatio: number;
  sheetEdgeTouchRatio: number;
  /** Centroid assignments per cell index (chroma-grid/hybrid only) — feeds ML assist crops. */
  assignments?: GridCellAssignment[];
};

function copyCell(source: Buffer, sourceWidth: number, channels: number, cell: TileCell): Buffer {
  const output = Buffer.alloc(cell.w * cell.h * 4);
  for (let y = 0; y < cell.h; y++) {
    for (let x = 0; x < cell.w; x++) {
      const from = ((cell.y + y) * sourceWidth + cell.x + x) * channels;
      const to = (y * cell.w + x) * 4;
      output[to] = source[from];
      output[to + 1] = source[from + 1];
      output[to + 2] = source[from + 2];
      output[to + 3] = channels >= 4 ? source[from + 3] : 255;
    }
  }
  return output;
}

function copyRegion(source: Buffer, sourceWidth: number, region: { x: number; y: number; w: number; h: number }): Buffer {
  const output = Buffer.alloc(region.w * region.h * 4);
  for (let y = 0; y < region.h; y++) {
    const from = ((region.y + y) * sourceWidth + region.x) * 4;
    source.copy(output, y * region.w * 4, from, from + region.w * 4);
  }
  return output;
}

type AlphaAnalysis = {
  bounds?: { x: number; y: number; w: number; h: number };
  foregroundPixels: number;
  foregroundRatio: number;
  edgeTouchPixels: number;
  edgeTouchRatio: number;
};

function analyzeAlpha(data: Buffer, width: number, height: number, threshold: number): AlphaAnalysis {
  let x0 = width, y0 = height, x1 = -1, y1 = -1, foregroundPixels = 0, edgeTouchPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < threshold) continue;
      foregroundPixels++;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edgeTouchPixels++;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  const perimeterPixels = width === 1 || height === 1 ? width * height : width * 2 + height * 2 - 4;
  return {
    bounds: foregroundPixels > 0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : undefined,
    foregroundPixels,
    foregroundRatio: foregroundPixels / (width * height),
    edgeTouchPixels,
    edgeTouchRatio: edgeTouchPixels / perimeterPixels,
  };
}

/**
 * Soft seed-cell edge metric for chroma-grid (design §5a): foreground pixels
 * of the whole-sheet chroma output lying on the seed cell's perimeter lines.
 * Never a hard failure — overflow rescued by centroid assignment shows up here.
 */
function countSeedCellEdgeTouch(
  sheet: Buffer,
  sheetWidth: number,
  cell: TileCell,
  threshold: number,
): { count: number; ratio: number } {
  const at = (x: number, y: number): boolean => sheet[(y * sheetWidth + x) * 4 + 3] >= threshold;
  let count = 0;
  for (let x = cell.x; x < cell.x + cell.w; x++) {
    if (at(x, cell.y)) count++;
    if (cell.h > 1 && at(x, cell.y + cell.h - 1)) count++;
  }
  for (let y = cell.y + 1; y < cell.y + cell.h - 1; y++) {
    if (at(cell.x, y)) count++;
    if (cell.w > 1 && at(cell.x + cell.w - 1, y)) count++;
  }
  const perimeter = cell.w === 1 || cell.h === 1 ? cell.w * cell.h : cell.w * 2 + cell.h * 2 - 4;
  return { count, ratio: count / perimeter };
}

function formatRatio(value: number): string {
  return value.toFixed(4);
}

async function exists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

type SharpModule = Awaited<ReturnType<typeof loadSharp>>["default"];

/** Trim/normalize/encode one prepared item onto the configured canvas. */
async function normalizeAndEncode(
  sharp: SharpModule,
  cropped: Buffer,
  cropW: number,
  cropH: number,
  resolved: Resolved,
): Promise<{ png: Buffer; normalized: MatteGridItem["geometry"]["normalized"] }> {
  const innerW = resolved.canvas.width - resolved.padding * 2;
  const innerH = resolved.canvas.height - resolved.padding * 2;
  const resized = await sharp(cropped, {
    raw: { width: cropW, height: cropH, channels: 4 },
  }).resize(innerW, innerH, { fit: "inside", withoutEnlargement: false }).raw().toBuffer({ resolveWithObject: true });
  const x = Math.floor((resolved.canvas.width - resized.info.width) / 2);
  const y = resolved.align === "feet"
    ? resolved.canvas.height - resolved.padding - resized.info.height
    : Math.floor((resolved.canvas.height - resized.info.height) / 2);
  const canvasOpts = { create: { width: resolved.canvas.width, height: resolved.canvas.height, channels: 4 as const, background: { r: 0, g: 0, b: 0, alpha: 0 } } };
  const compositeOps = [{ input: resized.data, raw: { width: resized.info.width, height: resized.info.height, channels: 4 as const }, left: x, top: y }];
  const png = resolved.format === "webp"
    ? await sharp(canvasOpts).composite(compositeOps).webp({ quality: resolved.quality }).toBuffer()
    : await sharp(canvasOpts).composite(compositeOps).png().toBuffer();
  return {
    png,
    normalized: {
      x, y,
      w: resized.info.width,
      h: resized.info.height,
      canvasWidth: resolved.canvas.width,
      canvasHeight: resolved.canvas.height,
      padding: resolved.padding,
      align: resolved.align,
    },
  };
}

// ── equal-cell (Appendix C: per-cell chroma, legacy pixel path) ────────────

async function runEqualCellOutcome(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  resolved: Resolved,
  matte: MatteSelectResult,
  sharp: SharpModule,
): Promise<CellOutcome> {
  const grid = computeTileCells(width, height, resolved.rows, resolved.cols);
  const preparedByKey = new Map<string, PreparedItem>();
  const defects: ExtractDefect[] = [];
  let chromaResidueRatio = 0;

  const collision = matteCollisionDefect(matte);
  if (collision) defects.push(collision);

  for (const semantic of resolved.semanticCells) {
    const cell = grid.cells[semantic.index];
    const cellData = copyCell(data, width, channels, cell);
    // Per seed cell chroma (NOT whole-sheet) — the equal-cell invariant.
    const rgba = runChromaPipeline(cellData, cell.w, cell.h, 4, {
      pipeline: resolved.pipeline,
      matteColor: matte.matte,
      threshold: resolved.chroma.threshold,
      softness: resolved.chroma.softness,
      spillSuppression: resolved.chroma.spillSuppression,
      fringeThreshold: resolved.chroma.fringeThreshold,
      fringeDelta: resolved.chroma.fringeDelta,
      unmixReach: resolved.chroma.unmixReach,
      spillMaxFraction: resolved.chroma.spillMaxFraction,
      mode: resolved.chroma.mode,
    }).data;

    const analysis = analyzeAlpha(rgba, cell.w, cell.h, resolved.qa.alphaThreshold);
    const base = { key: semantic.key, index: semantic.index };
    // Legacy defect set and order: empty → ratio low → ratio high → edge touch.
    if (!analysis.bounds) defects.push({ ...base, code: "empty_cell", detail: "empty foreground" });
    if (analysis.foregroundRatio < resolved.qa.minForegroundRatio) {
      defects.push({
        ...base, code: "foreground_ratio_low", metric: analysis.foregroundRatio,
        detail: `foreground ratio ${formatRatio(analysis.foregroundRatio)} below ${formatRatio(resolved.qa.minForegroundRatio)}`,
      });
    }
    if (analysis.foregroundRatio > resolved.qa.maxForegroundRatio) {
      defects.push({
        ...base, code: "foreground_ratio_high", metric: analysis.foregroundRatio,
        detail: `foreground ratio ${formatRatio(analysis.foregroundRatio)} above ${formatRatio(resolved.qa.maxForegroundRatio)}`,
      });
    }
    if (analysis.edgeTouchRatio > resolved.qa.maxEdgeTouchRatio) {
      defects.push({
        ...base, code: "edge_touch", metric: analysis.edgeTouchRatio,
        detail: `edge touch ratio ${formatRatio(analysis.edgeTouchRatio)} above ${formatRatio(resolved.qa.maxEdgeTouchRatio)}`,
      });
    }

    // §2 chroma_residue on the per-cell chroma output.
    const residue = measureChromaResidue(rgba, cell.w, cell.h, matte.matte, {
      alphaThreshold: resolved.qa.alphaThreshold,
      fringeDelta: resolved.chroma.fringeDelta,
      edgeDepthPx: resolved.qa.residueEdgeDepthPx,
    });
    chromaResidueRatio = Math.max(chromaResidueRatio, residue.ratio);
    if (residue.ratio > resolved.qa.residueMaxFraction) {
      defects.push({
        ...base, code: "chroma_residue", metric: residue.ratio,
        detail:
          `chroma residue ratio ${formatRatio(residue.ratio)} above ${formatRatio(resolved.qa.residueMaxFraction)} ` +
          `(${residue.residuePixels} opaque key-tinted pixels within ${residue.edgeDepthPx}px of transparent regions)`,
      });
    }

    if (!analysis.bounds) continue;
    const trimmed = copyRegion(rgba, cell.w, analysis.bounds);
    const { png, normalized } = await normalizeAndEncode(sharp, trimmed, analysis.bounds.w, analysis.bounds.h, resolved);
    preparedByKey.set(semantic.key, {
      png,
      meta: {
        key: semantic.key,
        index: semantic.index,
        file: `${semantic.key}.${resolved.format}`,
        path: "", // filled at publish
        geometry: {
          cell,
          foreground: analysis.bounds,
          sourceBounds: { x: cell.x + analysis.bounds.x, y: cell.y + analysis.bounds.y, w: analysis.bounds.w, h: analysis.bounds.h },
          cropSize: { w: analysis.bounds.w, h: analysis.bounds.h },
          normalized,
        },
        qa: {
          foregroundPixels: analysis.foregroundPixels,
          foregroundRatio: analysis.foregroundRatio,
          edgeTouchPixels: analysis.edgeTouchPixels,
          edgeTouchRatio: analysis.edgeTouchRatio,
          alphaThreshold: resolved.qa.alphaThreshold,
        },
      },
    });
  }

  return { preparedByKey, defects, warnings: [], chromaResidueRatio, sheetEdgeTouchRatio: 0 };
}

// ── chroma-grid (Appendix C: whole-sheet chroma once + centroid geometry) ──

async function runChromaGridOutcome(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  resolved: Resolved,
  matte: MatteSelectResult,
  sharp: SharpModule,
): Promise<CellOutcome> {
  const preparedByKey = new Map<string, PreparedItem>();
  const defects: ExtractDefect[] = [];

  const collision = matteCollisionDefect(matte);
  if (collision) defects.push(collision);

  // Whole-sheet chroma ONCE (design §3 invariant), then geometry.
  const sheet = runChromaPipeline(data, width, height, channels, {
    pipeline: resolved.pipeline,
    matteColor: matte.matte,
    threshold: resolved.chroma.threshold,
    softness: resolved.chroma.softness,
    spillSuppression: resolved.chroma.spillSuppression,
    fringeThreshold: resolved.chroma.fringeThreshold,
    fringeDelta: resolved.chroma.fringeDelta,
    unmixReach: resolved.chroma.unmixReach,
    spillMaxFraction: resolved.chroma.spillMaxFraction,
    mode: resolved.chroma.mode,
  }).data;

  const geometry = computeCentroidGridGeometry(sheet, width, height, resolved.rows, resolved.cols, {
    alphaThreshold: resolved.geometry.alphaThreshold ?? 16,
    noiseMinAbs: resolved.geometry.noiseMinAbs,
    minBlobFraction: resolved.geometry.minBlobFraction,
    mergedSpanFactor: resolved.geometry.mergedSpanFactor,
    debrisFraction: resolved.geometry.debrisFraction,
    debrisBorderTolPx: resolved.geometry.debrisBorderTolPx,
    debrisPolicy: resolved.geometry.debrisPolicy, // grid-geometry applies the keep-with-owner default (PR7)
  });

  // §2 chroma_residue on the whole-sheet chroma output.
  const residue = measureChromaResidue(sheet, width, height, matte.matte, {
    alphaThreshold: resolved.qa.alphaThreshold,
    fringeDelta: resolved.chroma.fringeDelta,
    edgeDepthPx: resolved.qa.residueEdgeDepthPx,
  });
  if (residue.ratio > resolved.qa.residueMaxFraction) {
    defects.push({
      code: "chroma_residue", metric: residue.ratio,
      detail:
        `chroma residue ratio ${formatRatio(residue.ratio)} above ${formatRatio(resolved.qa.residueMaxFraction)} ` +
        `(${residue.residuePixels} opaque key-tinted pixels within ${residue.edgeDepthPx}px of transparent regions)`,
    });
  }

  let sheetEdgeTouchRatio = 0;
  for (const semantic of resolved.semanticCells) {
    const item = geometry.items[semantic.index];
    const base = { key: semantic.key, index: semantic.index };
    if (item.empty || !item.sourceBounds || !item.cropSize || !item.foreground) {
      defects.push({ ...base, code: "empty_cell", detail: "empty cell: no foreground survived component assignment and debris filtering" });
      continue;
    }

    const cropPixels = item.cropSize.w * item.cropSize.h;
    const foregroundRatio = item.foregroundPixels / cropPixels;
    if (foregroundRatio < resolved.qa.minForegroundRatio) {
      defects.push({
        ...base, code: "foreground_ratio_low", metric: foregroundRatio,
        detail: `foreground ratio ${formatRatio(foregroundRatio)} below ${formatRatio(resolved.qa.minForegroundRatio)}`,
      });
    }
    if (foregroundRatio > resolved.qa.maxForegroundRatio) {
      defects.push({
        ...base, code: "foreground_ratio_high", metric: foregroundRatio,
        detail: `foreground ratio ${formatRatio(foregroundRatio)} above ${formatRatio(resolved.qa.maxForegroundRatio)}`,
      });
    }

    // §5: hard gate = contact with the SHEET outer boundary (default 0).
    const perimeter = item.cropSize.w === 1 || item.cropSize.h === 1
      ? cropPixels
      : item.cropSize.w * 2 + item.cropSize.h * 2 - 4;
    const sheetRatio = item.sheetEdgeTouchPixels / perimeter;
    sheetEdgeTouchRatio = Math.max(sheetEdgeTouchRatio, sheetRatio);
    if (sheetRatio > resolved.qa.maxSheetEdgeTouchRatio) {
      defects.push({
        ...base, code: "sheet_edge_touch", metric: sheetRatio,
        detail:
          `sheet edge touch ratio ${formatRatio(sheetRatio)} above ${formatRatio(resolved.qa.maxSheetEdgeTouchRatio)} ` +
          `(${item.sheetEdgeTouchPixels} foreground pixels on the sheet outer boundary)`,
      });
    }

    // §5: seed-cell edge contact is a soft metric only.
    const seedEdge = countSeedCellEdgeTouch(sheet, width, item.cell, resolved.qa.alphaThreshold);

    const cropped = copyRegion(sheet, width, item.sourceBounds);
    const { png, normalized } = await normalizeAndEncode(sharp, cropped, item.cropSize.w, item.cropSize.h, resolved);
    preparedByKey.set(semantic.key, {
      png,
      meta: {
        key: semantic.key,
        index: semantic.index,
        file: `${semantic.key}.${resolved.format}`,
        path: "",
        geometry: {
          cell: item.cell,
          foreground: item.foreground,
          sourceBounds: item.sourceBounds,
          cropSize: item.cropSize,
          normalized,
        },
        qa: {
          foregroundPixels: item.foregroundPixels,
          foregroundRatio,
          edgeTouchPixels: seedEdge.count,
          edgeTouchRatio: seedEdge.ratio,
          alphaThreshold: resolved.qa.alphaThreshold,
          sheetEdgeTouchPixels: item.sheetEdgeTouchPixels,
          sheetEdgeTouchRatio: sheetRatio,
          componentCount: item.componentCount,
          splitFromMerged: item.splitFromMerged,
        },
      },
    });
  }

  return {
    preparedByKey,
    defects,
    warnings: [],
    chromaResidueRatio: residue.ratio,
    sheetEdgeTouchRatio,
    assignments: geometry.items,
  };
}

// ── ml-blobs (stickers path: whole-image ISNet + CC + blob count) ──────────

async function runMlBlobs(
  imagePath: string,
  outDir: string,
  resolved: Resolved,
): Promise<ExtractAssetsResult> {
  // Legacy PNG gate + max-dimension hard acceptance (§10).
  const { width, height } = await readPngSize(imagePath);
  assertMaxDimensions(width, height, resolved.maxDimension);

  const srcBuf = await fs.readFile(imagePath);
  let matted: { data: Buffer; width: number; height: number; channels: number };
  try {
    matted = await matteImage(srcBuf, "image/png", resolved.hybridModel);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ExtractError(`extractAssets: ML matting unavailable: ${detail}`, [
      { code: "ml_unavailable", detail },
    ]);
  }
  const { data: gridData, width: w, height: h, channels: gridChannels } = matted;

  const alpha = new Uint8Array(w * h);
  for (let p = 0, q = 3; p < alpha.length; p++, q += gridChannels) alpha[p] = gridData[q];
  const allBlobs = findConnectedComponents(alpha, w, h, ML_BLOB_ALPHA_THRESHOLD);
  // Stickers are sizable blobs; drop tiny noise (< 0.5% of canvas).
  const minBlobSize = Math.floor(w * h * 0.005);
  const stickerBlobs = allBlobs.filter((b) => b.size >= minBlobSize);

  const expected = resolved.rows * resolved.cols;
  if (stickerBlobs.length !== expected) {
    const blobDetail = stickerBlobs.slice(0, 8).map((b) => `(${b.x0},${b.y0})-${b.x1},${b.y1} ${b.size}px`).join("  ");
    const detail =
      `detected ${stickerBlobs.length} foreground regions but expected ${resolved.rows}×${resolved.cols}=${expected}. ` +
      `The grid is structurally irregular (overlapping stickers merge, holed stickers split). ` +
      `Regenerate the grid with cleaner separation, or adjust rows/cols. Top blobs: ${blobDetail}`;
    throw new ExtractError(`extractAssets: ${detail}`, [
      { code: "frame_count_mismatch", metric: stickerBlobs.length, detail },
    ]);
  }

  // Reading order: top-to-bottom by row, then left-to-right by col (legacy).
  stickerBlobs.sort((a, b) => a.cy - b.cy);
  const rowBand = Math.ceil(stickerBlobs.length / resolved.rows);
  const sorted: typeof stickerBlobs = [];
  for (let r = 0; r < resolved.rows; r++) {
    const band = stickerBlobs.slice(r * rowBand, Math.min((r + 1) * rowBand, stickerBlobs.length));
    band.sort((a, b) => a.cx - b.cx);
    sorted.push(...band);
  }

  // Matte report (informational only — ml-blobs runs no chroma).
  const sharp = (await loadSharp()).default;
  const raw = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const matte = selectMatteColor(raw.data, raw.info.width, raw.info.height, raw.info.channels, {
    mode: "corner",
    pipeline: "v1",
  });

  const grid = computeTileCells(w, h, resolved.rows, resolved.cols);
  const prepared: PreparedItem[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const blob = sorted[i];
    const bw = blob.x1 - blob.x0 + 1;
    const bh = blob.y1 - blob.y0 + 1;
    const cellBuf = copyRegion(gridData, w, { x: blob.x0, y: blob.y0, w: bw, h: bh });
    const key = `s${String(i).padStart(2, "0")}`;
    const png = await sharp(cellBuf, { raw: { width: bw, height: bh, channels: 4 } }).png().toBuffer();
    const cell = grid.cells[i];
    prepared.push({
      png,
      meta: {
        key,
        index: i,
        file: `${key}.png`,
        path: "",
        geometry: {
          cell,
          foreground: { x: blob.x0 - cell.x, y: blob.y0 - cell.y, w: bw, h: bh },
          sourceBounds: { x: blob.x0, y: blob.y0, w: bw, h: bh },
          cropSize: { w: bw, h: bh },
          normalized: { x: 0, y: 0, w: bw, h: bh, canvasWidth: bw, canvasHeight: bh, padding: 0, align: "center" },
        },
        qa: {
          foregroundPixels: blob.size,
          foregroundRatio: blob.size / (bw * bh),
          edgeTouchPixels: 0,
          edgeTouchRatio: 0,
          alphaThreshold: ML_BLOB_ALPHA_THRESHOLD,
        },
        centroid: { x: Math.round(blob.cx), y: Math.round(blob.cy) },
      },
    });
  }

  await publishPreparedItems(outDir, prepared, resolved.overwrite);
  const qa: ExtractQaReport = {
    ok: true,
    defects: [],
    matte,
    strategyUsed: "ml-blobs",
    pipeline: "v1",
  };
  return {
    sourceFile: path.basename(imagePath),
    rows: resolved.rows,
    cols: resolved.cols,
    items: prepared.map((item) => item.meta),
    qa,
    matteColor: matte.matte,
    matteColorSource: matte.source,
  };
}

// ── hybrid ML assist (design §7) ───────────────────────────────────────────

function mlCropRegion(
  mlCrop: Resolved["mlCrop"],
  cell: TileCell,
  dilateFraction: number,
  width: number,
  height: number,
  assignment: GridCellAssignment | undefined,
): { x: number; y: number; w: number; h: number } {
  if (mlCrop === "seed-cell") return { x: cell.x, y: cell.y, w: cell.w, h: cell.h };
  if (mlCrop === "source-bounds" && assignment && !assignment.empty && assignment.sourceBounds) {
    return assignment.sourceBounds;
  }
  // "dilated-seed" (default, and fallback for source-bounds without a crop).
  const dx = Math.round(cell.w * dilateFraction);
  const dy = Math.round(cell.h * dilateFraction);
  const x = Math.max(0, cell.x - dx);
  const y = Math.max(0, cell.y - dy);
  return {
    x, y,
    w: Math.min(width, cell.x + cell.w + dx) - x,
    h: Math.min(height, cell.y + cell.h + dy) - y,
  };
}

async function mlAssistCell(
  semantic: GridSemanticCell,
  cell: TileCell,
  assignment: GridCellAssignment | undefined,
  matted: { data: Buffer; width: number; height: number; channels: number },
  resolved: Resolved,
  sharp: SharpModule,
): Promise<{ prepared?: PreparedItem; defects: ExtractDefect[] }> {
  const { data, width, height, channels } = matted;
  const region = mlCropRegion(resolved.mlCrop, cell, resolved.dilateFraction, width, height, assignment);
  const base = { key: semantic.key, index: semantic.index };

  // Alpha analysis on the ML-matted crop region.
  let x0 = region.w, y0 = region.h, x1 = -1, y1 = -1, foregroundPixels = 0, sheetTouch = 0;
  for (let y = 0; y < region.h; y++) {
    for (let x = 0; x < region.w; x++) {
      const srcIdx = ((region.y + y) * width + region.x + x) * channels;
      if (data[srcIdx + 3] < resolved.qa.alphaThreshold) continue;
      foregroundPixels++;
      const absX = region.x + x;
      const absY = region.y + y;
      if (absX === 0 || absY === 0 || absX === width - 1 || absY === height - 1) sheetTouch++;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  if (foregroundPixels === 0) {
    return {
      defects: [{ ...base, code: "empty_cell", detail: `empty cell after ML assist (${resolved.mlCrop} crop)` }],
    };
  }
  const bounds = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const defects: ExtractDefect[] = [];
  const foregroundRatio = foregroundPixels / (bounds.w * bounds.h);
  if (foregroundRatio < resolved.qa.minForegroundRatio) {
    defects.push({
      ...base, code: "foreground_ratio_low", metric: foregroundRatio,
      detail: `foreground ratio ${formatRatio(foregroundRatio)} below ${formatRatio(resolved.qa.minForegroundRatio)} after ML assist`,
    });
  }
  if (foregroundRatio > resolved.qa.maxForegroundRatio) {
    defects.push({
      ...base, code: "foreground_ratio_high", metric: foregroundRatio,
      detail: `foreground ratio ${formatRatio(foregroundRatio)} above ${formatRatio(resolved.qa.maxForegroundRatio)} after ML assist`,
    });
  }
  const perimeter = bounds.w === 1 || bounds.h === 1 ? bounds.w * bounds.h : bounds.w * 2 + bounds.h * 2 - 4;
  const sheetRatio = sheetTouch / perimeter;
  if (sheetRatio > resolved.qa.maxSheetEdgeTouchRatio) {
    defects.push({
      ...base, code: "sheet_edge_touch", metric: sheetRatio,
      detail: `sheet edge touch ratio ${formatRatio(sheetRatio)} above ${formatRatio(resolved.qa.maxSheetEdgeTouchRatio)} after ML assist`,
    });
  }
  if (defects.length > 0) return { defects };

  const absBounds = { x: region.x + bounds.x, y: region.y + bounds.y, w: bounds.w, h: bounds.h };
  const cropped = copyRegion(data, width, absBounds);
  const { png, normalized } = await normalizeAndEncode(sharp, cropped, bounds.w, bounds.h, resolved);
  return {
    defects: [],
    prepared: {
      png,
      meta: {
        key: semantic.key,
        index: semantic.index,
        file: `${semantic.key}.${resolved.format}`,
        path: "",
        geometry: {
          cell,
          foreground: { x: absBounds.x - cell.x, y: absBounds.y - cell.y, w: bounds.w, h: bounds.h },
          sourceBounds: absBounds,
          cropSize: { w: bounds.w, h: bounds.h },
          normalized,
        },
        qa: {
          foregroundPixels,
          foregroundRatio,
          edgeTouchPixels: 0,
          edgeTouchRatio: 0,
          alphaThreshold: resolved.qa.alphaThreshold,
          sheetEdgeTouchPixels: sheetTouch,
          sheetEdgeTouchRatio: sheetRatio,
        },
      },
    },
  };
}

// ── QA report / defect helpers ─────────────────────────────────────────────

function formatDefect(defect: ExtractDefect): string {
  return defect.key !== undefined
    ? `${defect.key} (cell ${defect.index}): ${defect.detail}`
    : `${defect.code}: ${defect.detail}`;
}

function buildQaReport(
  matte: MatteSelectResult,
  strategyUsed: ExtractQaReport["strategyUsed"],
  pipeline: "v1" | "v2",
  defects: ExtractDefect[],
  metrics: { chromaResidueRatio?: number; sheetEdgeTouchRatio?: number },
  warnings: string[],
): ExtractQaReport {
  const allWarnings = [...(matte.warnings ?? []), ...warnings];
  return {
    ok: defects.length === 0,
    defects,
    matte,
    strategyUsed,
    pipeline,
    metrics: {
      ...(metrics.chromaResidueRatio !== undefined ? { chromaResidueRatio: metrics.chromaResidueRatio } : {}),
      ...(metrics.sheetEdgeTouchRatio !== undefined ? { sheetEdgeTouchRatio: metrics.sheetEdgeTouchRatio } : {}),
      ...(allWarnings.length > 0 ? { warnings: allWarnings } : {}),
    },
  };
}

/** Soft body-scale consistency check (qa.maxBodyScaleCv — never a hard fail). */
function bodyScaleWarnings(preparedByKey: Map<string, PreparedItem>, maxCv: number | undefined): string[] {
  if (maxCv === undefined) return [];
  const sizes = [...preparedByKey.values()].map((item) => item.meta.qa.foregroundPixels);
  if (sizes.length < 2) return [];
  const mean = sizes.reduce((sum, v) => sum + v, 0) / sizes.length;
  if (mean === 0) return [];
  const variance = sizes.reduce((sum, v) => sum + (v - mean) ** 2, 0) / sizes.length;
  const cv = Math.sqrt(variance) / mean;
  return cv > maxCv
    ? [`body scale coefficient of variation ${formatRatio(cv)} exceeds soft limit ${formatRatio(maxCv)}`]
    : [];
}

/**
 * Defect gating (design §9 subset semantics): full assignment + QA always
 * runs; defects on non-subset cells are demoted to warnings only when
 * qa.requireFullCount === false. Subset-cell defects are always hard.
 */
function partitionDefects(
  defects: ExtractDefect[],
  resolved: Resolved,
): { hard: ExtractDefect[]; warnings: string[] } {
  if (!resolved.subset || resolved.qa.requireFullCount) return { hard: defects, warnings: [] };
  const selected = new Set(resolved.subset);
  const hard: ExtractDefect[] = [];
  const warnings: string[] = [];
  for (const defect of defects) {
    if (defect.key !== undefined && !selected.has(defect.key)) {
      warnings.push(`non-subset cell suppressed (requireFullCount=false): ${formatDefect(defect)}`);
    } else {
      hard.push(defect);
    }
  }
  return { hard, warnings };
}

function publishSelection(resolved: Resolved, preparedByKey: Map<string, PreparedItem>): PreparedItem[] {
  const order = resolved.subset ?? resolved.semanticCells.map((cell) => cell.key);
  const prepared: PreparedItem[] = [];
  for (const key of order) {
    const item = preparedByKey.get(key);
    if (item) prepared.push(item);
  }
  return prepared;
}

// ── Atomic publish (staging rename + backup rollback) ──────────────────────

/**
 * Write the complete result beside the destination, then publish it with
 * directory renames. When replacing an existing result, keep a backup until
 * the staged directory is in place so a failed publish can restore the prior
 * complete set.
 */
async function publishPreparedItems(outDir: string, prepared: PreparedItem[], overwrite: boolean): Promise<void> {
  const destination = path.resolve(outDir);
  const parent = path.dirname(destination);
  const base = path.basename(destination);
  await fs.mkdir(parent, { recursive: true });
  const staging = await fs.mkdtemp(path.join(parent, `.${base}.tmp-`));
  const backup = path.join(parent, `.${base}.backup-${randomUUID()}`);
  let existingMoved = false;
  let stagingPublished = false;

  try {
    for (const item of prepared) {
      item.meta.path = path.join(destination, item.meta.file);
      await fs.writeFile(path.join(staging, item.meta.file), item.png);
    }

    if (await exists(destination)) {
      if (!overwrite) {
        throw new Error(`extractAssets: output directory already exists: ${outDir}. Pass overwrite=true to replace.`);
      }
      await fs.rename(destination, backup);
      existingMoved = true;
    }

    try {
      await fs.rename(staging, destination);
      stagingPublished = true;
    } catch (publishError) {
      if (existingMoved) {
        try {
          await fs.rename(backup, destination);
          existingMoved = false;
        } catch (rollbackError) {
          throw new AggregateError(
            [publishError, rollbackError],
            `extractAssets: publish failed and the previous output could not be restored from ${backup}`,
          );
        }
      }
      throw publishError;
    }

    if (existingMoved) {
      // The new directory is already live. Backup cleanup must not turn a
      // successful atomic replacement into a reported failure.
      await fs.rm(backup, { recursive: true, force: true }).catch(() => undefined);
      existingMoved = false;
    }
  } finally {
    if (!stagingPublished) await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ── Public entry ───────────────────────────────────────────────────────────

/**
 * Unified extraction entry (design §9). See module header for strategy
 * semantics. Throws ExtractError with structured defects on QA failure, and
 * plain Errors for I/O and decode failures.
 */
export async function extractAssets(
  imagePath: string,
  outDir: string,
  options: ExtractAssetsOptions,
): Promise<ExtractAssetsResult> {
  const resolved = resolveOptions(options);

  if ((await exists(outDir)) && !resolved.overwrite) {
    throw new Error(`extractAssets: output directory already exists: ${outDir}. Pass overwrite=true to replace.`);
  }

  if (resolved.strategy === "ml-blobs") {
    return runMlBlobs(imagePath, outDir, resolved);
  }

  const sharp = (await loadSharp()).default;
  const raw = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  assertMaxDimensions(info.width, info.height, resolved.maxDimension);

  const matte = resolveMatte(data, info.width, info.height, info.channels, resolved);

  const outcome = resolved.strategy === "equal-cell"
    ? await runEqualCellOutcome(data, info.width, info.height, info.channels, resolved, matte, sharp)
    : await runChromaGridOutcome(data, info.width, info.height, info.channels, resolved, matte, sharp);

  outcome.warnings.push(...bodyScaleWarnings(outcome.preparedByKey, resolved.qa.maxBodyScaleCv));

  let { hard, warnings } = partitionDefects(outcome.defects, resolved);
  warnings = [...outcome.warnings, ...warnings];
  let strategyUsed: ExtractQaReport["strategyUsed"] =
    resolved.strategy === "hybrid" ? "hybrid:chroma-grid" : resolved.strategy;

  // ── hybrid: chroma-grid QA failure → ML assist → re-QA (design §7) ──
  if (resolved.strategy === "hybrid" && hard.length > 0) {
    if (!hard.every((defect) => defect.index !== undefined)) {
      // Non-cell-scoped defects (matte collision, chroma residue) are not
      // recoverable by ML assist — fail with the chroma-grid report.
      const qa = buildQaReport(matte, "hybrid:chroma-grid", resolved.pipeline, hard, outcome, warnings);
      throw new ExtractError(
        `extractAssets: hybrid:chroma-grid QA failed:\n- ${hard.map(formatDefect).join("\n- ")}`,
        hard,
        qa,
      );
    }
    let matted: { data: Buffer; width: number; height: number; channels: number };
    try {
      matted = await matteImage(await fs.readFile(imagePath), "image/png", resolved.hybridModel);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const mlDefect: ExtractDefect = { code: "ml_unavailable", detail };
      const qa = buildQaReport(matte, "hybrid:chroma-grid", resolved.pipeline, [mlDefect, ...hard], outcome, warnings);
      throw new ExtractError(`extractAssets: hybrid ML fallback unavailable: ${detail}`, [mlDefect, ...hard], qa);
    }

    const grid = computeTileCells(info.width, info.height, resolved.rows, resolved.cols);
    const failedIndexes = [...new Set(hard.map((defect) => defect.index!))];
    const remaining: ExtractDefect[] = [];
    let recovered = 0;
    for (const index of failedIndexes) {
      const semantic = resolved.semanticCells.find((cell) => cell.index === index);
      if (!semantic) continue;
      const assignment = outcome.assignments?.[index];
      const assist = await mlAssistCell(semantic, grid.cells[index], assignment, matted, resolved, sharp);
      if (assist.prepared) {
        outcome.preparedByKey.set(semantic.key, assist.prepared);
        recovered++;
        warnings.push(`hybrid: cell ${index} (${semantic.key}) recovered via ML assist (${resolved.mlCrop} crop)`);
      } else {
        remaining.push(...assist.defects);
      }
    }
    hard = remaining;
    strategyUsed = recovered > 0 ? "hybrid:ml-cell" : "hybrid:chroma-grid";
  }

  if (hard.length > 0) {
    const qa = buildQaReport(matte, strategyUsed, resolved.pipeline, hard, outcome, warnings);
    throw new ExtractError(
      `extractAssets: ${strategyUsed} QA failed:\n- ${hard.map(formatDefect).join("\n- ")}`,
      hard,
      qa,
    );
  }

  const prepared = publishSelection(resolved, outcome.preparedByKey);
  await publishPreparedItems(outDir, prepared, resolved.overwrite);

  const qa = buildQaReport(matte, strategyUsed, resolved.pipeline, [], outcome, warnings);
  return {
    sourceFile: path.basename(imagePath),
    rows: resolved.rows,
    cols: resolved.cols,
    items: prepared.map((item) => item.meta),
    qa,
    matteColor: matte.matte,
    matteColorSource: matte.source,
  };
}

import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  estimateMatteColor,
  extractChromaKey,
  type ChromaKeyOptions,
  type MatteColor,
} from "./chroma-key.js";
import { loadImglySharp } from "./imgly.js";
import { computeTileCells, type TileCell } from "./slicing.js";

export type GridSemanticCell = { key: string; index: number };
export type GridSemanticMapping =
  | Readonly<Record<string, number>>
  | readonly string[]
  | readonly GridSemanticCell[];

export type MatteGridQaOptions = {
  /** Alpha value at or above which a pixel is foreground. Default 16. */
  alphaThreshold?: number;
  /** Minimum foreground pixels / cell pixels. Default 0.005. */
  minForegroundRatio?: number;
  /** Maximum foreground pixels / cell pixels. Default 0.8. */
  maxForegroundRatio?: number;
  /** Maximum foreground pixels / perimeter pixels. Default 0 (no edge contact). */
  maxEdgeTouchRatio?: number;
};

export type ExtractMatteGridOptions = {
  rows: number;
  cols: number;
  /** Semantic key → row-major cell. A string array maps each key to its own index. */
  mapping: GridSemanticMapping;
  /** Extract only these semantic keys. Omit to extract the full mapping. */
  subset?: readonly string[];
  /** Matte auto-sampling or explicit RGB, plus deterministic chroma parameters. */
  chroma?: ChromaKeyOptions;
  normalize: {
    /** Square number or explicit output dimensions. */
    canvasSize: number | { width: number; height: number };
    /** Transparent inset around normalized foreground. Default 0. */
    padding?: number;
  };
  qa?: MatteGridQaOptions;
  /** Output format. Default: "png" (lossless alpha). "webp" yields lossy-but-smaller transparent cells. */
  format?: "png" | "webp";
  /** Quality 1-100 when format is "webp". Default: 80. Ignored for "png". */
  quality?: number;
  /** Replace an existing output directory. Default false. */
  overwrite?: boolean;
};

export type MatteGridItem = {
  key: string;
  index: number;
  file: string;
  path: string;
  geometry: {
    cell: TileCell;
    /** Foreground bounds relative to the equal-size source cell. */
    foreground: { x: number; y: number; w: number; h: number };
    /** Foreground placement on the normalized transparent canvas. */
    normalized: { x: number; y: number; w: number; h: number; canvasWidth: number; canvasHeight: number; padding: number };
  };
  qa: {
    foregroundPixels: number;
    foregroundRatio: number;
    edgeTouchPixels: number;
    edgeTouchRatio: number;
    alphaThreshold: number;
  };
};

export type ExtractMatteGridResult = {
  sourceFile: string;
  rows: number;
  cols: number;
  matteColor: MatteColor;
  matteColorSource: "provided" | "auto-sampled";
  items: MatteGridItem[];
};

type PreparedItem = { meta: MatteGridItem; png: Buffer };

/**
 * Deterministically extract named transparent assets from a uniform-matte grid.
 * Pipeline: equal cells → chroma key → alpha QA → trim → normalized canvas → PNG/WebP.
 * Output format defaults to PNG (lossless alpha); pass `format: "webp"` for smaller lossy cells.
 * This function has no network, ML, starter, or `.repochan/` knowledge.
 */
export async function extractMatteGrid(
  imagePath: string,
  outDir: string,
  options: ExtractMatteGridOptions,
): Promise<ExtractMatteGridResult> {
  const { rows, cols } = options;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error(`extractMatteGrid: rows and cols must be positive integers (got rows=${rows}, cols=${cols}).`);
  }
  const semanticCells = normalizeMapping(options.mapping, rows * cols);
  const selected = selectMapping(semanticCells, options.subset);
  const canvas = normalizeCanvas(options.normalize?.canvasSize);
  const padding = options.normalize?.padding ?? 0;
  if (!Number.isInteger(padding) || padding < 0 || padding * 2 >= canvas.width || padding * 2 >= canvas.height) {
    throw new Error(`extractMatteGrid: padding must be a non-negative integer smaller than half the canvas (got ${padding}).`);
  }
  const qa = normalizeQa(options.qa);
  if ((await exists(outDir)) && !options.overwrite) {
    throw new Error(`extractMatteGrid: output directory already exists: ${outDir}. Pass overwrite=true to replace.`);
  }

  const sharp = (await loadImglySharp()).default;
  const raw = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const grid = computeTileCells(info.width, info.height, rows, cols);
  const providedMatte = options.chroma?.matteColor;
  const matte: MatteColor = providedMatte && providedMatte !== "auto"
    ? providedMatte
    : estimateMatteColor(data, info.width, info.height, info.channels);
  const matteColorSource = providedMatte && providedMatte !== "auto" ? "provided" : "auto-sampled";
  const failures: string[] = [];
  const prepared: PreparedItem[] = [];

  for (const semantic of selected) {
    const cell = grid.cells[semantic.index];
    const cellData = copyCell(data, info.width, info.channels, cell);
    const rgba = extractChromaKey(
      cellData,
      cell.w,
      cell.h,
      4,
      matte,
      options.chroma?.threshold,
      options.chroma?.softness,
      options.chroma?.spillSuppression,
    );
    const analysis = analyzeAlpha(rgba, cell.w, cell.h, qa.alphaThreshold);
    const prefix = `${semantic.key} (cell ${semantic.index})`;
    if (!analysis.bounds) failures.push(`${prefix}: empty foreground`);
    if (analysis.foregroundRatio < qa.minForegroundRatio) {
      failures.push(`${prefix}: foreground ratio ${formatRatio(analysis.foregroundRatio)} below ${formatRatio(qa.minForegroundRatio)}`);
    }
    if (analysis.foregroundRatio > qa.maxForegroundRatio) {
      failures.push(`${prefix}: foreground ratio ${formatRatio(analysis.foregroundRatio)} above ${formatRatio(qa.maxForegroundRatio)}`);
    }
    if (analysis.edgeTouchRatio > qa.maxEdgeTouchRatio) {
      failures.push(`${prefix}: edge touch ratio ${formatRatio(analysis.edgeTouchRatio)} above ${formatRatio(qa.maxEdgeTouchRatio)}`);
    }
    if (!analysis.bounds) continue;

    const trimmed = copyRegion(rgba, cell.w, analysis.bounds);
    const innerW = canvas.width - padding * 2;
    const innerH = canvas.height - padding * 2;
    const resized = await sharp(trimmed, {
      raw: { width: analysis.bounds.w, height: analysis.bounds.h, channels: 4 },
    }).resize(innerW, innerH, { fit: "inside", withoutEnlargement: false }).raw().toBuffer({ resolveWithObject: true });
    const x = Math.floor((canvas.width - resized.info.width) / 2);
    const y = Math.floor((canvas.height - resized.info.height) / 2);
    const format = options.format ?? "png";
    const canvasOpts = { create: { width: canvas.width, height: canvas.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } };
    const compositeOps = [{ input: resized.data, raw: { width: resized.info.width, height: resized.info.height, channels: 4 }, left: x, top: y }];
    const png = format === "webp"
      ? await sharp(canvasOpts).composite(compositeOps).webp({ quality: options.quality ?? 80 }).toBuffer()
      : await sharp(canvasOpts).composite(compositeOps).png().toBuffer();
    const file = `${semantic.key}.${format}`;
    prepared.push({
      png,
      meta: {
        key: semantic.key,
        index: semantic.index,
        file,
        path: path.join(outDir, file),
        geometry: {
          cell,
          foreground: analysis.bounds,
          normalized: { x, y, w: resized.info.width, h: resized.info.height, canvasWidth: canvas.width, canvasHeight: canvas.height, padding },
        },
        qa: {
          foregroundPixels: analysis.foregroundPixels,
          foregroundRatio: analysis.foregroundRatio,
          edgeTouchPixels: analysis.edgeTouchPixels,
          edgeTouchRatio: analysis.edgeTouchRatio,
          alphaThreshold: qa.alphaThreshold,
        },
      },
    });
  }

  if (failures.length > 0) {
    throw new Error(`extractMatteGrid: alpha QA failed:\n- ${failures.join("\n- ")}`);
  }
  await publishPreparedItems(outDir, prepared, options.overwrite ?? false);

  return {
    sourceFile: path.basename(imagePath),
    rows,
    cols,
    matteColor: matte,
    matteColorSource,
    items: prepared.map((item) => item.meta),
  };
}

/**
 * Write the complete result beside the destination, then publish it with directory
 * renames. When replacing an existing result, keep a backup until the staged
 * directory is in place so a failed publish can restore the prior complete set.
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
      await fs.writeFile(path.join(staging, item.meta.file), item.png);
    }

    if (await exists(destination)) {
      if (!overwrite) {
        throw new Error(`extractMatteGrid: output directory already exists: ${outDir}. Pass overwrite=true to replace.`);
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
            `extractMatteGrid: publish failed and the previous output could not be restored from ${backup}`,
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

function normalizeMapping(mapping: GridSemanticMapping, cellCount: number): GridSemanticCell[] {
  if (!mapping || (Array.isArray(mapping) && mapping.length === 0)) {
    throw new Error("extractMatteGrid: mapping must contain at least one semantic cell.");
  }
  let entries: GridSemanticCell[];
  if (Array.isArray(mapping)) {
    entries = mapping.map((value, index) => typeof value === "string" ? { key: value, index } : value);
  } else {
    entries = Object.entries(mapping).map(([key, index]) => ({ key, index }));
  }
  const keys = new Set<string>();
  const indices = new Set<number>();
  for (const entry of entries) {
    if (!entry || typeof entry.key !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.key)) {
      throw new Error(`extractMatteGrid: invalid semantic key "${entry?.key ?? ""}"; use lowercase kebab-case.`);
    }
    if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= cellCount) {
      throw new Error(`extractMatteGrid: mapping index ${entry.index} for "${entry.key}" is outside 0..${cellCount - 1}.`);
    }
    if (keys.has(entry.key)) throw new Error(`extractMatteGrid: duplicate semantic key "${entry.key}".`);
    if (indices.has(entry.index)) throw new Error(`extractMatteGrid: duplicate mapping index ${entry.index}.`);
    keys.add(entry.key);
    indices.add(entry.index);
  }
  return entries;
}

function selectMapping(mapping: GridSemanticCell[], subset?: readonly string[]): GridSemanticCell[] {
  if (!subset) return mapping;
  const requested = new Set<string>();
  for (const key of subset) {
    if (requested.has(key)) throw new Error(`extractMatteGrid: duplicate subset key "${key}".`);
    requested.add(key);
  }
  const byKey = new Map(mapping.map((entry) => [entry.key, entry]));
  return subset.map((key) => {
    const entry = byKey.get(key);
    if (!entry) throw new Error(`extractMatteGrid: subset key "${key}" is not present in mapping.`);
    return entry;
  });
}

function normalizeCanvas(value: ExtractMatteGridOptions["normalize"]["canvasSize"]): { width: number; height: number } {
  const result = typeof value === "number" ? { width: value, height: value } : value;
  if (!result || !Number.isInteger(result.width) || !Number.isInteger(result.height) || result.width < 1 || result.height < 1) {
    throw new Error("extractMatteGrid: normalize.canvasSize must contain positive integer dimensions.");
  }
  return result;
}

function normalizeQa(value: MatteGridQaOptions | undefined): Required<MatteGridQaOptions> {
  const result = {
    alphaThreshold: value?.alphaThreshold ?? 16,
    minForegroundRatio: value?.minForegroundRatio ?? 0.005,
    maxForegroundRatio: value?.maxForegroundRatio ?? 0.8,
    maxEdgeTouchRatio: value?.maxEdgeTouchRatio ?? 0,
  };
  if (!Number.isInteger(result.alphaThreshold) || result.alphaThreshold < 1 || result.alphaThreshold > 255) {
    throw new Error("extractMatteGrid: qa.alphaThreshold must be an integer from 1 to 255.");
  }
  for (const [key, ratio] of Object.entries(result).filter(([key]) => key !== "alphaThreshold")) {
    if (typeof ratio !== "number" || ratio < 0 || ratio > 1) throw new Error(`extractMatteGrid: qa.${key} must be between 0 and 1.`);
  }
  if (result.minForegroundRatio > result.maxForegroundRatio) {
    throw new Error("extractMatteGrid: minForegroundRatio cannot exceed maxForegroundRatio.");
  }
  return result;
}

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

function analyzeAlpha(data: Buffer, width: number, height: number, threshold: number): {
  bounds?: { x: number; y: number; w: number; h: number };
  foregroundPixels: number;
  foregroundRatio: number;
  edgeTouchPixels: number;
  edgeTouchRatio: number;
} {
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

function formatRatio(value: number): string {
  return value.toFixed(4);
}

async function exists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

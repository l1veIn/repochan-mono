import { findConnectedComponents } from "./connected-components.js";
import { computeTileCells, type TileCell } from "./slicing.js";

// ---------------------------------------------------------------------------
// Centroid-components grid geometry (design: cutout-slice-stability.md §4/§6)
//
// Pure geometry over an RGBA buffer: alpha mask → 4-connected CC → noise
// drop → centroid-to-seed-cell assignment → merged-span split + in-cell
// relabel → debris handling → union bbox per cell. No chroma, no IO, no
// normalize — those stay with the caller (PR3 extract pipeline).
//
// The initial CC pass reuses the exported `findConnectedComponents`
// (4-connected flood fill, same as the stickers path). Pixel-level membership
// is recovered lazily by `recoverComponentPixels` only for components that
// need it (merged-span splits and sheet-border-touching components), because
// `findConnectedComponents` exposes aggregate stats but no per-pixel labels.
// ---------------------------------------------------------------------------

/** Pinned defaults from the design doc (§4 常数表). Overridable per call, but these values are the normative baseline. */
export const CENTROID_GRID_DEFAULTS = {
  /** Alpha value at or above which a pixel is foreground (chroma path). */
  alphaThreshold: 16,
  /** Absolute lower bound for a surviving component, in pixels. */
  noiseMinAbs: 60,
  /**
   * Relative lower bound, computed against the average SEED-CELL area
   * (rows×cols split of the sheet), not the whole sheet:
   * minBlob = max(noiseMinAbs, floor(cellArea*minBlobFraction)).
   * (PR7 fix: a whole-sheet fraction made the floor ~5k px on a 1024² 3×3
   * sheet and ate small floating decorations of 100–500 px.)
   */
  minBlobFraction: 0.005,
  /** Component bbox span beyond this multiple of the cell size → split at grid lines. */
  mergedSpanFactor: 1.5,
  /** Border-touching component smaller than this fraction of the cell's main component → debris. */
  debrisFraction: 0.3,
  /** A component whose bbox sits closer than this to a seed-cell edge counts as border-touching. */
  debrisBorderTolPx: 2,
  /**
   * "keep-with-owner" (default since PR7) unions border debris into the owner's
   * bbox — sticker sheets hug decorations to cell edges on purpose; "drop"
   * discards border debris (explicit opt-out).
   */
  debrisPolicy: "keep-with-owner",
} as const;

export type CentroidGridGeometryOptions = {
  alphaThreshold?: number;
  noiseMinAbs?: number;
  minBlobFraction?: number;
  mergedSpanFactor?: number;
  debrisFraction?: number;
  debrisBorderTolPx?: number;
  debrisPolicy?: "drop" | "keep-with-owner";
};

export type GridCellAssignment = {
  /** Row-major cell index, 0-based. */
  index: number;
  /** Seed equal-cell rect in source image coordinates. */
  cell: TileCell;
  /** True when no foreground survived in this cell (design §4 step 6 → empty_cell). */
  empty: boolean;
  /**
   * Foreground bbox relative to the seed cell origin. May be negative or
   * exceed the cell size when overflow into a neighbour cell is kept.
   * Null when empty.
   */
  foreground: { x: number; y: number; w: number; h: number } | null;
  /** Absolute foreground bbox in full source image coordinates. Null when empty. */
  sourceBounds: { x: number; y: number; w: number; h: number } | null;
  /** Isolation crop canvas size before normalize (= sourceBounds size). Null when empty. */
  cropSize: { w: number; h: number } | null;
  /** Total kept foreground pixels assigned to this cell. */
  foregroundPixels: number;
  /** Kept foreground pixels of this cell that touch the outer sheet boundary (QA: sheet_edge_touch). */
  sheetEdgeTouchPixels: number;
  /** Number of kept components unioned into this cell (main + non-border effects). */
  componentCount: number;
  /** True when a merged-span split contributed at least one piece to this cell. */
  splitFromMerged: boolean;
};

export type CentroidGridGeometryResult = {
  width: number;
  height: number;
  rows: number;
  cols: number;
  /** Effective noise floor: max(noiseMinAbs, floor(cellArea*minBlobFraction)) where cellArea = width*height/(rows*cols). */
  minBlobPixels: number;
  /** One assignment per seed cell, row-major, length rows*cols. */
  items: GridCellAssignment[];
  /** Total kept foreground pixels touching the outer sheet boundary. */
  sheetEdgeTouchPixels: number;
};

type Component = {
  x0: number; y0: number; x1: number; y1: number;
  cx: number; cy: number; size: number;
  /** Pixel indices (y*width+x), populated lazily for split / border counting. */
  pixels?: number[];
};

type ResolvedOptions = Required<CentroidGridGeometryOptions>;

function resolveOptions(options?: CentroidGridGeometryOptions): ResolvedOptions {
  const resolved: ResolvedOptions = {
    alphaThreshold: options?.alphaThreshold ?? CENTROID_GRID_DEFAULTS.alphaThreshold,
    noiseMinAbs: options?.noiseMinAbs ?? CENTROID_GRID_DEFAULTS.noiseMinAbs,
    minBlobFraction: options?.minBlobFraction ?? CENTROID_GRID_DEFAULTS.minBlobFraction,
    mergedSpanFactor: options?.mergedSpanFactor ?? CENTROID_GRID_DEFAULTS.mergedSpanFactor,
    debrisFraction: options?.debrisFraction ?? CENTROID_GRID_DEFAULTS.debrisFraction,
    debrisBorderTolPx: options?.debrisBorderTolPx ?? CENTROID_GRID_DEFAULTS.debrisBorderTolPx,
    debrisPolicy: options?.debrisPolicy ?? CENTROID_GRID_DEFAULTS.debrisPolicy,
  };
  if (!Number.isInteger(resolved.alphaThreshold) || resolved.alphaThreshold < 1 || resolved.alphaThreshold > 255) {
    throw new Error(`grid-geometry: alphaThreshold must be an integer from 1 to 255 (got ${resolved.alphaThreshold}).`);
  }
  if (!Number.isInteger(resolved.noiseMinAbs) || resolved.noiseMinAbs < 0) {
    throw new Error(`grid-geometry: noiseMinAbs must be a non-negative integer (got ${resolved.noiseMinAbs}).`);
  }
  if (resolved.minBlobFraction < 0 || resolved.minBlobFraction > 1) {
    throw new Error(`grid-geometry: minBlobFraction must be between 0 and 1 (got ${resolved.minBlobFraction}).`);
  }
  if (resolved.mergedSpanFactor < 1) {
    throw new Error(`grid-geometry: mergedSpanFactor must be >= 1 (got ${resolved.mergedSpanFactor}).`);
  }
  if (resolved.debrisFraction < 0 || resolved.debrisFraction > 1) {
    throw new Error(`grid-geometry: debrisFraction must be between 0 and 1 (got ${resolved.debrisFraction}).`);
  }
  if (!Number.isInteger(resolved.debrisBorderTolPx) || resolved.debrisBorderTolPx < 0) {
    throw new Error(`grid-geometry: debrisBorderTolPx must be a non-negative integer (got ${resolved.debrisBorderTolPx}).`);
  }
  return resolved;
}

/**
 * Assign foreground components of a whole-sheet RGBA buffer to the cells of a
 * rows×cols seed grid, following design §4:
 *
 *   1. Alpha mask (alpha >= alphaThreshold) over the full image.
 *   2. 4-connected components (reuses findConnectedComponents).
 *   3. Drop noise: size < max(noiseMinAbs, floor(cellArea*minBlobFraction))
 *      where cellArea = W*H/(rows*cols).
 *   4. Assign each component to the seed cell holding its centroid.
 *      Components whose bbox spans > mergedSpanFactor × cell size are treated
 *      as merged neighbours: their pixels are cut at the grid lines and
 *      relabelled per cell (in-cell relabel), each piece landing in the cell
 *      that contains it. (Design order is assign-then-split; splitting first
 *      is equivalent because every piece lies entirely inside one cell, so
 *      its centroid cell is that cell.)
 *   5. Debris: within a cell, a non-main component whose bbox sits within
 *      debrisBorderTolPx of the seed cell edge and whose size is below
 *      debrisFraction of the main component is unioned into the owner
 *      (default since PR7, debrisPolicy "keep-with-owner") or dropped
 *      (debrisPolicy "drop"). Non-border pieces (effects) always union with
 *      the main bbox.
 *   6. Cells with no kept foreground are flagged empty.
 *   7. (Caller-side: normalize — out of scope for this module.)
 *
 * Pure and synchronous: no chroma, no filesystem, no sharp.
 */
export function computeCentroidGridGeometry(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  rows: number,
  cols: number,
  options?: CentroidGridGeometryOptions,
): CentroidGridGeometryResult {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`grid-geometry: width and height must be positive integers (got ${width}x${height}).`);
  }
  if (data.length !== width * height * 4) {
    throw new Error(`grid-geometry: expected an RGBA buffer of ${width * height * 4} bytes, got ${data.length}.`);
  }
  const opts = resolveOptions(options);
  const grid = computeTileCells(width, height, rows, cols);

  // Step 1+2: alpha mask → 4-connected components (reused implementation).
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  // Noise floor is relative to the average seed-cell area (PR7), so small
  // floating decorations survive on large sheets; noiseMinAbs stays the
  // absolute lower bound.
  const cellArea = Math.floor((width * height) / (rows * cols));
  const minBlobPixels = Math.max(opts.noiseMinAbs, Math.floor(cellArea * opts.minBlobFraction));

  // Step 3: noise drop.
  const survivors = findConnectedComponents(alpha, width, height, opts.alphaThreshold)
    .filter((blob) => blob.size >= minBlobPixels);

  // Step 4: centroid assignment, with merged-span split + in-cell relabel.
  const perCell: Component[][] = grid.cells.map(() => []);
  for (const blob of survivors) {
    const spanW = blob.x1 - blob.x0 + 1;
    const spanH = blob.y1 - blob.y0 + 1;
    const merged = spanW > opts.mergedSpanFactor * grid.cellW || spanH > opts.mergedSpanFactor * grid.cellH;
    if (merged) {
      const pixels = recoverComponentPixels(alpha, width, height, blob, opts.alphaThreshold);
      for (const piece of splitAtGridLines(pixels, width, grid.cells)) {
        perCell[piece.cellIndex].push(piece.component);
      }
    } else {
      const col = Math.min(cols - 1, Math.max(0, Math.floor(blob.cx / grid.cellW)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(blob.cy / grid.cellH)));
      perCell[row * cols + col].push(blob);
    }
  }

  // Steps 5+6: debris handling, union bbox, empty detection, sheet-edge count.
  const items: GridCellAssignment[] = [];
  let totalSheetEdgeTouch = 0;
  for (let index = 0; index < grid.cells.length; index++) {
    const cell = grid.cells[index];
    const parts = perCell[index];
    // Split pieces always carry exact pixels; plain components never do.
    const splitFromMerged = parts.some((part) => part.pixels !== undefined);
    if (parts.length === 0) {
      items.push({
        index, cell, empty: true,
        foreground: null, sourceBounds: null, cropSize: null,
        foregroundPixels: 0, sheetEdgeTouchPixels: 0,
        componentCount: 0, splitFromMerged: false,
      });
      continue;
    }

    const main = parts.reduce((a, b) => (b.size > a.size ? b : a));
    const kept: Component[] = [];
    for (const part of parts) {
      if (part !== main && isBorderDebris(part, cell, main, opts)) {
        if (opts.debrisPolicy === "drop") continue;
      }
      kept.push(part);
    }

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, pixels = 0, edgeTouch = 0;
    for (const part of kept) {
      x0 = Math.min(x0, part.x0); y0 = Math.min(y0, part.y0);
      x1 = Math.max(x1, part.x1); y1 = Math.max(y1, part.y1);
      pixels += part.size;
      edgeTouch += countSheetEdgePixels(alpha, width, height, part, opts.alphaThreshold);
    }
    const sourceBounds = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    totalSheetEdgeTouch += edgeTouch;
    items.push({
      index, cell, empty: false,
      foreground: { x: x0 - cell.x, y: y0 - cell.y, w: sourceBounds.w, h: sourceBounds.h },
      sourceBounds,
      cropSize: { w: sourceBounds.w, h: sourceBounds.h },
      foregroundPixels: pixels,
      sheetEdgeTouchPixels: edgeTouch,
      componentCount: kept.length,
      splitFromMerged,
    });
  }

  return { width, height, rows, cols, minBlobPixels, items, sheetEdgeTouchPixels: totalSheetEdgeTouch };
}

/** A non-main component is debris when it hugs the seed cell edge and is small relative to the main component. */
function isBorderDebris(part: Component, cell: TileCell, main: Component, opts: ResolvedOptions): boolean {
  const nearEdge =
    part.x0 - cell.x < opts.debrisBorderTolPx ||
    part.y0 - cell.y < opts.debrisBorderTolPx ||
    cell.x + cell.w - 1 - part.x1 < opts.debrisBorderTolPx ||
    cell.y + cell.h - 1 - part.y1 < opts.debrisBorderTolPx;
  return nearEdge && part.size < opts.debrisFraction * main.size;
}

/**
 * Recover the exact pixel indices of a component reported by
 * findConnectedComponents (which exposes only aggregate stats). Flood-fills
 * 4-connected from candidate seed pixels inside the component bbox until the
 * filled region matches the component's size AND bbox — that pair uniquely
 * identifies the component even when another component's bbox overlaps it.
 */
function recoverComponentPixels(
  alpha: Uint8Array,
  width: number,
  height: number,
  target: { x0: number; y0: number; x1: number; y1: number; size: number },
  threshold: number,
): number[] {
  const tried = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let y = target.y0; y <= target.y1; y++) {
    for (let x = target.x0; x <= target.x1; x++) {
      const seed = y * width + x;
      if (tried[seed] || alpha[seed] < threshold) continue;
      // Flood fill 4-connected over the same thresholded mask the CC pass
      // used, so the fill stays inside exactly one component.
      const pixels: number[] = [];
      stack.length = 0;
      stack.push(seed);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      while (stack.length) {
        const p = stack.pop()!;
        if (tried[p] || alpha[p] < threshold) continue;
        tried[p] = 1;
        pixels.push(p);
        const px = p % width, py = (p / width) | 0;
        if (px < x0) x0 = px; if (py < y0) y0 = py;
        if (px > x1) x1 = px; if (py > y1) y1 = py;
        if (px > 0) stack.push(p - 1);
        if (px < width - 1) stack.push(p + 1);
        if (py > 0) stack.push(p - width);
        if (py < height - 1) stack.push(p + width);
      }
      if (pixels.length === target.size && x0 === target.x0 && y0 === target.y0 && x1 === target.x1 && y1 === target.y1) {
        return pixels;
      }
      // Wrong component (overlapping bbox): its pixels are now marked tried,
      // so the scan continues with the next untouched foreground pixel.
    }
  }
  throw new Error("grid-geometry: failed to recover component pixels (size/bbox match not found).");
}

/**
 * Split a merged component's pixels at the grid lines and relabel each cell's
 * subset 4-connected (design §4 step 4: "在格界劈开并格内 relabel"). Every
 * resulting piece lies entirely inside its cell, so the piece's cell is its
 * assignment; no second centroid pass is needed.
 */
function splitAtGridLines(
  pixels: number[],
  width: number,
  cells: TileCell[],
): Array<{ cellIndex: number; component: Component }> {
  // Group pixel indices by cell index.
  const byCell = new Map<number, number[]>();
  for (const p of pixels) {
    const x = p % width, y = (p / width) | 0;
    let cellIndex = -1;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) { cellIndex = i; break; }
    }
    if (cellIndex === -1) continue; // gutter pixel (right/bottom remainder) — unowned
    const bucket = byCell.get(cellIndex);
    if (bucket) bucket.push(p); else byCell.set(cellIndex, [p]);
  }

  const pieces: Array<{ cellIndex: number; component: Component }> = [];
  const stack: number[] = [];
  for (const [cellIndex, cellPixels] of byCell) {
    const inSubset = new Set(cellPixels);
    const visited = new Set<number>();
    for (const start of cellPixels) {
      if (visited.has(start)) continue;
      // In-cell relabel: 4-connected BFS restricted to this cell's subset.
      const piecePixels: number[] = [];
      stack.length = 0;
      stack.push(start);
      visited.add(start);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, sumX = 0, sumY = 0;
      while (stack.length) {
        const p = stack.pop()!;
        piecePixels.push(p);
        const px = p % width, py = (p / width) | 0;
        sumX += px; sumY += py;
        if (px < x0) x0 = px; if (py < y0) y0 = py;
        if (px > x1) x1 = px; if (py > y1) y1 = py;
        for (const n of [p - 1, p + 1, p - width, p + width]) {
          // Guard horizontal wraparound before the subset check.
          if (n === p - 1 && px === 0) continue;
          if (n === p + 1 && px === width - 1) continue;
          if (inSubset.has(n) && !visited.has(n)) { visited.add(n); stack.push(n); }
        }
      }
      pieces.push({
        cellIndex,
        component: {
          x0, y0, x1, y1,
          cx: sumX / piecePixels.length,
          cy: sumY / piecePixels.length,
          size: piecePixels.length,
          pixels: piecePixels,
        },
      });
    }
  }
  return pieces;
}

/**
 * Count a component's pixels that touch the outer sheet boundary
 * (x==0, y==0, x==W-1, y==H-1). Zero fast-path when the bbox is interior;
 * otherwise recovers exact pixels lazily.
 */
function countSheetEdgePixels(
  alpha: Uint8Array,
  width: number,
  height: number,
  part: Component,
  threshold: number,
): number {
  if (part.x0 > 0 && part.y0 > 0 && part.x1 < width - 1 && part.y1 < height - 1) return 0;
  const pixels = part.pixels ?? recoverComponentPixels(alpha, width, height, part, threshold);
  let count = 0;
  for (const p of pixels) {
    const x = p % width, y = (p / width) | 0;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) count++;
  }
  return count;
}

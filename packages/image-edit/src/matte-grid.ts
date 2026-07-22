import {
  extractAssets,
  ExtractError,
  type ExtractAssetsOptions,
  type HybridPolicy,
} from "./extract.js";
import type { ChromaKeyOptions, MatteColor } from "./chroma-key.js";
import type { TileCell } from "./slicing.js";

// ---------------------------------------------------------------------------
// extractMatteGrid — compatibility wrapper over extractAssets (design §3).
//
// Default behavior since PR7: strategy "chroma-grid" + chroma pipeline "v2"
// (whole-sheet chroma, centroid geometry). The escape hatch is explicit
// `strategy: "equal-cell"` + `chroma: { pipeline: "v1" }` (per-cell chroma,
// whole-image matte sampling); the pixel-compat invariant
// (`extractAssets({ strategy: "equal-cell", chroma: { pipeline: "v1" } })` ≡
// legacy extractMatteGrid) is covered by a golden-hash regression test in
// test/extract.test.ts.
// ---------------------------------------------------------------------------

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
  /** Maximum foreground pixels / perimeter pixels. Default 0 (no edge contact). equal-cell hard gate. */
  maxEdgeTouchRatio?: number;
  /** chroma-grid/hybrid hard gate: foreground on the sheet outer boundary. Default 0. */
  maxSheetEdgeTouchRatio?: number;
  /** chroma_residue hard gate. Default 0.001. */
  residueMaxFraction?: number;
  /** Chebyshev distance to transparent for residue detection. Default 2. */
  residueEdgeDepthPx?: number;
  /** Default true: QA covers the full mapping even when subset publishes fewer keys. */
  requireFullCount?: boolean;
  /** Optional soft body-scale consistency limit (coefficient of variation). */
  maxBodyScaleCv?: number;
};

export type ExtractMatteGridOptions = {
  rows: number;
  cols: number;
  /** Semantic key → row-major cell. A string array maps each key to its own index. */
  mapping: GridSemanticMapping;
  /** Publish only these semantic keys. Full grid assignment + QA always runs. */
  subset?: readonly string[];
  /** Extraction strategy. Default "chroma-grid" (PR7); "equal-cell" is the explicit escape hatch. */
  strategy?: "equal-cell" | "chroma-grid" | "hybrid";
  /** Matte auto-sampling or explicit RGB, plus deterministic chroma parameters. */
  chroma?: ChromaKeyOptions & {
    /** corner = legacy auto; subject-aware = scored candidates. Default "corner". */
    matteSelect?: "corner" | "subject-aware";
  };
  /** Centroid geometry tuning (chroma-grid/hybrid only; see design §4). */
  geometry?: ExtractAssetsOptions["geometry"];
  normalize: {
    /** Square number or explicit output dimensions. */
    canvasSize: number | { width: number; height: number };
    /** Transparent inset around normalized foreground. Default 0. */
    padding?: number;
    /** Vertical placement on the canvas. Default "center". */
    align?: "center" | "feet";
  };
  qa?: MatteGridQaOptions;
  /** Hybrid ML fallback policy (required mlFallback: true when strategy === "hybrid"). */
  hybrid?: HybridPolicy;
  /** Output format. Default: "png" (lossless alpha). "webp" yields lossy-but-smaller transparent cells. */
  format?: "png" | "webp";
  /** Quality 1-100 when format is "webp". Default: 80. Ignored for "png". */
  quality?: number;
  /** Replace an existing output directory. Default false. */
  overwrite?: boolean;
  /** Max width/height (and total pixel bound) guard. Default 8192. */
  maxDimension?: number;
};

export type MatteGridItem = {
  key: string;
  index: number;
  file: string;
  path: string;
  geometry: {
    cell: TileCell;
    /**
     * Foreground bounds relative to the equal-size source cell (LEGACY for
     * equal-cell; may be negative or exceed the cell for chroma-grid overflow
     * — consumers that assumed "inside cell" MUST read sourceBounds).
     */
    foreground: { x: number; y: number; w: number; h: number };
    /** Absolute foreground bbox in full source image coordinates (filled for every strategy). */
    sourceBounds?: { x: number; y: number; w: number; h: number };
    /** Isolation crop canvas size before normalize (filled for every strategy). */
    cropSize?: { w: number; h: number };
    /** Foreground placement on the normalized transparent canvas. */
    normalized: {
      x: number; y: number; w: number; h: number;
      canvasWidth: number; canvasHeight: number; padding: number;
      align?: "center" | "feet";
    };
  };
  qa: {
    foregroundPixels: number;
    foregroundRatio: number;
    edgeTouchPixels: number;
    edgeTouchRatio: number;
    alphaThreshold: number;
    /** chroma-grid/hybrid: kept foreground pixels touching the sheet outer boundary (hard QA). */
    sheetEdgeTouchPixels?: number;
    sheetEdgeTouchRatio?: number;
    /** chroma-grid/hybrid: kept components unioned into this cell. */
    componentCount?: number;
    /** chroma-grid/hybrid: a merged-span split contributed to this cell. */
    splitFromMerged?: boolean;
  };
  /** ml-blobs only: foreground centroid in source coordinates. */
  centroid?: { x: number; y: number };
};

export type ExtractMatteGridResult = {
  sourceFile: string;
  rows: number;
  cols: number;
  matteColor: MatteColor;
  matteColorSource: "provided" | "auto-sampled" | "auto-subject-aware";
  items: MatteGridItem[];
};

/**
 * Deterministically extract named transparent assets from a uniform-matte grid.
 * Thin wrapper over {@link extractAssets} (default: chroma-grid + chroma v2
 * since PR7; equal-cell + v1 via explicit options); error messages keep the
 * legacy `extractMatteGrid:` wording. This function
 * has no network, ML, starter, or `.repochan/` knowledge for the default
 * chroma strategies ("ml-blobs"/"hybrid" strategies of extractAssets require
 * the explicitly installed local image-ML capability).
 */
export async function extractMatteGrid(
  imagePath: string,
  outDir: string,
  options: ExtractMatteGridOptions,
): Promise<ExtractMatteGridResult> {
  try {
    const result = await extractAssets(imagePath, outDir, {
      strategy: options.strategy ?? "chroma-grid",
      rows: options.rows,
      cols: options.cols,
      mapping: options.mapping,
      subset: options.subset,
      chroma: options.chroma,
      geometry: options.geometry,
      normalize: options.normalize,
      qa: options.qa,
      hybrid: options.hybrid,
      format: options.format,
      quality: options.quality,
      overwrite: options.overwrite,
      maxDimension: options.maxDimension,
    });
    return {
      sourceFile: result.sourceFile,
      rows: result.rows,
      cols: result.cols,
      matteColor: result.matteColor,
      matteColorSource: result.matteColorSource,
      items: result.items,
    };
  } catch (error) {
    throw toLegacyError(error);
  }
}

/**
 * Map extractAssets failures back to the legacy extractMatteGrid error
 * wording so existing callers/tests keep matching stable messages:
 *   - invalid options      → "extractMatteGrid: <detail>" (validation text unchanged)
 *   - QA defects           → "extractMatteGrid: alpha QA failed:\n- <key> (cell <i>): <detail>"
 *   - other plain errors   → same message with the extractAssets prefix swapped
 */
function toLegacyError(error: unknown): unknown {
  if (error instanceof ExtractError) {
    if (error.defects.length > 0 && error.defects.every((defect) => defect.code === "invalid_options")) {
      return new Error(error.defects.map((defect) => `extractMatteGrid: ${defect.detail}`).join("\n"));
    }
    const lines = error.defects.map((defect) =>
      defect.key !== undefined
        ? `${defect.key} (cell ${defect.index}): ${defect.detail}`
        : `${defect.code}: ${defect.detail}`,
    );
    return new Error(`extractMatteGrid: alpha QA failed:\n- ${lines.join("\n- ")}`);
  }
  if (error instanceof Error && error.message.startsWith("extractAssets: ")) {
    return new Error(`extractMatteGrid: ${error.message.slice("extractAssets: ".length)}`);
  }
  return error;
}

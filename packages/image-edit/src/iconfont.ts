// ---------------------------------------------------------------------------
// Iconfont postprocess: turn a rows×cols hollow-icon sheet into a lucide-style
// SVG icon set (one <svg viewBox="0 0 24 24" fill="currentColor"> per icon,
// plus sprite.svg and index.json).
//
// Pipeline: extractAssets (chroma-grid, per-icon PNG tiles normalized onto a
// normalizeSize canvas) → binarize tile alpha → vectorize the opaque layer
// with the vendored imagetracer.js (src/vendor/) → scale path coordinates
// onto the viewBox → atomic staging publish (same latch semantics as
// extractAssets: existing outDir requires overwrite=true).
//
// Output SVGs are true vector paths traced from the alpha silhouette — no
// embedded bitmaps. Holes (e.g. the inside of an "O") are emitted as
// reversed-direction subpaths so the default nonzero fill rule renders them.
// ---------------------------------------------------------------------------

import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { extractAssets } from "./extract.js";
import { loadImglySharp } from "./imgly.js";
import type { ChromaPipelineOptions } from "./chroma-pipeline.js";
import type { GridSemanticMapping } from "./matte-grid.js";
import {
  imageTracer,
  type ImageTracerOptions,
  type TraceData,
} from "./vendor/imagetracer.js";

export type IconfontIcon = {
  name: string;
  /** Icon SVG file name relative to the output directory, e.g. "home.svg". */
  file: string;
  pathCount: number;
  /** Content bounding box in viewBox units. */
  bbox: { x: number; y: number; w: number; h: number };
};

export type IconfontResult = {
  icons: IconfontIcon[];
  /** Absolute path of the generated sprite.svg. */
  spriteFile: string;
  /** Absolute path of the generated index.json. */
  indexFile: string;
};

export type IconfontOptions = {
  rows?: number;
  cols?: number;
  /** Required semantic mapping (row-major keys or { key: cellIndex }). */
  mapping: GridSemanticMapping;
  /** Chroma options forwarded to extractAssets (default pipeline v2). */
  chroma?: ChromaPipelineOptions & { matteSelect?: "corner" | "subject-aware" };
  geometry?: {
    /** Alpha binarization threshold for tracing, 1–255. Default 128. */
    alphaThreshold?: number;
  };
  /** Intermediate per-icon canvas size (px). Default 512. */
  normalizeSize?: number;
  /** Output SVG viewBox edge. Default 24. */
  viewBox?: number;
  overwrite?: boolean;
};

const DEFAULT_NORMALIZE_SIZE = 512;
const DEFAULT_VIEWBOX = 24;
const DEFAULT_ALPHA_THRESHOLD = 128;

// Fixed tracer tuning for binary alpha silhouettes: moderate line/quad
// tolerance for clean paths, pathomit drops sub-8px speckle, and a two-entry
// palette ([background, foreground]) so color "quantization" is a pure lookup.
const TRACE_OPTIONS: ImageTracerOptions = {
  ltres: 1,
  qtres: 1,
  pathomit: 8,
  rightangleenhance: true,
  numberofcolors: 2,
  colorquantcycles: 1,
  mincolorratio: 0,
  pal: [
    { r: 255, g: 255, b: 255, a: 255 }, // layer 0: background (ignored)
    { r: 0, g: 0, b: 0, a: 255 }, // layer 1: opaque silhouette (traced)
  ],
  // Coordinates stay at tile resolution (scale 1, no rounding); the iconfont
  // pipeline scales them onto the viewBox itself (svgpathstring rounds hole
  // coordinates to integers upstream, which would lose precision at 24px).
  scale: 1,
  roundcoords: -1,
  desc: false,
  linefilter: false,
  strokewidth: 0,
  lcpr: 0,
  qcpr: 0,
  viewbox: false,
  blurradius: 0,
  blurdelta: 20,
};

const FOREGROUND_LAYER = 1;
const NUMBER_TOKEN = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Scale every numeric token of an imagetracer path string onto the viewBox. */
function scalePathData(d: string, scale: number, viewBox: number): string {
  // The tracer's padded scan array lets edge coordinates drift slightly
  // outside [0, tileSize]; clamp into the viewBox so glyphs never overflow it.
  return d.replace(NUMBER_TOKEN, (token) =>
    String(round2(Math.min(viewBox, Math.max(0, Number(token) * scale)))),
  );
}

function binarizeAlpha(source: Buffer, width: number, height: number, alphaThreshold: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const opaque = source[pixel * 4 + 3] >= alphaThreshold;
    const value = opaque ? 0 : 255;
    const at = pixel * 4;
    data[at] = value;
    data[at + 1] = value;
    data[at + 2] = value;
    data[at + 3] = 255;
  }
  return { width, height, data };
}

type TracedIcon = {
  /** Concatenated path data at viewBox scale (all shapes + their holes). */
  d: string;
  pathCount: number;
  bbox: { x: number; y: number; w: number; h: number };
};

/**
 * Vectorize one normalized tile's alpha channel. The foreground is palette
 * layer 1; hole subpaths are emitted reversed by imagetracer (nonzero rule).
 */
function traceTileAlpha(
  source: Buffer,
  width: number,
  height: number,
  alphaThreshold: number,
  scale: number,
  viewBox: number,
): TracedIcon {
  const traced: TraceData = imageTracer.imagedataToTracedata(
    binarizeAlpha(source, width, height, alphaThreshold),
    TRACE_OPTIONS,
  );
  const layer = traced.layers[FOREGROUND_LAYER] ?? [];

  const parts: string[] = [];
  let pathCount = 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let pathIndex = 0; pathIndex < layer.length; pathIndex++) {
    const tracedPath = layer[pathIndex];
    if (tracedPath.isholepath) continue;
    const element = imageTracer.svgpathstring(traced, FOREGROUND_LAYER, pathIndex, TRACE_OPTIONS);
    const match = element.match(/d="([^"]*)"/);
    if (!match || !match[1].trim()) continue;
    parts.push(scalePathData(match[1], scale, viewBox));
    pathCount++;
    for (const segment of tracedPath.segments) {
      x0 = Math.min(x0, segment.x1, segment.x2, segment.x3 ?? Infinity);
      y0 = Math.min(y0, segment.y1, segment.y2, segment.y3 ?? Infinity);
      x1 = Math.max(x1, segment.x1, segment.x2, segment.x3 ?? -Infinity);
      y1 = Math.max(y1, segment.y1, segment.y2, segment.y3 ?? -Infinity);
    }
  }
  if (pathCount === 0) {
    throw new Error("extractIconfont: tile produced no traceable foreground (empty alpha after binarization).");
  }
  const bx = Math.min(viewBox, Math.max(0, x0 * scale));
  const by = Math.min(viewBox, Math.max(0, y0 * scale));
  return {
    d: parts.join(" "),
    pathCount,
    bbox: {
      x: round2(bx),
      y: round2(by),
      w: round2(Math.min(viewBox, Math.max(0, x1 * scale)) - bx),
      h: round2(Math.min(viewBox, Math.max(0, y1 * scale)) - by),
    },
  };
}

function iconSvg(traced: TracedIcon, viewBox: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}" fill="currentColor">` +
    `<path d="${traced.d}"/></svg>\n`
  );
}

function spriteSvg(icons: Array<{ name: string; traced: TracedIcon }>, viewBox: number): string {
  const symbols = icons.map(
    (icon) =>
      `  <symbol id="icon-${icon.name}" viewBox="0 0 ${viewBox} ${viewBox}" fill="currentColor">` +
      `<path d="${icon.traced.d}"/></symbol>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join("\n")}\n</svg>\n`;
}

async function exists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

/**
 * Atomic publish (staging rename + backup rollback), mirroring
 * extractAssets' publish semantics: complete result staged beside the
 * destination, existing directory kept as backup until the staged rename
 * lands, backup restored if the publish rename fails.
 */
async function publishFiles(outDir: string, files: Array<{ name: string; contents: string }>, overwrite: boolean): Promise<void> {
  const destination = path.resolve(outDir);
  const parent = path.dirname(destination);
  const base = path.basename(destination);
  await fs.mkdir(parent, { recursive: true });
  const staging = await fs.mkdtemp(path.join(parent, `.${base}.tmp-`));
  const backup = path.join(parent, `.${base}.backup-${randomUUID()}`);
  let existingMoved = false;
  let stagingPublished = false;

  try {
    for (const file of files) {
      await fs.writeFile(path.join(staging, file.name), file.contents);
    }

    if (await exists(destination)) {
      if (!overwrite) {
        throw new Error(`extractIconfont: output directory already exists: ${outDir}. Pass overwrite=true to replace.`);
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
            `extractIconfont: publish failed and the previous output could not be restored from ${backup}`,
          );
        }
      }
      throw publishError;
    }

    if (existingMoved) {
      await fs.rm(backup, { recursive: true, force: true }).catch(() => undefined);
      existingMoved = false;
    }
  } finally {
    if (!stagingPublished) await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Extract a hollow-icon sheet into a lucide-style SVG icon set.
 * Throws ExtractError (from extractAssets) on grid/chroma QA failure and
 * plain Errors for I/O, decode, and tracing failures.
 */
export async function extractIconfont(
  imagePath: string,
  outDir: string,
  options: IconfontOptions,
): Promise<IconfontResult> {
  const rows = options.rows ?? 4;
  const cols = options.cols ?? 4;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error(`extractIconfont: rows and cols must be positive integers (got rows=${rows}, cols=${cols}).`);
  }
  if (!options.mapping) {
    throw new Error("extractIconfont: a semantic mapping is required (named icon outputs).");
  }
  const normalizeSize = options.normalizeSize ?? DEFAULT_NORMALIZE_SIZE;
  if (!Number.isInteger(normalizeSize) || normalizeSize < 16) {
    throw new Error(`extractIconfont: normalizeSize must be an integer >= 16 (got ${normalizeSize}).`);
  }
  const viewBox = options.viewBox ?? DEFAULT_VIEWBOX;
  if (typeof viewBox !== "number" || viewBox < 1) {
    throw new Error(`extractIconfont: viewBox must be a positive number (got ${viewBox}).`);
  }
  const alphaThreshold = options.geometry?.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD;
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 1 || alphaThreshold > 255) {
    throw new Error(`extractIconfont: geometry.alphaThreshold must be an integer from 1 to 255 (got ${alphaThreshold}).`);
  }
  const overwrite = options.overwrite ?? false;

  if ((await exists(outDir)) && !overwrite) {
    throw new Error(`extractIconfont: output directory already exists: ${outDir}. Pass overwrite=true to replace.`);
  }

  // Tiles are intermediate only: extract to a temp dir, keep just the SVGs.
  const tilesDir = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-iconfont-tiles-"));
  try {
    const extracted = await extractAssets(imagePath, tilesDir, {
      strategy: "chroma-grid",
      rows,
      cols,
      mapping: options.mapping,
      chroma: options.chroma,
      normalize: { canvasSize: normalizeSize },
      format: "png",
      overwrite: true,
    });

    const sharp = (await loadImglySharp()).default;
    const scale = viewBox / normalizeSize;
    const prepared: Array<{ name: string; traced: TracedIcon }> = [];
    for (const item of extracted.items) {
      const raw = await sharp(item.path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let traced: TracedIcon;
      try {
        traced = traceTileAlpha(raw.data, raw.info.width, raw.info.height, alphaThreshold, scale, viewBox);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`extractIconfont: tracing failed for icon "${item.key}": ${detail}`);
      }
      prepared.push({ name: item.key, traced });
    }

    const spriteName = "sprite.svg";
    const indexName = "index.json";
    const icons: IconfontIcon[] = prepared.map((icon) => ({
      name: icon.name,
      file: `${icon.name}.svg`,
      pathCount: icon.traced.pathCount,
      bbox: icon.traced.bbox,
    }));
    const index = {
      schema: "repochan.iconfont.v1",
      sourceFile: path.basename(imagePath),
      rows,
      cols,
      normalizeSize,
      viewBox,
      icons,
      spriteFile: spriteName,
    };

    const files: Array<{ name: string; contents: string }> = prepared.map((icon) => ({
      name: `${icon.name}.svg`,
      contents: iconSvg(icon.traced, viewBox),
    }));
    files.push({ name: spriteName, contents: spriteSvg(prepared, viewBox) });
    files.push({ name: indexName, contents: `${JSON.stringify(index, null, 2)}\n` });

    await publishFiles(outDir, files, overwrite);

    const destination = path.resolve(outDir);
    return {
      icons,
      spriteFile: path.join(destination, spriteName),
      indexFile: path.join(destination, indexName),
    };
  } finally {
    await fs.rm(tilesDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

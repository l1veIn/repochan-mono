import { promises as fs } from "node:fs";
import path from "node:path";
import { loadSharp } from "./sharp.js";

// ---------------------------------------------------------------------------
// Layout guide (design doc §11) — a deterministic grid-composition reference
// PNG that Painter passes to `image gen --reference` alongside the foundation
// sheet. It is a generation-side composition constraint only: guides are never
// extracted, and template prompts forbid reproducing the guide lines.
//
// Pixels are written directly into a raw RGB buffer (no SVG rasterization) so
// the output is byte-deterministic across platforms; the existing vendored
// sharp only encodes the final PNG. The default visual recipe is fixed by the
// design and locked by a golden hash in test/layout-guide.test.ts:
//
//   background #F5F5F5 · cell stroke #CCCCCC (2px) · safe area #2F80ED (2px)
//   optional dashed crosshair #B0B0B0 · labelCells=false (production guides
//   carry NO numbers) · sRGB PNG, no alpha.
// ---------------------------------------------------------------------------

const DEFAULT_CELL_WIDTH = 341; // 1024/3 magnitude
const DEFAULT_CELL_HEIGHT = 341;
const DEFAULT_SAFE_MARGIN_FRACTION = 0.1; // 10% inset
const DEFAULT_BACKGROUND = "#F5F5F5";
const DEFAULT_CELL_STROKE = "#CCCCCC";
const DEFAULT_SAFE_STROKE = "#2F80ED";
const DEFAULT_CROSSHAIR = "#B0B0B0";
const LABEL_COLOR: Rgb = [0x88, 0x88, 0x88];
const STROKE_WIDTH = 2;
const CROSSHAIR_DASH_ON = 4;
const CROSSHAIR_DASH_OFF = 4;

type Rgb = [number, number, number];

export type LayoutGuideOptions = {
  rows: number;
  cols: number;
  /** Cell width in px. Default 341 (1024/3 magnitude). */
  cellWidth?: number;
  /** Cell height in px. Default 341. */
  cellHeight?: number;
  /** Safe-area inset as a fraction of the cell size. Default 0.10. */
  safeMarginFraction?: number;
  /** Background color. Default "#F5F5F5". */
  background?: string;
  /** Cell border color (2px). Default "#CCCCCC". */
  cellStroke?: string;
  /** Safe-area border color (2px). Default "#2F80ED". */
  safeStroke?: string;
  /** Dashed center crosshair: true → "#B0B0B0", or a "#RRGGBB" color. Default off. */
  crosshair?: boolean | string;
  /** Debug only: draw the row-major cell index inside each cell. Production guides: NO numbers. Default false. */
  labelCells?: boolean;
  /** Replace an existing output file. Default false. */
  overwrite?: boolean;
};

export type LayoutGuideResult = {
  outFile: string;
  width: number;
  height: number;
  rows: number;
  cols: number;
  cellWidth: number;
  cellHeight: number;
  safeMargin: { x: number; y: number };
};

function parseHexColor(value: string, optionName: string): Rgb {
  const hex = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`writeLayoutGuide: ${optionName} must be a #RRGGBB color (got "${value}").`);
  }
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function setPx(buf: Buffer, width: number, height: number, x: number, y: number, color: Rgb): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const q = (y * width + x) * 3;
  buf[q] = color[0];
  buf[q + 1] = color[1];
  buf[q + 2] = color[2];
}

/** Stroke an axis-aligned rectangle outline (inside the given bounds). */
function strokeRect(
  buf: Buffer,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  strokeWidth: number,
  color: Rgb,
): void {
  for (let s = 0; s < strokeWidth; s++) {
    for (let x = x0 + s; x <= x1 - s; x++) {
      setPx(buf, width, height, x, y0 + s, color);
      setPx(buf, width, height, x, y1 - s, color);
    }
    for (let y = y0 + s; y <= y1 - s; y++) {
      setPx(buf, width, height, x0 + s, y, color);
      setPx(buf, width, height, x1 - s, y, color);
    }
  }
}

// 3×5 bitmap digits for the debug-only cell labels (labelCells=true).
const DIGIT_GLYPHS: Record<string, number[]> = {
  "0": [0b111, 0b101, 0b101, 0b101, 0b111],
  "1": [0b010, 0b110, 0b010, 0b010, 0b111],
  "2": [0b111, 0b001, 0b111, 0b100, 0b111],
  "3": [0b111, 0b001, 0b111, 0b001, 0b111],
  "4": [0b101, 0b101, 0b111, 0b001, 0b001],
  "5": [0b111, 0b100, 0b111, 0b001, 0b111],
  "6": [0b111, 0b100, 0b111, 0b101, 0b111],
  "7": [0b111, 0b001, 0b001, 0b001, 0b001],
  "8": [0b111, 0b101, 0b111, 0b101, 0b111],
  "9": [0b111, 0b101, 0b111, 0b001, 0b111],
};

function drawLabel(buf: Buffer, width: number, height: number, x: number, y: number, text: string): void {
  let cursor = x;
  for (const ch of text) {
    const glyph = DIGIT_GLYPHS[ch];
    if (!glyph) continue;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (glyph[row] & (1 << (2 - col))) setPx(buf, width, height, cursor + col, y + row, LABEL_COLOR);
      }
    }
    cursor += 4;
  }
}

/**
 * Render a deterministic layout-guide PNG for a rows×cols grid.
 *
 * Purely geometric: full-canvas background, a 2px border per cell, a 2px
 * safe-area rectangle inset by safeMarginFraction, and optionally a dashed
 * 1px center crosshair per cell. No network, no ML, no protocol awareness.
 */
export async function writeLayoutGuide(outPath: string, options: LayoutGuideOptions): Promise<LayoutGuideResult> {
  const { rows, cols } = options;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error(`writeLayoutGuide: rows and cols must be positive integers (got rows=${rows}, cols=${cols}).`);
  }
  const cellWidth = options.cellWidth ?? DEFAULT_CELL_WIDTH;
  const cellHeight = options.cellHeight ?? DEFAULT_CELL_HEIGHT;
  if (!Number.isInteger(cellWidth) || !Number.isInteger(cellHeight) || cellWidth < 8 || cellHeight < 8) {
    throw new Error(`writeLayoutGuide: cellWidth/cellHeight must be integers >= 8 (got ${cellWidth}x${cellHeight}).`);
  }
  const safeMarginFraction = options.safeMarginFraction ?? DEFAULT_SAFE_MARGIN_FRACTION;
  if (typeof safeMarginFraction !== "number" || !(safeMarginFraction >= 0) || safeMarginFraction >= 0.5) {
    throw new Error(`writeLayoutGuide: safeMarginFraction must be in [0, 0.5) (got ${safeMarginFraction}).`);
  }
  const background = parseHexColor(options.background ?? DEFAULT_BACKGROUND, "background");
  const cellStroke = parseHexColor(options.cellStroke ?? DEFAULT_CELL_STROKE, "cellStroke");
  const safeStroke = parseHexColor(options.safeStroke ?? DEFAULT_SAFE_STROKE, "safeStroke");
  const crosshairOpt = options.crosshair ?? false;
  const crosshair = crosshairOpt === false
    ? null
    : parseHexColor(crosshairOpt === true ? DEFAULT_CROSSHAIR : crosshairOpt, "crosshair");

  const width = cols * cellWidth;
  const height = rows * cellHeight;
  const safeMargin = {
    x: Math.round(cellWidth * safeMarginFraction),
    y: Math.round(cellHeight * safeMarginFraction),
  };

  const buf = Buffer.alloc(width * height * 3);
  for (let p = 0; p < buf.length; p += 3) {
    buf[p] = background[0];
    buf[p + 1] = background[1];
    buf[p + 2] = background[2];
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * cellWidth;
      const y0 = row * cellHeight;
      const x1 = x0 + cellWidth - 1;
      const y1 = y0 + cellHeight - 1;
      strokeRect(buf, width, height, x0, y0, x1, y1, STROKE_WIDTH, cellStroke);
      strokeRect(buf, width, height, x0 + safeMargin.x, y0 + safeMargin.y, x1 - safeMargin.x, y1 - safeMargin.y, STROKE_WIDTH, safeStroke);
      if (crosshair) {
        const cx = x0 + Math.floor(cellWidth / 2);
        const cy = y0 + Math.floor(cellHeight / 2);
        const dashPeriod = CROSSHAIR_DASH_ON + CROSSHAIR_DASH_OFF;
        for (let x = x0; x <= x1; x++) {
          if ((x - x0) % dashPeriod < CROSSHAIR_DASH_ON) setPx(buf, width, height, x, cy, crosshair);
        }
        for (let y = y0; y <= y1; y++) {
          if ((y - y0) % dashPeriod < CROSSHAIR_DASH_ON) setPx(buf, width, height, cx, y, crosshair);
        }
      }
      if (options.labelCells) drawLabel(buf, width, height, x0 + 6, y0 + 6, String(row * cols + col));
    }
  }

  const destination = path.resolve(outPath);
  try {
    await fs.access(destination);
    if (!options.overwrite) {
      throw new Error(`writeLayoutGuide: output file already exists: ${outPath}. Pass overwrite=true to replace.`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  const sharp = (await loadSharp()).default;
  await sharp(buf, { raw: { width, height, channels: 3 } }).png().toFile(destination);

  return { outFile: destination, width, height, rows, cols, cellWidth, cellHeight, safeMargin };
}

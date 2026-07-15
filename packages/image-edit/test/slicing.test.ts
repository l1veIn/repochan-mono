import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PNG } from "pngjs";
import { computeTileCells, readPngSize, sliceImage, sliceGridToFiles } from "../src/index.js";

// ---------------------------------------------------------------------------
// PNG fixture: minimal valid PNG header with configurable dimensions.
// Layout: [8-byte signature][length=13 (4 BE)][chunk type "IHDR"][13-byte
// data: width(4) height(4) bitDepth(1) colorType(1) compression(1) filter(1)
// interlace(1)][CRC (4, can be wrong)][IEND]. No real pixel data is needed
// because readPngSize only reads bytes 0-23.
function makePng(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const len = Buffer.alloc(4); len.writeUInt32BE(13, 0);
  const type = Buffer.from("IHDR", "ascii");
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  // bitDepth=8 colorType=6(RGBA) — values don't matter for readPngSize.
  const crc = Buffer.alloc(4);
  const iend = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  return Buffer.concat([sig, len, type, data, crc, iend]);
}

async function tmpPng(width: number, height: number): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-slice-"));
  const file = path.join(dir, "grid.png");
  await fs.writeFile(file, makePng(width, height));
  return file;
}

describe("computeTileCells (pure geometry)", () => {
  it("produces rows×cols equal cells for an evenly divisible canvas", () => {
    const tiles = computeTileCells(400, 400, 4, 4);
    expect(tiles.rows).toBe(4);
    expect(tiles.cols).toBe(4);
    expect(tiles.cellW).toBe(100);
    expect(tiles.cellH).toBe(100);
    expect(tiles.cells).toHaveLength(16);
    // top-left cell
    expect(tiles.cells[0]).toMatchObject({ row: 0, col: 0, x: 0, y: 0, w: 100, h: 100 });
    // last cell
    expect(tiles.cells[15]).toMatchObject({ row: 3, col: 3, x: 300, y: 300, w: 100, h: 100 });
  });

  it("keeps remainder as gutters, not absorbed into cells", () => {
    // 410×410 with 4×4 → cellW = floor(410/4) = 102, 4*102=408 → 2px gutter.
    const tiles = computeTileCells(410, 410, 4, 4);
    expect(tiles.cellW).toBe(102);
    expect(tiles.cellH).toBe(102);
    // every cell stays uniform at 102
    for (const c of tiles.cells) {
      expect(c.w).toBe(102);
      expect(c.h).toBe(102);
    }
  });

  it("rejects non-positive rows/cols", () => {
    expect(() => computeTileCells(400, 400, 0, 4)).toThrow();
    expect(() => computeTileCells(400, 400, 4, -1)).toThrow();
  });

  it("rejects canvas too small for the grid", () => {
    expect(() => computeTileCells(3, 3, 4, 4)).toThrow();
  });
});

describe("readPngSize", () => {
  it("reads dimensions from a minimal PNG header", async () => {
    const file = await tmpPng(256, 128);
    const size = await readPngSize(file);
    expect(size).toEqual({ width: 256, height: 128 });
  });

  it("rejects a non-PNG file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-bad-"));
    const file = path.join(dir, "not.png");
    // ≥24 bytes so it passes the length check and fails the signature check.
    await fs.writeFile(file, Buffer.alloc(32, 0x00));
    await expect(readPngSize(file)).rejects.toThrow(/Not a PNG/);
  });
});

describe("sliceImage", () => {
  it("reads a PNG and computes its tile coordinates", async () => {
    const file = await tmpPng(400, 400);
    const result = await sliceImage(file, 4, 4);
    expect(result.sourceFile).toBe("grid.png");
    expect(result.tiles.cells).toHaveLength(16);
    expect(result.tiles.cellW).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// sliceGridToFiles integration tests.
// These create a REAL PNG via pngjs and crop it via imgly's vendored sharp,
// so they exercise the full extract→write path. No ML model is needed
// (cropping is pure pixel work).
// ---------------------------------------------------------------------------

/**
 * Build a real PNG grid: white background with a distinct solid color filling
 * each cell (so tests can verify the crop captured the right region). Each
 * cell is painted fully edge-to-edge so padding crops have content to cut.
 */
async function makeColorGrid(opts: {
  width: number;
  height: number;
  rows: number;
  cols: number;
  colors: [number, number, number][];
  outputPath: string;
}): Promise<void> {
  const { width, height, rows, cols, colors, outputPath } = opts;
  const cellW = Math.floor(width / cols);
  const cellH = Math.floor(height / rows);
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const col = Math.floor(x / cellW);
      const row = Math.floor(y / cellH);
      const ci = Math.min(row * cols + col, colors.length - 1);
      const [r, g, b] = colors[ci];
      png.data[idx] = r; png.data[idx + 1] = g; png.data[idx + 2] = b; png.data[idx + 3] = 255;
    }
  }
  await fs.writeFile(outputPath, PNG.sync.write(png));
}

describe("sliceGridToFiles", () => {
  it("crops a 2×2 grid into 4 tile PNGs on disk", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-gridf-"));
    const gridPath = path.join(dir, "grid.png");
    const outDir = path.join(dir, "out");
    // red, green, blue, yellow — one per cell
    await makeColorGrid({
      width: 400, height: 400, rows: 2, cols: 2,
      colors: [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]],
      outputPath: gridPath,
    });

    const result = await sliceGridToFiles(gridPath, outDir, { rows: 2, cols: 2 });

    expect(result.sourceFile).toBe("grid.png");
    expect(result.tiles).toHaveLength(4);
    // default naming
    expect(result.tiles.map((t) => t.file)).toEqual(["tile-0.png", "tile-1.png", "tile-2.png", "tile-3.png"]);
    // each tile file exists and is a valid PNG
    for (const t of result.tiles) {
      const stat = await fs.stat(path.join(outDir, t.file));
      expect(stat.isFile()).toBe(true);
      expect(t.width).toBe(200); // 400/2
      expect(t.height).toBe(200);
    }
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("padding insets each crop symmetrically", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-pad-"));
    const gridPath = path.join(dir, "grid.png");
    const outDir = path.join(dir, "out");
    await makeColorGrid({
      width: 400, height: 400, rows: 2, cols: 2,
      colors: [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]],
      outputPath: gridPath,
    });

    const result = await sliceGridToFiles(gridPath, outDir, { rows: 2, cols: 2, padding: 20 });

    // 200 - 20*2 = 160
    for (const t of result.tiles) {
      expect(t.width).toBe(160);
      expect(t.height).toBe(160);
    }
    // tile-0 crop should start at (20, 20) not (0, 0)
    expect(result.tiles[0].crop).toEqual({ x: 20, y: 20, w: 160, h: 160 });
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("respects a custom name template", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-naming-"));
    const gridPath = path.join(dir, "grid.png");
    const outDir = path.join(dir, "out");
    await makeColorGrid({
      width: 200, height: 200, rows: 1, cols: 2,
      colors: [[255, 0, 0], [0, 255, 0]],
      outputPath: gridPath,
    });

    const result = await sliceGridToFiles(gridPath, outDir, { rows: 1, cols: 2, nameTemplate: "pattern-{i}.png" });
    expect(result.tiles.map((t) => t.file)).toEqual(["pattern-0.png", "pattern-1.png"]);
    await fs.stat(path.join(outDir, "pattern-0.png"));
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("refuses to overwrite an existing dir without overwrite=true", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-ow-"));
    const gridPath = path.join(dir, "grid.png");
    const outDir = path.join(dir, "out");
    await makeColorGrid({ width: 100, height: 100, rows: 1, cols: 1, colors: [[1, 2, 3]], outputPath: gridPath });
    await fs.mkdir(outDir);

    await expect(sliceGridToFiles(gridPath, outDir, { rows: 1, cols: 1 })).rejects.toThrow(/already exists/);
    // overwrite=true succeeds
    const result = await sliceGridToFiles(gridPath, outDir, { rows: 1, cols: 1, overwrite: true });
    expect(result.tiles).toHaveLength(1);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("clamps padding so a crop never goes zero-size", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-clamp-"));
    const gridPath = path.join(dir, "grid.png");
    const outDir = path.join(dir, "out");
    await makeColorGrid({ width: 100, height: 100, rows: 2, cols: 2, colors: [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]], outputPath: gridPath });
    // padding=999 on a 50px cell → clamped to floor(50/2)-1 = 24 → crop = 50-48 = 2px
    const result = await sliceGridToFiles(gridPath, outDir, { rows: 2, cols: 2, padding: 999 });
    for (const t of result.tiles) {
      expect(t.width).toBeGreaterThanOrEqual(1);
      expect(t.height).toBeGreaterThanOrEqual(1);
    }
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("rejects non-positive rows/cols", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-bad-"));
    const gridPath = path.join(dir, "grid.png");
    await makeColorGrid({ width: 100, height: 100, rows: 1, cols: 1, colors: [[0, 0, 0]], outputPath: gridPath });
    await expect(sliceGridToFiles(gridPath, path.join(dir, "o"), { rows: 0, cols: 2 })).rejects.toThrow(/positive integers/);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

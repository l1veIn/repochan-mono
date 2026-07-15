import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PNG } from "pngjs";
import { findConnectedComponents, extractStickersFromImage } from "../src/index.js";

// Fixtures use pngjs (a devDep) so the test suite has no sharp dependency.
// image-edit itself uses imgly's vendored sharp at runtime via dynamic import.

// ── Slow: full ML matting integration (skipped unless RUN_ML=1) ───────
// The matting pipeline downloads an ISNet model on first run and is slow.
// Enable explicitly:
//   RUN_ML=1 pnpm --filter @repochan/image-edit test stickers
const itML = process.env.RUN_ML === "1" ? it : it.skip;

/**
 * Build a synthetic grid PNG: white background with a solid red square
 * centered in each cell. Pure pngjs, no sharp.
 */
async function makeGridFixture(opts: {
  width: number;
  height: number;
  rows: number;
  cols: number;
  outputPath: string;
  cellInset?: number;
}): Promise<void> {
  const { width, height, rows, cols, outputPath } = opts;
  const inset = opts.cellInset ?? 64;
  const cellW = Math.floor(width / cols);
  const cellH = Math.floor(height / rows);
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      // white background
      png.data[idx] = 255; png.data[idx + 1] = 255; png.data[idx + 2] = 255; png.data[idx + 3] = 255;
    }
  }
  // draw a red square in the center of each cell
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * cellW + inset, x1 = (col + 1) * cellW - inset;
      const y0 = row * cellH + inset, y1 = (row + 1) * cellH - inset;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (width * y + x) << 2;
          png.data[idx] = 255; png.data[idx + 1] = 0; png.data[idx + 2] = 0; png.data[idx + 3] = 255;
        }
      }
    }
  }
  await fs.writeFile(outputPath, PNG.sync.write(png));
}

describe("findConnectedComponents (pure)", () => {
  it("finds a single blob in a uniform-alpha mask", () => {
    const width = 10, height = 10;
    const alpha = new Uint8Array(width * height).fill(200); // all foreground
    const blobs = findConnectedComponents(alpha, width, height, 128);
    expect(blobs).toHaveLength(1);
    const b = blobs[0];
    expect(b.x0).toBe(0); expect(b.y0).toBe(0);
    expect(b.x1).toBe(9); expect(b.y1).toBe(9);
    expect(b.size).toBe(100);
  });

  it("finds four separate blobs in a 2x2 sparse grid", () => {
    const width = 30, height = 30;
    const alpha = new Uint8Array(width * height).fill(0); // all background
    // place 4 small squares: top-left, top-right, bottom-left, bottom-right
    const squares = [[2, 2], [20, 2], [2, 20], [20, 20]];
    for (const [sx, sy] of squares) {
      for (let dy = 0; dy < 6; dy++) {
        for (let dx = 0; dx < 6; dx++) {
          alpha[width * (sy + dy) + (sx + dx)] = 200;
        }
      }
    }
    const blobs = findConnectedComponents(alpha, width, height, 128);
    expect(blobs).toHaveLength(4);
    // each blob should be 6x6 = 36px
    for (const b of blobs) expect(b.size).toBe(36);
  });

  it("treats pixels below threshold as background", () => {
    const width = 5, height = 1;
    const alpha = new Uint8Array([200, 200, 50, 200, 200]);
    const blobs = findConnectedComponents(alpha, width, height, 128);
    // 50 < 128 splits into 2 blobs
    expect(blobs).toHaveLength(2);
    expect(blobs[0].size).toBe(2);
    expect(blobs[1].size).toBe(2);
  });

  it("returns empty for an all-background mask", () => {
    const alpha = new Uint8Array(100).fill(0);
    expect(findConnectedComponents(alpha, 10, 10, 128)).toHaveLength(0);
  });
});

describe("extractStickersFromImage (ML integration)", () => {
  itML("extracts 4 transparent stickers from a 2x2 red-square grid", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-stickers-"));
    const gridPath = path.join(dir, "grid.png");
    const outDir = path.join(dir, "stickers");
    await makeGridFixture({ width: 512, height: 512, rows: 2, cols: 2, outputPath: gridPath });

    const result = await extractStickersFromImage(gridPath, { rows: 2, cols: 2 }, outDir);

    expect(result.stickers).toHaveLength(4);
    expect(result.config.detected).toBe(4);
    // each sticker PNG exists on disk
    for (const s of result.stickers) {
      const stat = await fs.stat(path.join(outDir, s.file));
      expect(stat.isFile()).toBe(true);
    }
    await fs.rm(dir, { recursive: true, force: true });
  });

  itML("refuses when blob count != rows*cols", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-mismatch-"));
    const gridPath = path.join(dir, "grid.png");
    const outDir = path.join(dir, "stickers");
    // 2x2 fixture but claim 4x4 = 16 expected
    await makeGridFixture({ width: 512, height: 512, rows: 2, cols: 2, outputPath: gridPath });

    await expect(extractStickersFromImage(gridPath, { rows: 4, cols: 4 }, outDir)).rejects.toThrow(
      /foreground regions but expected 4×4=16/,
    );
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("rejects non-positive rows/cols without touching the model", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-badparams-"));
    const gridPath = path.join(dir, "grid.png");
    await makeGridFixture({ width: 256, height: 256, rows: 2, cols: 2, outputPath: gridPath });
    await expect(extractStickersFromImage(gridPath, { rows: 0, cols: 2 }, path.join(dir, "out"))).rejects.toThrow(
      /positive integers/,
    );
    await fs.rm(dir, { recursive: true, force: true });
  });
});

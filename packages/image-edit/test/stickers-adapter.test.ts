import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PNG } from "pngjs";
import { extractStickersFromImage } from "../src/index.js";
import { matteImage } from "../src/imgly.js";

// ---------------------------------------------------------------------------
// extractStickersFromImage adapter contract (design §8 — FROZEN result shape)
// + atomic publish. The optional native ISNet capability (matteImage) is mocked.
// ---------------------------------------------------------------------------

vi.mock("../src/imgly.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/imgly.js")>();
  return { ...actual, matteImage: vi.fn() };
});
const matteImageMock = vi.mocked(matteImage);

const W = 60;
const H = 60;

/** Synthetic ISNet output for a 2x2 grid: transparent bg + opaque red squares. */
function makeMatted(squares: Array<{ x0: number; y0: number; x1: number; y1: number }>): {
  data: Buffer; width: number; height: number; channels: number;
} {
  const data = Buffer.alloc(W * H * 4); // transparent
  for (const sq of squares) {
    for (let y = sq.y0; y <= sq.y1; y++) {
      for (let x = sq.x0; x <= sq.x1; x++) {
        const q = (y * W + x) * 4;
        data[q] = 255; data[q + 1] = 0; data[q + 2] = 0; data[q + 3] = 255;
      }
    }
  }
  return { data, width: W, height: H, channels: 4 };
}

const CELL_SQUARES = [
  { x0: 8, y0: 7, x1: 22, y1: 22 }, // s00
  { x0: 38, y0: 7, x1: 52, y1: 22 }, // s01
  { x0: 8, y0: 37, x1: 22, y1: 52 }, // s02
  { x0: 38, y0: 37, x1: 52, y1: 52 }, // s03
];

async function makeGridPng(file: string): Promise<void> {
  const png = new PNG({ width: W, height: H });
  for (let p = 0; p < W * H; p++) {
    const q = p * 4;
    png.data[q] = 255; png.data[q + 1] = 255; png.data[q + 2] = 255; png.data[q + 3] = 255;
  }
  for (const sq of CELL_SQUARES) {
    for (let y = sq.y0; y <= sq.y1; y++) {
      for (let x = sq.x0; x <= sq.x1; x++) {
        const q = (y * W + x) * 4;
        png.data[q] = 255; png.data[q + 1] = 0; png.data[q + 2] = 0;
      }
    }
  }
  await fs.writeFile(file, PNG.sync.write(png));
}

async function fixture(): Promise<{ dir: string; image: string; out: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-adapter-"));
  const image = path.join(dir, "grid.png");
  const out = path.join(dir, "stickers");
  await makeGridPng(image);
  return { dir, image, out };
}

beforeEach(() => {
  matteImageMock.mockReset();
  matteImageMock.mockResolvedValue(makeMatted(CELL_SQUARES));
});

afterEach(() => vi.restoreAllMocks());

describe("extractStickersFromImage adapter (frozen ExtractStickersResult)", () => {
  it("returns the frozen result shape with sNN.png files on disk", async () => {
    const { dir, image, out } = await fixture();
    const result = await extractStickersFromImage(image, { rows: 2, cols: 2 }, out);

    // Frozen top-level keys (CLI --json contract: sourceFile/outDir/stickers/config).
    expect(Object.keys(result).sort()).toEqual(["config", "sourceFile", "stickers"]);
    expect(result.sourceFile).toBe("grid.png");
    expect(Object.keys(result.config).sort()).toEqual(["detected", "engine", "expected", "method", "model"]);
    expect(result.config).toEqual({
      model: "small",
      engine: "imgly-isnet",
      method: "blob-detection",
      expected: 4,
      detected: 4,
    });

    expect(result.stickers).toHaveLength(4);
    for (const [i, sticker] of result.stickers.entries()) {
      expect(Object.keys(sticker).sort()).toEqual(["bbox", "centroid", "file", "height", "index", "width"]);
      expect(sticker.index).toBe(i);
      expect(sticker.file).toBe(`s${String(i).padStart(2, "0")}.png`);
      const sq = CELL_SQUARES[i];
      expect(sticker.bbox).toEqual({ x: sq.x0, y: sq.y0, w: sq.x1 - sq.x0 + 1, h: sq.y1 - sq.y0 + 1 });
      expect(sticker.width).toBe(sq.x1 - sq.x0 + 1);
      expect(sticker.height).toBe(sq.y1 - sq.y0 + 1);
      expect(sticker.centroid).toEqual({ x: (sq.x0 + sq.x1) / 2, y: Math.round((sq.y0 + sq.y1) / 2) });
      const stat = await fs.stat(path.join(out, sticker.file));
      expect(stat.isFile()).toBe(true);
    }
    expect(matteImageMock).toHaveBeenCalledTimes(1);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("keeps the legacy blob-count refusal message", async () => {
    const { dir, image, out } = await fixture();
    matteImageMock.mockResolvedValue(makeMatted(CELL_SQUARES.slice(0, 3)));
    await expect(extractStickersFromImage(image, { rows: 2, cols: 2 }, out)).rejects.toThrow(
      /detected 3 foreground regions but expected 2×2=4/,
    );
    await expect(fs.access(out)).rejects.toThrow(); // nothing published on failure
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("keeps the prior complete output when the ML step fails (no rm+mkdir wipe)", async () => {
    const { dir, image, out } = await fixture();
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(path.join(out, "previous.txt"), "complete previous output");
    matteImageMock.mockRejectedValue(new Error("induced ML failure"));

    await expect(
      extractStickersFromImage(image, { rows: 2, cols: 2, overwrite: true }, out),
    ).rejects.toThrow(/induced ML failure/);

    // Legacy behavior wiped the directory up front; atomic publish must not.
    expect(await fs.readdir(out)).toEqual(["previous.txt"]);
    expect((await fs.readdir(dir)).filter((name) => name.startsWith(".stickers."))).toEqual([]);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("restores the prior output when the staged publish fails mid-rename", async () => {
    const { dir, image, out } = await fixture();
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(path.join(out, "previous.txt"), "complete previous output");

    const rename = fs.rename.bind(fs);
    let calls = 0;
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      calls++;
      if (calls === 2) throw new Error("induced staged publish failure");
      return rename(from, to);
    });

    await expect(
      extractStickersFromImage(image, { rows: 2, cols: 2, overwrite: true }, out),
    ).rejects.toThrow(/induced staged publish failure/);

    expect(await fs.readFile(path.join(out, "previous.txt"), "utf8")).toBe("complete previous output");
    expect((await fs.readdir(dir)).filter((name) => name.startsWith(".stickers."))).toEqual([]);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

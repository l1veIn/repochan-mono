import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { extractMatteGrid, type ExtractMatteGridOptions } from "../src/index.js";

const KEYS = ["welcome", "searching", "loading", "empty", "error", "success", "not-found", "cta", "cozy"] as const;
const MATTE: [number, number, number] = [255, 0, 255];

type FixtureMutation = {
  emptyCell?: number;
  edgeTouchCell?: number;
  oversizedCell?: number;
};

async function makeGrid(file: string, mutation: FixtureMutation = {}): Promise<void> {
  const width = 90, height = 90, cellW = 30, cellH = 30;
  const png = new PNG({ width, height });
  for (let p = 0; p < width * height; p++) {
    const q = p * 4;
    png.data[q] = MATTE[0]; png.data[q + 1] = MATTE[1]; png.data[q + 2] = MATTE[2]; png.data[q + 3] = 255;
  }
  for (let index = 0; index < 9; index++) {
    if (index === mutation.emptyCell) continue;
    const row = Math.floor(index / 3), col = index % 3;
    let x0 = col * cellW + 8, y0 = row * cellH + 7, x1 = x0 + 14, y1 = y0 + 16;
    if (index === mutation.edgeTouchCell) x0 = col * cellW;
    if (index === mutation.oversizedCell) {
      x0 = col * cellW + 1; y0 = row * cellH + 1; x1 = x0 + 28; y1 = y0 + 28;
    }
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const q = (y * width + x) * 4;
        png.data[q] = 20 + index * 10;
        png.data[q + 1] = 180;
        png.data[q + 2] = 40;
        png.data[q + 3] = 255;
      }
    }
  }
  await fs.writeFile(file, PNG.sync.write(png));
}

function options(overrides: Partial<ExtractMatteGridOptions> = {}): ExtractMatteGridOptions {
  return {
    rows: 3,
    cols: 3,
    mapping: KEYS,
    // Legacy behavior tests run through the explicit escape hatch (PR7 flipped
    // the defaults to chroma-grid + v2): equal-cell + frozen pipeline v1.
    strategy: "equal-cell",
    chroma: { matteColor: MATTE, pipeline: "v1", threshold: 10, softness: 10 },
    normalize: { canvasSize: 64, padding: 8 },
    ...overrides,
  };
}

async function fixture(mutation: FixtureMutation = {}): Promise<{ dir: string; image: string; out: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-matte-grid-"));
  const image = path.join(dir, "grid.png");
  const out = path.join(dir, "out");
  await makeGrid(image, mutation);
  return { dir, image, out };
}

describe("extractMatteGrid", () => {
  it("writes semantically named transparent PNGs on a fixed normalized canvas", async () => {
    const { dir, image, out } = await fixture();
    const result = await extractMatteGrid(image, out, options());

    expect(result.items.map((item) => item.file)).toEqual(KEYS.map((key) => `${key}.png`));
    expect(result.matteColor).toEqual(MATTE);
    expect(result.matteColorSource).toBe("provided");
    for (const item of result.items) {
      const png = PNG.sync.read(await fs.readFile(item.path));
      expect([png.width, png.height]).toEqual([64, 64]);
      expect(png.data[3]).toBe(0);
      expect(item.geometry.normalized.padding).toBe(8);
      expect(item.geometry.normalized.x).toBeGreaterThanOrEqual(8);
      expect(item.geometry.normalized.y).toBeGreaterThanOrEqual(8);
      expect(item.qa.foregroundRatio).toBeGreaterThan(0);
      expect(item.qa.edgeTouchPixels).toBe(0);
    }
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("emits webp cells with the .webp extension when format: 'webp'", async () => {
    const { dir, image, out } = await fixture();
    const result = await extractMatteGrid(image, out, options({ format: "webp", quality: 80 }));

    expect(result.items.map((item) => item.file)).toEqual(KEYS.map((key) => `${key}.webp`));
    for (const item of result.items) {
      const buf = await fs.readFile(item.path);
      // WebP RIFF signature: "RIFF"...."WEBP"
      expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(buf.subarray(8, 12).toString("ascii")).toBe("WEBP");
      // VP8X chunk (extended) indicates an alpha-capable container; webp with alpha is "VP8X" + alpha flag.
      // At minimum, the file must decode as webp and not be PNG.
      expect(buf.subarray(0, 8).toString("hex")).not.toMatch(/^89504e47/);
    }
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("supports semantic subsets and preserves requested order", async () => {
    const { dir, image, out } = await fixture();
    const result = await extractMatteGrid(image, out, options({
      subset: ["not-found", "empty"],
      chroma: { matteColor: "auto", pipeline: "v1", threshold: 10, softness: 10 },
    }));
    expect(result.items.map((item) => item.key)).toEqual(["not-found", "empty"]);
    expect(result.matteColorSource).toBe("auto-sampled");
    expect(await fs.readdir(out)).toEqual(["empty.png", "not-found.png"]);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("rejects an empty cell before creating the output directory", async () => {
    const { dir, image, out } = await fixture({ emptyCell: 3 });
    await expect(extractMatteGrid(image, out, options())).rejects.toThrow(/empty \(cell 3\): empty foreground/);
    await expect(fs.access(out)).rejects.toThrow();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("rejects foreground touching a cell edge", async () => {
    const { dir, image, out } = await fixture({ edgeTouchCell: 0 });
    await expect(extractMatteGrid(image, out, options())).rejects.toThrow(/welcome \(cell 0\): edge touch ratio/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("rejects foreground outside the configured ratio range", async () => {
    const { dir, image, out } = await fixture({ oversizedCell: 5 });
    await expect(extractMatteGrid(image, out, options({ qa: { maxForegroundRatio: 0.8 } }))).rejects.toThrow(
      /success \(cell 5\): foreground ratio .* above 0.8000/,
    );
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("rejects mapping indices outside the grid", async () => {
    const { dir, image, out } = await fixture();
    await expect(extractMatteGrid(image, out, options({ mapping: { welcome: 9 } }))).rejects.toThrow(/outside 0\.\.8/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("rejects duplicate semantic keys and duplicate cell indices", async () => {
    const { dir, image, out } = await fixture();
    await expect(extractMatteGrid(image, out, options({ mapping: [
      { key: "welcome", index: 0 }, { key: "welcome", index: 1 },
    ] }))).rejects.toThrow(/duplicate semantic key/);
    await expect(extractMatteGrid(image, out, options({ mapping: [
      { key: "welcome", index: 0 }, { key: "cozy", index: 0 },
    ] }))).rejects.toThrow(/duplicate mapping index/);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PNG } from "pngjs";
import { extractMatteGrid } from "../src/index.js";

async function makeGrid(file: string): Promise<void> {
  const width = 60;
  const height = 30;
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const foreground = (x >= 8 && x < 22 || x >= 38 && x < 52) && y >= 7 && y < 23;
      png.data[offset] = foreground ? 20 : 255;
      png.data[offset + 1] = foreground ? 180 : 0;
      png.data[offset + 2] = foreground ? 40 : 255;
      png.data[offset + 3] = 255;
    }
  }
  await fs.writeFile(file, PNG.sync.write(png));
}

describe("extractMatteGrid atomic publishing", () => {
  afterEach(() => vi.restoreAllMocks());

  it("restores the prior complete output when publishing the staged replacement fails", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-matte-grid-atomic-"));
    const image = path.join(dir, "grid.png");
    const out = path.join(dir, "out");
    await makeGrid(image);
    await fs.mkdir(out);
    await fs.writeFile(path.join(out, "previous.txt"), "complete previous output");

    const rename = fs.rename.bind(fs);
    let calls = 0;
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      calls++;
      if (calls === 2) throw new Error("induced staged publish failure");
      return rename(from, to);
    });

    await expect(extractMatteGrid(image, out, {
      rows: 1,
      cols: 2,
      mapping: ["first", "second"],
      strategy: "equal-cell",
      chroma: { matteColor: [255, 0, 255], pipeline: "v1", threshold: 10, softness: 10 },
      normalize: { canvasSize: 64, padding: 8 },
      overwrite: true,
    })).rejects.toThrow(/induced staged publish failure/);

    expect(await fs.readdir(out)).toEqual(["previous.txt"]);
    expect(await fs.readFile(path.join(out, "previous.txt"), "utf8")).toBe("complete previous output");
    expect((await fs.readdir(dir)).filter((name) => name.startsWith(".out."))).toEqual([]);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

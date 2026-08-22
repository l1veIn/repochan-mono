import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PNG } from "pngjs";
import { AlphaAssertError, assertImageAlpha } from "../src/assert-alpha.js";

function makePng(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number], colorType: 2 | 6 = 6): Buffer {
  const png = new PNG({ width, height, colorType });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * width + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ie-assert-alpha-"));
}

describe("assertImageAlpha", () => {
  it("passes an RGBA subject with transparent field and copies to out", async () => {
    const dir = await tmpDir();
    const src = path.join(dir, "in.png");
    const out = path.join(dir, "out.png");
    await fs.writeFile(src, makePng(32, 32, (x, y) => {
      const inside = x >= 8 && x < 24 && y >= 8 && y < 24;
      return inside ? [40, 80, 200, 255] : [0, 0, 0, 0];
    }));
    const result = await assertImageAlpha(src, out);
    expect(result.stats.hasAlpha).toBe(true);
    expect(result.stats.transparentRatio).toBeGreaterThan(0.5);
    expect(result.stats.corners.tl).toBe(0);
    expect(await fs.readFile(out)).toEqual(await fs.readFile(src));
  });

  it("rejects RGB with no alpha channel as missing_alpha", async () => {
    const dir = await tmpDir();
    const src = path.join(dir, "rgb.png");
    const out = path.join(dir, "out.png");
    const { loadSharp } = await import("../src/sharp.js");
    const sharp = (await loadSharp()).default;
    await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 248, g: 248, b: 248 } },
    }).png().toFile(src);
    await expect(assertImageAlpha(src, out)).rejects.toMatchObject({
      name: "AlphaAssertError",
      defects: expect.arrayContaining([expect.objectContaining({ code: "missing_alpha" })]),
    });
    await expect(fs.access(out)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects fully opaque RGBA as insufficient_transparent and opaque_corners", async () => {
    const dir = await tmpDir();
    const src = path.join(dir, "opaque.png");
    await fs.writeFile(src, makePng(16, 16, () => [10, 20, 30, 255]));
    try {
      await assertImageAlpha(src, path.join(dir, "out.png"));
      throw new Error("expected AlphaAssertError");
    } catch (error) {
      expect(error).toBeInstanceOf(AlphaAssertError);
      const codes = (error as AlphaAssertError).defects.map((d) => d.code);
      expect(codes).toContain("insufficient_transparent");
      expect(codes).toContain("opaque_corners");
    }
  });
});

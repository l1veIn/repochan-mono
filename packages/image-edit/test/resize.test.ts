import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PNG } from "pngjs";
import { resizeImage, generateIco } from "../src/index.js";

/**
 * Build a real solid-color PNG via pngjs for resize/ico tests.
 * These exercise pinned Sharp at runtime.
 */
async function makeSolidPng(width: number, height: number, r: number, g: number, b: number): Promise<Buffer> {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

async function tmpDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("resizeImage", () => {
  it("resizes to multiple square sizes", async () => {
    const dir = await tmpDir("ie-resize-");
    const srcPath = path.join(dir, "icon.png");
    const outDir = path.join(dir, "out");
    await fs.writeFile(srcPath, await makeSolidPng(512, 512, 100, 200, 50));

    const result = await resizeImage(srcPath, outDir, {
      targets: [{ width: 16 }, { width: 32 }, { width: 48 }, { width: 180 }],
    });

    expect(result.sourceWidth).toBe(512);
    expect(result.sourceHeight).toBe(512);
    expect(result.outputs).toHaveLength(4);
    // default naming
    expect(result.outputs.map((o) => o.file)).toEqual([
      "icon-16x16.png",
      "icon-32x32.png",
      "icon-48x48.png",
      "icon-180x180.png",
    ]);
    // files exist
    for (const o of result.outputs) {
      const stat = await fs.stat(o.path);
      expect(stat.isFile()).toBe(true);
    }
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("preserves aspect ratio when height is omitted (non-square source)", async () => {
    const dir = await tmpDir("ie-aspect-");
    const srcPath = path.join(dir, "wide.png");
    const outDir = path.join(dir, "out");
    await fs.writeFile(srcPath, await makeSolidPng(400, 200, 255, 0, 0)); // 2:1

    const result = await resizeImage(srcPath, outDir, { targets: [{ width: 100 }] });
    expect(result.outputs[0].width).toBe(100);
    expect(result.outputs[0].height).toBe(50); // 100 * (200/400) = 50
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("supports custom filenames", async () => {
    const dir = await tmpDir("ie-naming-");
    const srcPath = path.join(dir, "src.png");
    const outDir = path.join(dir, "out");
    await fs.writeFile(srcPath, await makeSolidPng(256, 256, 0, 0, 255));

    const result = await resizeImage(srcPath, outDir, {
      targets: [
        { width: 32, filename: "favicon-32.png" },
        { width: 16, filename: "favicon-16.png" },
      ],
    });
    expect(result.outputs.map((o) => o.file)).toEqual(["favicon-32.png", "favicon-16.png"]);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("refuses to overwrite without overwrite=true", async () => {
    const dir = await tmpDir("ie-ow-");
    const srcPath = path.join(dir, "src.png");
    const outDir = path.join(dir, "out");
    await fs.writeFile(srcPath, await makeSolidPng(128, 128, 1, 2, 3));
    await resizeImage(srcPath, outDir, { targets: [{ width: 32 }] });

    // second call without overwrite should fail
    await expect(resizeImage(srcPath, outDir, { targets: [{ width: 32 }] })).rejects.toThrow(/already exists/);
    // with overwrite it succeeds
    const r2 = await resizeImage(srcPath, outDir, { targets: [{ width: 32 }], overwrite: true });
    expect(r2.outputs).toHaveLength(1);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("rejects empty targets", async () => {
    const dir = await tmpDir("ie-empty-");
    const srcPath = path.join(dir, "src.png");
    const outDir = path.join(dir, "out");
    await fs.writeFile(srcPath, await makeSolidPng(64, 64, 0, 0, 0));
    await expect(resizeImage(srcPath, outDir, { targets: [] })).rejects.toThrow(/at least one target/);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("generateIco", () => {
  it("generates a valid multi-size .ico file", async () => {
    const dir = await tmpDir("ie-ico-");
    const srcPath = path.join(dir, "icon.png");
    const outPath = path.join(dir, "favicon.ico");
    await fs.writeFile(srcPath, await makeSolidPng(512, 512, 200, 100, 50));

    const result = await generateIco(srcPath, outPath, { sizes: [16, 32, 48] });

    expect(result.sourceFile).toBe("icon.png");
    expect(result.sizes).toHaveLength(3);
    expect(result.outFile).toBe(outPath);

    // file exists and is non-trivially sized
    const stat = await fs.stat(outPath);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(100); // ICO header + 3 PNGs

    // verify ICO binary: header magic
    const buf = await fs.readFile(outPath);
    expect(buf.readUInt16LE(0)).toBe(0); // reserved
    expect(buf.readUInt16LE(2)).toBe(1); // type = icon
    expect(buf.readUInt16LE(4)).toBe(3); // count = 3

    // first entry: 16x16
    expect(buf.readUInt8(6)).toBe(16); // width
    expect(buf.readUInt8(7)).toBe(16); // height

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("uses default sizes when none specified", async () => {
    const dir = await tmpDir("ie-ico-default-");
    const srcPath = path.join(dir, "icon.png");
    const outPath = path.join(dir, "favicon.ico");
    await fs.writeFile(srcPath, await makeSolidPng(512, 512, 0, 255, 0));

    const result = await generateIco(srcPath, outPath);
    expect(result.sizes.map((s) => s.width)).toEqual([16, 32, 48, 180, 256]);

    // verify count in header
    const buf = await fs.readFile(outPath);
    expect(buf.readUInt16LE(4)).toBe(5); // 5 images
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("rejects non-.ico output path", async () => {
    const dir = await tmpDir("ie-ico-bad-");
    const srcPath = path.join(dir, "icon.png");
    await fs.writeFile(srcPath, await makeSolidPng(128, 128, 0, 0, 0));
    await expect(generateIco(srcPath, path.join(dir, "out.png"))).rejects.toThrow(/must end with .ico/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("refuses to overwrite without overwrite=true", async () => {
    const dir = await tmpDir("ie-ico-ow-");
    const srcPath = path.join(dir, "icon.png");
    const outPath = path.join(dir, "favicon.ico");
    await fs.writeFile(srcPath, await makeSolidPng(256, 256, 10, 20, 30));
    await generateIco(srcPath, outPath, { sizes: [16] });

    await expect(generateIco(srcPath, outPath, { sizes: [16] })).rejects.toThrow(/already exists/);
    // overwrite works
    await generateIco(srcPath, outPath, { sizes: [16], overwrite: true });
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("encodes 256 as 0 in the ICO entry (ICO convention)", async () => {
    const dir = await tmpDir("ie-ico256-");
    const srcPath = path.join(dir, "icon.png");
    const outPath = path.join(dir, "favicon.ico");
    await fs.writeFile(srcPath, await makeSolidPng(512, 512, 255, 255, 0));

    await generateIco(srcPath, outPath, { sizes: [256] });
    const buf = await fs.readFile(outPath);
    // 256 is encoded as 0 in ICO format
    expect(buf.readUInt8(6)).toBe(0); // width byte = 0 means 256
    expect(buf.readUInt8(7)).toBe(0); // height byte = 0 means 256
    await fs.rm(dir, { recursive: true, force: true });
  });
});

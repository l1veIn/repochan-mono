import { afterEach, describe, it, expect, vi } from "vitest";
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

afterEach(() => vi.restoreAllMocks());

describe("resizeImage", () => {
  it.each(["../outside.png", "..\\outside.png"])("rejects a filename outside the output directory: %s", async (filename) => {
    const dir = await tmpDir("ie-resize-path-");
    try {
      const source = path.join(dir, "source.png");
      const outside = path.join(dir, "outside.png");
      await fs.writeFile(source, await makeSolidPng(80, 40, 255, 0, 0));
      await fs.writeFile(outside, "outside prior bytes");
      await expect(resizeImage(source, path.join(dir, "out"), { targets: [{ width: 16, filename }], overwrite: true }))
        .rejects.toThrow(/safe basename/);
      expect(await fs.readFile(outside, "utf8")).toBe("outside prior bytes");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("rejects duplicate filenames before replacing their prior content", async () => {
    const dir = await tmpDir("ie-resize-duplicate-");
    try {
      const source = path.join(dir, "source.png");
      const out = path.join(dir, "out");
      await fs.writeFile(source, await makeSolidPng(80, 40, 255, 0, 0));
      await fs.mkdir(out);
      await fs.writeFile(path.join(out, "same.png"), "prior image");
      await expect(resizeImage(source, out, {
        targets: [{ width: 16, filename: "same.png" }, { width: 32, filename: "same.png" }], overwrite: true,
      })).rejects.toThrow(/unique/);
      expect(await fs.readFile(path.join(out, "same.png"), "utf8")).toBe("prior image");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("preflights later dimensions without replacing an earlier target", async () => {
    const dir = await tmpDir("ie-resize-dimensions-");
    try {
      const source = path.join(dir, "source.png");
      const out = path.join(dir, "out");
      await fs.writeFile(source, await makeSolidPng(80, 40, 255, 0, 0));
      await fs.mkdir(out);
      await fs.writeFile(path.join(out, "first.png"), "prior image");
      await expect(resizeImage(source, out, {
        targets: [{ width: 16, filename: "first.png" }, { width: 0, filename: "second.png" }], overwrite: true,
      })).rejects.toThrow(/positive integers/);
      expect(await fs.readFile(path.join(out, "first.png"), "utf8")).toBe("prior image");
      expect(await fs.readdir(out)).toEqual(["first.png"]);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("preflights an existing later target without publishing earlier new files", async () => {
    const dir = await tmpDir("ie-resize-existing-");
    try {
      const source = path.join(dir, "source.png");
      const out = path.join(dir, "out");
      await fs.writeFile(source, await makeSolidPng(80, 40, 255, 0, 0));
      await fs.mkdir(out);
      await fs.writeFile(path.join(out, "second.png"), "prior image");
      await expect(resizeImage(source, out, {
        targets: [{ width: 16, filename: "first.png" }, { width: 32, filename: "second.png" }],
      })).rejects.toThrow(/already exists/);
      expect(await fs.readdir(out)).toEqual(["second.png"]);
      expect(await fs.readFile(path.join(out, "second.png"), "utf8")).toBe("prior image");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it.each([false, true])("rolls back the file set and retains recovery backups if necessary (rollbackFailure=%s)", async (rollbackFailure) => {
    const dir = await tmpDir("ie-resize-publish-");
    try {
      const source = path.join(dir, "source.png");
      const out = path.join(dir, "out");
      await fs.writeFile(source, await makeSolidPng(80, 40, 255, 0, 0));
      await fs.mkdir(out);
      for (const [file, text] of [["first.png", "prior first"], ["second.png", "prior second"], ["unrelated.txt", "keep me"]]) {
        await fs.writeFile(path.join(out, file), text);
      }
      const rename = fs.rename.bind(fs);
      vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
        if (String(from).endsWith(`${path.sep}files${path.sep}second.png`)) {
          throw new Error("induced second publication failure");
        }
        if (rollbackFailure && String(from).endsWith(`${path.sep}backups${path.sep}0`)) {
          throw new Error("induced restore failure");
        }
        return rename(from, to);
      });
      await expect(resizeImage(source, out, {
        targets: [{ width: 16, filename: "first.png" }, { width: 32, filename: "second.png" }], overwrite: true,
      })).rejects.toThrow(rollbackFailure ? /recovery files remain at/ : /second publication failure/);
      expect(await fs.readFile(path.join(out, "second.png"), "utf8")).toBe("prior second");
      expect(await fs.readFile(path.join(out, "unrelated.txt"), "utf8")).toBe("keep me");
      const recovery = (await fs.readdir(dir)).filter((file) => file.startsWith(".out.resize-"));
      expect(recovery).toHaveLength(rollbackFailure ? 1 : 0);
      const first = rollbackFailure ? path.join(dir, recovery[0], "backups", "0") : path.join(out, "first.png");
      expect(await fs.readFile(first, "utf8")).toBe("prior first");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("keeps a competing later target and removes earlier batch outputs on a no-overwrite publish race", async () => {
    const dir = await tmpDir("ie-resize-race-");
    try {
      const source = path.join(dir, "source.png");
      const out = path.join(dir, "out");
      await fs.writeFile(source, await makeSolidPng(80, 40, 255, 0, 0));
      const link = fs.link.bind(fs);
      vi.spyOn(fs, "link").mockImplementation(async (from, to) => {
        if (String(to) === path.join(out, "second.png")) await fs.writeFile(to, "competing image");
        return link(from, to);
      });
      await expect(resizeImage(source, out, {
        targets: [{ width: 16, filename: "first.png" }, { width: 32, filename: "second.png" }],
      })).rejects.toMatchObject({ code: "EEXIST" });
      expect(await fs.readdir(out)).toEqual(["second.png"]);
      expect(await fs.readFile(path.join(out, "second.png"), "utf8")).toBe("competing image");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("replaces an in-place target from buffered input and preserves unrelated directory files", async () => {
    const dir = await tmpDir("ie-resize-in-place-");
    try {
      const source = path.join(dir, "source.png");
      await fs.writeFile(source, await makeSolidPng(80, 40, 255, 0, 0));
      await fs.writeFile(path.join(dir, "unrelated.txt"), "keep me");
      await resizeImage(source, dir, { targets: [{ width: 16, filename: "source.png" }], overwrite: true });
      const encoded = PNG.sync.read(await fs.readFile(source));
      expect({ width: encoded.width, height: encoded.height }).toEqual({ width: 16, height: 8 });
      expect(await fs.readFile(path.join(dir, "unrelated.txt"), "utf8")).toBe("keep me");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

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

  it("reports the encoded dimensions when inside fits a rectangular source within a square", async () => {
    const dir = await tmpDir("ie-inside-");
    try {
      const srcPath = path.join(dir, "wide.png");
      await fs.writeFile(srcPath, await makeSolidPng(80, 40, 255, 0, 0));
      const result = await resizeImage(srcPath, path.join(dir, "out"), {
        targets: [{ width: 32, height: 32 }],
        fit: "inside",
      });
      const encoded = PNG.sync.read(await fs.readFile(result.outputs[0].path));
      expect({ width: encoded.width, height: encoded.height }).toEqual({ width: 32, height: 16 });
      expect(result.outputs[0]).toMatchObject({ width: encoded.width, height: encoded.height });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
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
  it("packs rectangular sources on transparent square canvases matching each ICO entry", async () => {
    const dir = await tmpDir("ie-ico-wide-");
    try {
      const srcPath = path.join(dir, "wide.png");
      const outPath = path.join(dir, "favicon.ico");
      await fs.writeFile(srcPath, await makeSolidPng(80, 40, 255, 0, 0));
      await generateIco(srcPath, outPath, { sizes: [16, 32, 256] });
      const ico = await fs.readFile(outPath);
      for (let i = 0; i < ico.readUInt16LE(4); i++) {
        const entry = 6 + i * 16;
        const width = ico[entry] || 256;
        const height = ico[entry + 1] || 256;
        const offset = ico.readUInt32LE(entry + 12);
        const encoded = PNG.sync.read(ico.subarray(offset, offset + ico.readUInt32LE(entry + 8)));
        expect({ width: encoded.width, height: encoded.height }).toEqual({ width, height });
        expect(encoded.data[3]).toBe(0);
        const center = ((height / 2) * width + width / 2) * 4;
        expect([...encoded.data.subarray(center, center + 4)]).toEqual([255, 0, 0, 255]);
        const opaquePixels = encoded.data.filter((_, index) => index % 4 === 3 && encoded.data[index] === 255).length;
        expect(opaquePixels).toBe(width * height / 2);
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it.each([[], [0], [257], [16.5]].map((sizes) => ({ sizes })))("rejects sizes that cannot be represented by ICO entries: $sizes", async ({ sizes }) => {
    const dir = await tmpDir("ie-ico-invalid-");
    try {
      const outPath = path.join(dir, "favicon.ico");
      await expect(generateIco(path.join(dir, "source.png"), outPath, { sizes })).rejects.toThrow(/integers from 1 to 256/);
      await expect(fs.stat(outPath)).rejects.toThrow();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

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

import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PNG } from "pngjs";
import { framesToGif, type FramesToGifOptions } from "../src/gif-frames.js";
import { loadSharp } from "../src/sharp.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function frames(transparent: boolean): Promise<{ dir: string; paths: string[] }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-gif-"));
  directories.push(dir);
  const paths: string[] = [];
  for (let frame = 0; frame < 2; frame++) {
    const png = new PNG({ width: 20, height: 20 });
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const offset = (y * 20 + x) * 4;
        const inside = x >= 5 && x < 15 && y >= 5 && y < 15;
        png.data[offset] = frame === 0 ? 255 : 0;
        png.data[offset + 1] = frame === 1 ? 255 : 0;
        png.data[offset + 2] = 0;
        png.data[offset + 3] = transparent && !inside ? 0 : 255;
      }
    }
    const file = path.join(dir, `frame-${frame}.png`);
    await fs.writeFile(file, PNG.sync.write(png));
    paths.push(file);
  }
  return { dir, paths };
}

function encodedDelays(bytes: Buffer): number[] {
  const delays: number[] = [];
  const marker = Buffer.from([0x21, 0xf9, 0x04]);
  let offset = bytes.indexOf(marker);
  while (offset !== -1) {
    delays.push(bytes.readUInt16LE(offset + 4) * 10);
    offset = bytes.indexOf(marker, offset + 8);
  }
  return delays;
}

describe("framesToGif", () => {
  it.each([
    { options: { fps: 30 }, expected: [30, 30] },
    { options: { delay: 15 }, expected: [20, 20] },
    { options: { delay: [33, 127] }, expected: [30, 130] },
    { options: { delay: [0, 655350] }, expected: [0, 655350] },
  ])("reports the delay actually written into the GIF bytes for $options", async ({ options, expected }) => {
    const { dir, paths } = await frames(false);
    const output = path.join(dir, "animation.gif");
    const result = await framesToGif(paths, output, options);
    expect(encodedDelays(await fs.readFile(output))).toEqual(expected);
    expect(result.delay).toBe(expected[0]);
  });

  it.each<FramesToGifOptions>([
    { fps: 0 }, { fps: -1 }, { fps: NaN }, { fps: Infinity },
    { fps: 0.001 },
    { delay: -10 }, { delay: NaN }, { delay: Infinity }, { delay: 655351 },
    { delay: [100, -1] },
    { delay: [] }, { delay: [100] }, { delay: [100, 200, 300] },
  ])("rejects invalid timing $0 without replacing an existing output", async (options) => {
    const { dir, paths } = await frames(false);
    const output = path.join(dir, "animation.gif");
    await fs.writeFile(output, "preserve old output");
    await expect(framesToGif(paths, output, { ...options, overwrite: true })).rejects.toThrow(/fps|delay/);
    expect(await fs.readFile(output, "utf8")).toBe("preserve old output");
  });

  it.each([0, 3, 65535])("writes the requested repeat count %i in the GIF application extension", async (loop) => {
    const { dir, paths } = await frames(false);
    const output = path.join(dir, "animation.gif");
    await framesToGif(paths, output, { loop });
    const bytes = await fs.readFile(output);
    const application = bytes.indexOf(Buffer.from("NETSCAPE2.0"));
    expect(application).toBeGreaterThan(0);
    expect(bytes.readUInt16LE(application + 13)).toBe(loop);
  });

  it("omits the repeat extension for a single playback", async () => {
    const { dir, paths } = await frames(false);
    const output = path.join(dir, "animation.gif");
    await framesToGif(paths, output, { loop: -1 });
    expect((await fs.readFile(output)).includes(Buffer.from("NETSCAPE2.0"))).toBe(false);
  });

  it.each([2, 256])("preserves transparent backgrounds and opaque colored content with %i palette entries", async (palette) => {
    const { dir, paths } = await frames(true);
    const output = path.join(dir, "animation.gif");
    await framesToGif(paths, output, { palette, loop: 3, delay: [100, 200] });
    const sharp = (await loadSharp()).default;
    const metadata = await sharp(output, { animated: true }).metadata();
    expect(metadata.pages).toBe(2);
    expect(metadata.hasAlpha).toBe(true);
    expect(metadata.delay).toEqual([100, 200]);
    const { data, info } = await sharp(output, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let frame = 0; frame < 2; frame++) {
      const start = frame * 20 * info.width * info.channels;
      expect(data[start + 3]).toBe(0);
      const center = start + (10 * info.width + 10) * info.channels;
      expect([...data.subarray(center, center + 4)]).toEqual(frame === 0 ? [255, 0, 0, 255] : [0, 255, 0, 255]);
    }
  });

  it("can encode fully transparent frames", async () => {
    const { dir, paths } = await frames(true);
    for (const file of paths) {
      const png = PNG.sync.read(await fs.readFile(file));
      for (let offset = 3; offset < png.data.length; offset += 4) png.data[offset] = 0;
      await fs.writeFile(file, PNG.sync.write(png));
    }
    const output = path.join(dir, "animation.gif");
    await framesToGif(paths, output);
    const sharp = (await loadSharp()).default;
    const { data } = await sharp(output, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([...data].filter((_, offset) => offset % 4 === 3).every((alpha) => alpha === 0)).toBe(true);
  });
});

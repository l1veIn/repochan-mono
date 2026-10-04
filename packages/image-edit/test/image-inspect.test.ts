import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PNG } from "pngjs";
import { inspectImage } from "../src/image-inspect.js";
import { loadSharp } from "../src/sharp.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function fixture(): Promise<{ image: string; bytes: Buffer }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-inspect-"));
  directories.push(dir);
  const png = new PNG({ width: 32, height: 32 });
  png.data.fill(255);
  const bytes = PNG.sync.write(png);
  const image = path.join(dir, "image.png");
  return { image, bytes };
}

describe("inspectImage", () => {
  it("reports decoded bytes and releases the input for rename/removal", async () => {
    const { image, bytes } = await fixture();
    await fs.writeFile(image, bytes);
    expect(await inspectImage(image)).toEqual({ format: "png", width: 32, height: 32 });
    await fs.rename(image, `${image}.moved`);
    await fs.unlink(`${image}.moved`);
  });

  it("rejects corrupt IDAT pixels even though Sharp can still read the PNG metadata", async () => {
    const { image, bytes } = await fixture();
    const idat = bytes.indexOf(Buffer.from("IDAT"));
    expect(idat).toBeGreaterThan(0);
    bytes[idat + 4] = 0; // invalidate the zlib stream header without changing IHDR
    await fs.writeFile(image, bytes);
    const sharp = (await loadSharp()).default;
    expect(await sharp(bytes).metadata()).toMatchObject({ format: "png", width: 32, height: 32 });
    await expect(inspectImage(image)).rejects.toThrow(/Unsupported or unreadable image/);
    expect(await fs.readFile(image)).toEqual(bytes);
  });
});

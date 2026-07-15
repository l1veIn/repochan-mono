import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import { computeTileSeamMetrics, validateSeamlessTile } from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function fixture(kind: "seamless" | "mismatch", width = 8, height = 6): Promise<{ dir: string; image: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-seam-"));
  tempDirs.push(dir);
  const image = path.join(dir, `${kind}.png`);
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      png.data[offset] = kind === "mismatch" && x === width - 1 ? 255 : 0;
      png.data[offset + 1] = kind === "mismatch" && x === width - 1 ? 255 : 0;
      png.data[offset + 2] = kind === "mismatch" && x === width - 1 ? 255 : 0;
      png.data[offset + 3] = 255;
    }
  }
  await fs.writeFile(image, PNG.sync.write(png));
  return { dir, image };
}

describe("seam validation", () => {
  it("passes a perfectly seamless tile", async () => {
    const { image } = await fixture("seamless");
    const result = await validateSeamlessTile(image, { threshold: 0 });

    expect(result.pass).toBe(true);
    expect(result.metrics).toEqual({
      leftRight: { samples: 6, meanDelta: 0, maxDelta: 0 },
      topBottom: { samples: 8, meanDelta: 0, maxDelta: 0 },
      score: 0,
    });
    expect(result.metric.id).toBe("premultiplied-rgba-l1-v1");
    expect(result.provenance).toMatchObject({ operation: "validate-seamless-tile", version: 1, decodedChannels: 4 });
  });

  it("fails an obvious opposing-edge mismatch", async () => {
    const { image } = await fixture("mismatch");
    const result = await validateSeamlessTile(image, { threshold: 0.1 });

    expect(result.pass).toBe(false);
    expect(result.metrics.leftRight.meanDelta).toBe(0.75);
    expect(result.metrics.leftRight.maxDelta).toBe(0.75);
    expect(result.metrics.topBottom.meanDelta).toBe(0);
    expect(result.metrics.score).toBe(0.75);
  });

  it("treats the threshold boundary as inclusive", async () => {
    const { image } = await fixture("mismatch");
    const boundary = await validateSeamlessTile(image, { threshold: 0.75 });
    const below = await validateSeamlessTile(image, { threshold: 0.75 - Number.EPSILON });

    expect(boundary.pass).toBe(true);
    expect(below.pass).toBe(false);
  });

  it("writes an exact 3x3 repetition board", async () => {
    const { dir, image } = await fixture("seamless", 7, 5);
    const boardOutFile = path.join(dir, "qa", "board.png");
    const result = await validateSeamlessTile(image, { boardOutFile });
    const board = PNG.sync.read(await fs.readFile(boardOutFile));

    expect([board.width, board.height]).toEqual([21, 15]);
    expect(result.board).toEqual({ outFile: boardOutFile, rows: 3, cols: 3, width: 21, height: 15 });
  });

  it("ignores hidden RGB differences in fully transparent edge pixels", () => {
    const rgba = new Uint8Array([
      255, 0, 0, 0, 0, 255, 0, 0,
      0, 0, 255, 0, 255, 255, 255, 0,
    ]);
    expect(computeTileSeamMetrics(rgba, 2, 2).score).toBe(0);
  });
});

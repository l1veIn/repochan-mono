import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PNG } from "pngjs";
import {
  runChromaPipeline,
  keyTintScore,
  extractChromaKey,
  assertMaxDimensions,
  chromaKeyImage,
  DEFAULT_MAX_DIMENSION,
  type MatteColor,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers: synthetic raw RGBA buffers
// ---------------------------------------------------------------------------

const MAGENTA: MatteColor = [255, 0, 255];

type RGBA = [number, number, number, number];

function makeBuffer(width: number, height: number, fill: (x: number, y: number) => RGBA): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = fill(x, y);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }
  return data;
}

function solid(color: RGBA): (x: number, y: number) => RGBA {
  return () => color;
}

function px(buf: Buffer, width: number, x: number, y: number): RGBA {
  const idx = (y * width + x) * 4;
  return [buf[idx], buf[idx + 1], buf[idx + 2], buf[idx + 3]];
}

// ---------------------------------------------------------------------------
// keyTintScore (design doc §1.2 normative formula)
// ---------------------------------------------------------------------------

describe("keyTintScore", () => {
  it("scores a pure magenta key as (R+B)/2 - G", () => {
    expect(keyTintScore([255, 0, 255], MAGENTA)).toBe(255);
    expect(keyTintScore([100, 50, 200], MAGENTA)).toBe(100); // (100+200)/2 - 50
    expect(keyTintScore([255, 255, 255], MAGENTA)).toBe(0);
    expect(keyTintScore([0, 200, 100], MAGENTA)).toBe(-150);
  });

  it("scores a pure green key as G - (R+B)/2", () => {
    const green: MatteColor = [0, 255, 0];
    expect(keyTintScore([0, 255, 0], green)).toBe(255);
    expect(keyTintScore([255, 0, 255], green)).toBe(-255);
  });

  it("returns 0 when the key has no clear channel split", () => {
    expect(keyTintScore([10, 20, 30], [128, 128, 128])).toBe(0);
    expect(keyTintScore([10, 20, 30], [200, 200, 200])).toBe(0); // no unkeyed channel
  });
});

// ---------------------------------------------------------------------------
// assertMaxDimensions (design doc §10)
// ---------------------------------------------------------------------------

describe("assertMaxDimensions", () => {
  it("accepts dimensions at the bound", () => {
    expect(() => assertMaxDimensions(8192, 8192)).not.toThrow();
    expect(() => assertMaxDimensions(1, 1)).not.toThrow();
  });

  it("throws above the bound", () => {
    expect(() => assertMaxDimensions(8193, 10)).toThrow(/image exceeds max dimension 8192/);
    expect(() => assertMaxDimensions(10, 8193)).toThrow(/image exceeds max dimension 8192/);
  });

  it("respects a configurable maxDimension", () => {
    expect(() => assertMaxDimensions(100, 100, 50)).toThrow(/image exceeds max dimension 50/);
    expect(() => assertMaxDimensions(50, 50, 50)).not.toThrow();
  });

  it("is applied by runChromaPipeline", () => {
    expect(() => runChromaPipeline(Buffer.alloc(4), DEFAULT_MAX_DIMENSION + 1, 1, 4, {})).toThrow(
      /image exceeds max dimension/,
    );
  });
});

// ---------------------------------------------------------------------------
// v1 track: byte-identical regression
// ---------------------------------------------------------------------------

describe("runChromaPipeline v1", () => {
  const width = 20;
  const height = 20;
  const subject: RGBA = [100, 200, 50, 255];
  const data = makeBuffer(width, height, (x, y) =>
    x >= 5 && x < 15 && y >= 5 && y < 15 ? subject : [255, 0, 255, 255],
  );

  it("explicit pipeline v1 (escape hatch) matches extractChromaKey byte-for-byte", () => {
    const legacy = extractChromaKey(data, width, height, 4, MAGENTA);
    const result = runChromaPipeline(data, width, height, 4, { pipeline: "v1", matteColor: MAGENTA });
    expect(result.pipeline).toBe("v1");
    expect(result.stats).toBeUndefined();
    expect(Buffer.compare(result.data, legacy)).toBe(0);
  });

  it("defaults to pipeline v2 (PR7)", () => {
    const result = runChromaPipeline(data, width, height, 4, { matteColor: MAGENTA });
    expect(result.pipeline).toBe("v2");
    expect(result.stats).toBeDefined();
    // v2 hard-cuts the magenta background and keeps the subject.
    expect(result.stats!.keyedPixels).toBeGreaterThan(0);
    expect(result.stats!.subjectPixels).toBe(100); // 10x10 subject block, tint ≪ 18
  });

  it("explicit pipeline v1 honors threshold/softness/spillSuppression", () => {
    const legacy = extractChromaKey(data, width, height, 4, MAGENTA, 40, 10, 0.5);
    const result = runChromaPipeline(data, width, height, 4, {
      pipeline: "v1",
      matteColor: MAGENTA,
      threshold: 40,
      softness: 10,
      spillSuppression: 0.5,
    });
    expect(Buffer.compare(result.data, legacy)).toBe(0);
  });

  it("auto-samples the matte from corners when not provided", () => {
    const result = runChromaPipeline(data, width, height, 4, { pipeline: "v1" });
    expect(result.matteColorSource).toBe("auto-sampled");
    expect(result.matteColor[0]).toBeGreaterThanOrEqual(248);
    expect(result.matteColor[1]).toBeLessThanOrEqual(7);
    expect(result.matteColor[2]).toBeGreaterThanOrEqual(248);
  });
});

// ---------------------------------------------------------------------------
// mode: "ycbcr" → Unsupported
// ---------------------------------------------------------------------------

describe("runChromaPipeline mode", () => {
  it("throws Unsupported for ycbcr on both pipelines", () => {
    const data = makeBuffer(2, 2, solid([255, 0, 255, 255]));
    expect(() => runChromaPipeline(data, 2, 2, 4, { mode: "ycbcr" })).toThrow(/Unsupported/);
    expect(() => runChromaPipeline(data, 2, 2, 4, { pipeline: "v2", mode: "ycbcr" })).toThrow(/Unsupported/);
  });
});

// ---------------------------------------------------------------------------
// v2 track: classification, depth BFS, unmix, trapped spill
// ---------------------------------------------------------------------------

describe("runChromaPipeline v2 classification", () => {
  it("classifies KEYED / SUBJECT / BLEND_IN_BAND / BLEND_OUT_OF_BAND", () => {
    // 5x1 strip, one pixel per class (alpha=0 keys regardless of color).
    const data = makeBuffer(5, 1, (x) => {
      switch (x) {
        case 0: return [255, 0, 255, 255]; // dist 0 → KEYED
        case 1: return [140, 130, 140, 255]; // tint 10 < 18 → SUBJECT (dist ≈ 208 > 96)
        case 2: return [255, 100, 255, 255]; // tint 155, dist 100 ≤ 180 → IN_BAND
        case 3: return [255, 100, 0, 255]; // tint 27.5, dist ≈ 274 > 180 → OUT_OF_BAND
        default: return [0, 255, 0, 0]; // alpha 0 → KEYED
      }
    });
    const result = runChromaPipeline(data, 5, 1, 4, { pipeline: "v2", matteColor: MAGENTA });
    expect(result.stats).toMatchObject({
      keyedPixels: 2,
      subjectPixels: 1,
      blendInBandPixels: 1,
      blendOutOfBandPixels: 1,
    });
    // KEYED pixels are scrubbed to (0,0,0,0).
    expect(px(result.data, 5, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(result.data, 5, 4, 0)).toEqual([0, 0, 0, 0]);
    // SUBJECT is never touched.
    expect(px(result.data, 5, 1, 0)).toEqual([140, 130, 140, 255]);
  });

  it("uses threshold=96 for the hard cut by default (not v1's 28)", () => {
    // dist ≈ 53 from the key: keyed by v2, would be partially opaque in v1.
    const data = makeBuffer(1, 1, solid([220, 20, 220, 255]));
    const v2 = runChromaPipeline(data, 1, 1, 4, { pipeline: "v2", matteColor: MAGENTA });
    expect(px(v2.data, 1, 0, 0)).toEqual([0, 0, 0, 0]);
    const v1 = runChromaPipeline(data, 1, 1, 4, { pipeline: "v1", matteColor: MAGENTA });
    expect(v1.data[3]).toBeGreaterThan(0);
  });

  it("treats a low-contrast key (keyTint=0) as classify-only, no unmix", () => {
    const gray: MatteColor = [128, 128, 128];
    const data = makeBuffer(3, 3, (x, y) => (x === 1 && y === 1 ? [200, 200, 200, 255] : [128, 128, 128, 255]));
    const result = runChromaPipeline(data, 3, 3, 4, { pipeline: "v2", matteColor: gray });
    expect(result.stats).toMatchObject({ keyedPixels: 8, subjectPixels: 1, unmixedPixels: 0 });
    expect(px(result.data, 3, 1, 1)).toEqual([200, 200, 200, 255]);
  });
});

describe("runChromaPipeline v2 soft-alpha unmix", () => {
  it("recovers subject RGB + partial alpha from a known blend", () => {
    // observed = 0.5·[60,60,60] + 0.5·magenta = [157.5,30,157.5] → bytes [158,30,158].
    const data = makeBuffer(3, 3, (x, y) => (x === 1 && y === 1 ? [158, 30, 158, 255] : [255, 0, 255, 255]));
    const result = runChromaPipeline(data, 3, 3, 4, { pipeline: "v2", matteColor: MAGENTA });
    const [r, g, b, a] = px(result.data, 3, 1, 1);
    expect(result.stats!.unmixedPixels).toBe(1);
    expect(r).toBeGreaterThanOrEqual(59);
    expect(r).toBeLessThanOrEqual(62);
    expect(g).toBeGreaterThanOrEqual(59);
    expect(g).toBeLessThanOrEqual(62);
    expect(b).toBeGreaterThanOrEqual(59);
    expect(b).toBeLessThanOrEqual(62);
    expect(a).toBe(127); // round(255 · (1 − 128/255))
  });

  it("keeps in-band blends deeper than depth 2 byte-identical", () => {
    // 9x9: keyed border, subject fill, blend center at Chebyshev depth 4.
    const data = makeBuffer(9, 9, (x, y) => {
      if (x === 4 && y === 4) return [158, 30, 158, 255];
      if (x === 0 || x === 8 || y === 0 || y === 8) return [255, 0, 255, 255];
      return [0, 200, 0, 255];
    });
    const result = runChromaPipeline(data, 9, 9, 4, {
      pipeline: "v2",
      matteColor: MAGENTA,
      spillMaxFraction: 0, // isolate the depth guard from trapped-spill
    });
    expect(result.stats!.unmixedPixels).toBe(0);
    expect(px(result.data, 9, 4, 4)).toEqual([158, 30, 158, 255]);
  });

  it("unmixes out-of-band blends at any depth within unmixReach", () => {
    // 9x9: keyed border, subject fill, out-of-band blend center at depth 4.
    const data = makeBuffer(9, 9, (x, y) => {
      if (x === 4 && y === 4) return [255, 100, 0, 255];
      if (x === 0 || x === 8 || y === 0 || y === 8) return [255, 0, 255, 255];
      return [0, 200, 0, 255];
    });
    const result = runChromaPipeline(data, 9, 9, 4, {
      pipeline: "v2",
      matteColor: MAGENTA,
      spillMaxFraction: 0,
    });
    expect(result.stats!.unmixedPixels).toBe(1);
    // tint 27.5 → coverage ≈ 0.892 → alpha round(255·coverage)=227, rgb ≈ [255,112,0]
    expect(px(result.data, 9, 4, 4)).toEqual([255, 112, 0, 227]);
  });

  it("does not unmix beyond unmixReach (Chebyshev depth via 8-connected BFS)", () => {
    // 11x11: keyed border, subject fill, blend center at depth 5 — beyond default reach 4.
    const data = makeBuffer(11, 11, (x, y) => {
      if (x === 5 && y === 5) return [255, 100, 0, 255];
      if (x === 0 || x === 10 || y === 0 || y === 10) return [255, 0, 255, 255];
      return [0, 200, 0, 255];
    });
    const beyond = runChromaPipeline(data, 11, 11, 4, {
      pipeline: "v2",
      matteColor: MAGENTA,
      spillMaxFraction: 0,
    });
    expect(beyond.stats!.unmixedPixels).toBe(0);
    expect(px(beyond.data, 11, 5, 5)).toEqual([255, 100, 0, 255]);

    const within = runChromaPipeline(data, 11, 11, 4, {
      pipeline: "v2",
      matteColor: MAGENTA,
      unmixReach: 5,
      spillMaxFraction: 0,
    });
    expect(within.stats!.unmixedPixels).toBe(1);
    expect(px(within.data, 11, 5, 5)).toEqual([255, 112, 0, 227]);
  });
});

describe("runChromaPipeline v2 trapped-spill despill", () => {
  const W = 40;
  const H = 40;
  const isBorder = (x: number, y: number) => x < 2 || x >= W - 2 || y < 2 || y >= H - 2;

  function spillScene(cluster: Array<[number, number]>, color: RGBA): Buffer {
    const cells = new Set(cluster.map(([x, y]) => `${x},${y}`));
    return makeBuffer(W, H, (x, y) => {
      if (cells.has(`${x},${y}`)) return color;
      if (isBorder(x, y)) return [255, 0, 255, 255];
      return [0, 200, 0, 255]; // subject, tint −200 → never touched
    });
  }

  it("despills a small high-tint cluster trapped inside the subject, keeping alpha", () => {
    const cluster: Array<[number, number]> = [[20, 20], [21, 20], [20, 21], [21, 21]];
    const data = spillScene(cluster, [240, 120, 240, 255]); // tint 120, dist ≈ 122 → in-band, depth ~18
    const result = runChromaPipeline(data, W, H, 4, { pipeline: "v2", matteColor: MAGENTA });
    expect(result.stats!.unmixedPixels).toBe(0); // too deep for the unmix pass
    expect(result.stats!.spillClustersDespilled).toBe(1);
    expect(result.stats!.spillPixelsDespilled).toBe(4);
    const [r, g, b, a] = px(result.data, W, 20, 20);
    expect(a).toBe(255); // alpha preserved (pinhole guard)
    expect(Math.abs(r - g)).toBeLessThanOrEqual(2); // magenta cast removed
    expect(r).toBeGreaterThanOrEqual(224);
    expect(r).toBeLessThanOrEqual(230);
    // Untouched subject pixel stays byte-identical.
    expect(px(result.data, W, 10, 10)).toEqual([0, 200, 0, 255]);
  });

  it("leaves large tint clusters untouched (intentional key-colored material)", () => {
    const cluster: Array<[number, number]> = [];
    for (let y = 16; y < 24; y++) for (let x = 16; x < 24; x++) cluster.push([x, y]); // 64 > limit 32
    const data = spillScene(cluster, [240, 120, 240, 255]);
    const result = runChromaPipeline(data, W, H, 4, { pipeline: "v2", matteColor: MAGENTA });
    expect(result.stats!.spillClustersDespilled).toBe(0);
    expect(px(result.data, W, 20, 20)).toEqual([240, 120, 240, 255]);
  });

  it("ignores weak-tint clusters below spillMinTint (40)", () => {
    const cluster: Array<[number, number]> = [[20, 20], [21, 20], [20, 21], [21, 21]];
    const data = spillScene(cluster, [200, 170, 200, 255]); // tint 30: above fringeDelta, below spillMinTint
    const result = runChromaPipeline(data, W, H, 4, { pipeline: "v2", matteColor: MAGENTA });
    expect(result.stats!.spillClustersDespilled).toBe(0);
    expect(px(result.data, W, 20, 20)).toEqual([200, 170, 200, 255]);
  });
});

describe("runChromaPipeline v2 input handling", () => {
  it("accepts RGB (channels=3) input as fully opaque", () => {
    const data = Buffer.alloc(3 * 3 * 3);
    for (let i = 0; i < 9; i++) {
      data[i * 3] = 255;
      data[i * 3 + 1] = 0;
      data[i * 3 + 2] = 255;
    }
    const result = runChromaPipeline(data, 3, 3, 3, { pipeline: "v2", matteColor: MAGENTA });
    expect(result.stats!.keyedPixels).toBe(9);
    expect(px(result.data, 3, 0, 0)).toEqual([0, 0, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
// chromaKeyImage wrapper: v2 passthrough (file-level, uses vendored sharp)
// ---------------------------------------------------------------------------

describe("chromaKeyImage pipeline option", () => {
  it("routes pipeline v2 through runChromaPipeline", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-chroma-v2-"));
    const srcPath = path.join(dir, "input.png");
    const outPath = path.join(dir, "output.png");

    const width = 60;
    const height = 60;
    const png = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const inSubject = x >= 15 && x < 45 && y >= 15 && y < 45;
        const c = inSubject ? [0, 200, 100] : [255, 0, 255];
        png.data[idx] = c[0];
        png.data[idx + 1] = c[1];
        png.data[idx + 2] = c[2];
        png.data[idx + 3] = 255;
      }
    }
    await fs.writeFile(srcPath, PNG.sync.write(png));

    const result = await chromaKeyImage(srcPath, outPath, { pipeline: "v2", matteColor: MAGENTA });
    expect(result.threshold).toBe(96);
    expect(result.matteColor).toEqual([255, 0, 255]);

    const outPng = PNG.sync.read(await fs.readFile(outPath));
    const cornerIdx = 0;
    expect(outPng.data[cornerIdx + 3]).toBe(0); // keyed background
    const centerIdx = (30 * width + 30) * 4;
    expect(outPng.data[centerIdx + 3]).toBe(255); // subject survives
    expect(outPng.data[centerIdx]).toBe(0);
    expect(outPng.data[centerIdx + 1]).toBe(200);
    expect(outPng.data[centerIdx + 2]).toBe(100);

    await fs.rm(dir, { recursive: true, force: true });
  });
});

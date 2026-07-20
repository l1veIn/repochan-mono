import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PNG } from "pngjs";
import {
  extractChromaKey,
  chromaKeyImage,
  parseMatteColor,
  matteColorToHex,
  estimateMatteColor,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers: build synthetic PNGs with known matte backgrounds
// ---------------------------------------------------------------------------

/** Build a PNG with a solid matte background and a colored rectangle in the center. */
async function makeMattePng(
  width: number,
  height: number,
  matte: [number, number, number],
  subjectColor: [number, number, number],
  outputPath: string,
): Promise<void> {
  const png = new PNG({ width, height });
  const cx = Math.floor(width * 0.3);
  const cy = Math.floor(height * 0.3);
  const cw = Math.floor(width * 0.4);
  const ch = Math.floor(height * 0.4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const inSubject = x >= cx && x < cx + cw && y >= cy && y < cy + ch;
      const c = inSubject ? subjectColor : matte;
      png.data[idx] = c[0];
      png.data[idx + 1] = c[1];
      png.data[idx + 2] = c[2];
      png.data[idx + 3] = 255;
    }
  }
  await fs.writeFile(outputPath, PNG.sync.write(png));
}

/** Build a raw RGBA buffer with a solid matte background and a colored rectangle. */
function makeMatteBuffer(
  width: number,
  height: number,
  matte: [number, number, number],
  subjectColor: [number, number, number],
): { data: Buffer; width: number; height: number; channels: number } {
  const data = Buffer.alloc(width * height * 4);
  const cx = Math.floor(width * 0.25);
  const cy = Math.floor(height * 0.25);
  const cw = Math.floor(width * 0.5);
  const ch = Math.floor(height * 0.5);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4;
      const inSubject = x >= cx && x < cx + cw && y >= cy && y < cy + ch;
      const c = inSubject ? subjectColor : matte;
      data[idx] = c[0];
      data[idx + 1] = c[1];
      data[idx + 2] = c[2];
      data[idx + 3] = 255;
    }
  }
  return { data, width, height, channels: 4 };
}

// ---------------------------------------------------------------------------
// parseMatteColor
// ---------------------------------------------------------------------------

describe("parseMatteColor", () => {
  it("parses named colors", () => {
    expect(parseMatteColor("magenta")).toEqual([255, 0, 255]);
    expect(parseMatteColor("green")).toEqual([0, 255, 0]);
    expect(parseMatteColor("cyan")).toEqual([0, 255, 255]);
    expect(parseMatteColor("white")).toEqual([255, 255, 255]);
    expect(parseMatteColor("black")).toEqual([0, 0, 0]);
  });

  it("parses hex colors", () => {
    expect(parseMatteColor("#ff00ff")).toEqual([255, 0, 255]);
    expect(parseMatteColor("#00ff00")).toEqual([0, 255, 0]);
  });

  it("returns 'auto' for auto/sample", () => {
    expect(parseMatteColor("auto")).toBe("auto");
    expect(parseMatteColor("sample")).toBe("auto");
  });

  it("rejects invalid input", () => {
    expect(() => parseMatteColor("notacolor")).toThrow(/Invalid matte color/);
    expect(() => parseMatteColor("#xyz")).toThrow(/Invalid matte color/);
  });
});

// ---------------------------------------------------------------------------
// matteColorToHex
// ---------------------------------------------------------------------------

describe("matteColorToHex", () => {
  it("converts RGB to hex string", () => {
    expect(matteColorToHex([255, 0, 255])).toBe("#ff00ff");
    expect(matteColorToHex([0, 255, 0])).toBe("#00ff00");
    expect(matteColorToHex([10, 20, 30])).toBe("#0a141e");
  });
});

// ---------------------------------------------------------------------------
// extractChromaKey (pure pixel operation)
// ---------------------------------------------------------------------------

describe("extractChromaKey", () => {
  it("makes matte background fully transparent", () => {
    const { data, width, height, channels } = makeMatteBuffer(
      100, 100,
      [255, 0, 255], // magenta matte
      [100, 200, 50], // green subject
    );
    const output = extractChromaKey(data, width, height, channels, [255, 0, 255]);

    // Top-left corner pixel should be transparent
    const cornerIdx = 0 * 4;
    expect(output[cornerIdx + 3]).toBe(0); // alpha = 0
    expect(output[cornerIdx]).toBe(0); // R scrubbed
    expect(output[cornerIdx + 1]).toBe(0); // G scrubbed
    expect(output[cornerIdx + 2]).toBe(0); // B scrubbed
  });

  it("keeps subject pixels opaque", () => {
    const { data, width, height, channels } = makeMatteBuffer(
      100, 100,
      [255, 0, 255],
      [100, 200, 50],
    );
    const output = extractChromaKey(data, width, height, channels, [255, 0, 255]);

    // Center pixel (in subject area) should be opaque
    const cx = 50, cy = 50;
    const centerIdx = (width * cy + cx) * 4;
    expect(output[centerIdx + 3]).toBe(255); // alpha = 255
  });

  it("preserves subject colors after decontamination", () => {
    const { data, width, height, channels } = makeMatteBuffer(
      100, 100,
      [255, 0, 255],
      [100, 200, 50],
    );
    const output = extractChromaKey(data, width, height, channels, [255, 0, 255]);

    const cx = 50, cy = 50;
    const idx = (width * cy + cx) * 4;
    // Subject green should be close to [100, 200, 50] after decontamination
    expect(output[idx]).toBeGreaterThan(80);
    expect(output[idx]).toBeLessThan(120);
    expect(output[idx + 1]).toBeGreaterThan(180);
    expect(output[idx + 1]).toBeLessThan(220);
  });

  it("creates smooth alpha transition at edges (softness band)", () => {
    // A pixel at distance ~45 (within the 28-62 transition band) should have partial alpha.
    // Matte is magenta [255,0,255]. A pixel at [255-d/sqrt(2), 0, 255-d/sqrt(2)]
    // has distance d. For d=45: offset = 45/sqrt(2) ≈ 32 → pixel ≈ [223, 0, 223].
    const matte: [number, number, number] = [255, 0, 255];
    const edgeColor: [number, number, number] = [223, 0, 223]; // distance ≈ 45
    const width = 1, height = 1;
    const data = Buffer.from([...edgeColor, 255]);
    const output = extractChromaKey(data, width, height, 4, matte, 28, 34, 0.85);

    // Edge pixel should have partial alpha (not 0, not 255)
    expect(output[3]).toBeGreaterThan(0);
    expect(output[3]).toBeLessThan(255);
  });
});

// ---------------------------------------------------------------------------
// estimateMatteColor (auto-sampling from corners)
// ---------------------------------------------------------------------------

describe("estimateMatteColor", () => {
  it("detects solid matte from corners", () => {
    const matte: [number, number, number] = [255, 0, 255];
    const { data, width, height, channels } = makeMatteBuffer(100, 100, matte, [0, 255, 0]);
    const estimated = estimateMatteColor(data, width, height, channels);
    // With binSize=8, [255,0,255] falls in bin 248+4=252 → should be close
    expect(estimated[0]).toBeGreaterThanOrEqual(248);
    expect(estimated[1]).toBeLessThanOrEqual(7);
    expect(estimated[2]).toBeGreaterThanOrEqual(248);
  });

  it("detects near-matte color with AI jitter", () => {
    // Simulate AI-generated matte: not exact #ff00ff but close (247,4,239)
    const matte: [number, number, number] = [247, 4, 239];
    const { data, width, height, channels } = makeMatteBuffer(100, 100, matte, [0, 255, 0]);
    const estimated = estimateMatteColor(data, width, height, channels);
    // Should be within one bin (8) of the actual matte
    expect(Math.abs(estimated[0] - 247)).toBeLessThanOrEqual(8);
    expect(Math.abs(estimated[1] - 4)).toBeLessThanOrEqual(8);
    expect(Math.abs(estimated[2] - 239)).toBeLessThanOrEqual(8);
  });

  it("is robust when subject bleeds into corners (mode beats median)", () => {
    // Build a buffer where the top-left corner is half subject, half matte.
    // The subject color [0,255,0] occupies 50% of the corner, matte [255,0,255] the other 50%.
    const width = 100, height = 100;
    const matte: [number, number, number] = [255, 0, 255];
    const subject: [number, number, number] = [0, 255, 0];
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) * 4;
        // Top-left quadrant = subject, rest = matte
        // But corners sample top-left first 32×32, which would be 100% subject.
        // So instead make the background the majority even in corners.
        const inCornerSubject = x < 16 && y < 16; // small subject patch in corner
        const c = inCornerSubject ? subject : matte;
        data[idx] = c[0];
        data[idx + 1] = c[1];
        data[idx + 2] = c[2];
        data[idx + 3] = 255;
      }
    }
    const estimated = estimateMatteColor(data, width, height, 4);
    // Matte should still dominate (16×16=256 subject pixels vs ~3800 matte pixels in corners)
    expect(estimated[0]).toBeGreaterThanOrEqual(248);
    expect(estimated[2]).toBeGreaterThanOrEqual(248);
  });
});

// ---------------------------------------------------------------------------
// chromaKeyImage (file-level, uses sharp)
// ---------------------------------------------------------------------------

describe("chromaKeyImage", () => {
  it("extracts subject from a magenta-matte PNG (default pipeline v2 since PR7)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-chroma-"));
    const srcPath = path.join(dir, "input.png");
    const outPath = path.join(dir, "output.png");
    await makeMattePng(200, 200, [255, 0, 255], [0, 200, 100], srcPath);

    const result = await chromaKeyImage(srcPath, outPath, { matteColor: [255, 0, 255] });

    expect(result.matteColor).toEqual([255, 0, 255]);
    expect(result.matteColorSource).toBe("provided");
    expect(result.threshold).toBe(96); // v2 hard-cut default
    expect(result.softness).toBe(34); // v1-only knob, reported for back-compat

    // Output exists and is a valid PNG
    const stat = await fs.stat(outPath);
    expect(stat.isFile()).toBe(true);

    // Verify the output has transparency
    const outBuf = await fs.readFile(outPath);
    const outPng = PNG.sync.read(outBuf);
    // Corner pixel should be transparent
    const cornerIdx = 0;
    expect(outPng.data[cornerIdx + 3]).toBe(0);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("explicit pipeline v1 keeps the legacy thresholds (escape hatch)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-chroma-v1-"));
    const srcPath = path.join(dir, "input.png");
    const outPath = path.join(dir, "output.png");
    await makeMattePng(200, 200, [255, 0, 255], [0, 200, 100], srcPath);

    const result = await chromaKeyImage(srcPath, outPath, { matteColor: [255, 0, 255], pipeline: "v1" });

    expect(result.threshold).toBe(28);
    expect(result.softness).toBe(34);
    const outPng = PNG.sync.read(await fs.readFile(outPath));
    expect(outPng.data[3]).toBe(0); // corner transparent
    const centerIdx = (100 * 200 + 100) * 4;
    expect(outPng.data[centerIdx + 3]).toBe(255); // subject survives

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("auto-samples matte color when not provided", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-chroma-auto-"));
    const srcPath = path.join(dir, "input.png");
    const outPath = path.join(dir, "output.png");
    await makeMattePng(200, 200, [0, 255, 0], [255, 0, 0], srcPath); // green matte

    const result = await chromaKeyImage(srcPath, outPath); // no matteColor → auto

    expect(result.matteColorSource).toBe("auto-sampled");
    // Auto-sampled should detect green close to [0, 255, 0] (within bin tolerance)
    expect(result.matteColor[1]).toBeGreaterThanOrEqual(248);
    expect(result.matteColor[0]).toBeLessThanOrEqual(7);
    expect(result.matteColor[2]).toBeLessThanOrEqual(7);

    await fs.rm(dir, { recursive: true, force: true });
  });
});

import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PNG } from "pngjs";
import { extractIconfont } from "../src/index.js";

// ---------------------------------------------------------------------------
// extractIconfont: synthetic 2×2 hollow-icon sheet (magenta matte, dark ink)
// → lucide-style SVG set. Fully offline (chroma-grid + vendored tracer).
// ---------------------------------------------------------------------------

const W = 128;
const H = 128;
const CELL = 64;
const MATTE: [number, number, number] = [255, 0, 255];
const INK: [number, number, number] = [20, 20, 30];
const KEYS = ["triangle", "square", "ring", "cross"] as const;

type RGB = [number, number, number];

function setPx(png: PNG, x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const q = (y * W + x) * 4;
  png.data[q] = c[0]; png.data[q + 1] = c[1]; png.data[q + 2] = c[2]; png.data[q + 3] = 255;
}

function fillCircle(png: PNG, cx: number, cy: number, r: number, c: RGB): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setPx(png, x, y, c);
    }
  }
}

function fillRect(png: PNG, x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setPx(png, x, y, c);
}

function fillTriangle(png: PNG, cx: number, top: number, half: number, height: number, c: RGB): void {
  for (let y = top; y < top + height; y++) {
    const span = ((y - top) / height) * half;
    for (let x = Math.round(cx - span); x <= Math.round(cx + span); x++) setPx(png, x, y, c);
  }
}

async function makeSheet(file: string): Promise<void> {
  const png = new PNG({ width: W, height: H });
  for (let p = 0; p < W * H; p++) {
    const q = p * 4;
    png.data[q] = MATTE[0]; png.data[q + 1] = MATTE[1]; png.data[q + 2] = MATTE[2]; png.data[q + 3] = 255;
  }
  const center = (index: number) => ({
    cx: (index % 2) * CELL + CELL / 2,
    cy: Math.floor(index / 2) * CELL + CELL / 2,
  });
  // Outline-ish shapes only: solid fills trip extractAssets' maxForegroundRatio
  // QA (a solid glyph's fill ratio vs its own bbox approaches 1.0), which is
  // exactly why the iconfont op targets hollow sheets.
  const c0 = center(0);
  fillTriangle(png, c0.cx, c0.cy - 20, 20, 40, INK); // triangle
  const c1 = center(1);
  fillRect(png, c1.cx - 18, c1.cy - 18, c1.cx + 18, c1.cy + 18, INK); // square outline:
  fillRect(png, c1.cx - 12, c1.cy - 12, c1.cx + 12, c1.cy + 12, MATTE); // keyed-out middle
  const c2 = center(2);
  fillCircle(png, c2.cx, c2.cy, 20, INK); // ring: ink disc …
  fillCircle(png, c2.cx, c2.cy, 10, MATTE); // … with a keyed-out center hole
  const c3 = center(3);
  fillRect(png, c3.cx - 6, c3.cy - 20, c3.cx + 6, c3.cy + 20, INK); // cross: vertical bar
  fillRect(png, c3.cx - 20, c3.cy - 6, c3.cx + 20, c3.cy + 6, INK); // + horizontal bar
  await fs.writeFile(file, PNG.sync.write(png));
}

async function setup(): Promise<{ dir: string; sheet: string; outDir: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "iconfont-test-"));
  const sheet = path.join(dir, "sheet.png");
  await makeSheet(sheet);
  return { dir, sheet, outDir: path.join(dir, "icons") };
}

describe("extractIconfont", () => {
  it("produces lucide-style SVGs, sprite.svg, and index.json", async () => {
    const { sheet, outDir } = await setup();
    const result = await extractIconfont(sheet, outDir, {
      rows: 2,
      cols: 2,
      mapping: [...KEYS],
      normalizeSize: 128,
    });

    expect(result.icons.map((icon) => icon.name)).toEqual([...KEYS]);
    expect(result.spriteFile).toBe(path.join(path.resolve(outDir), "sprite.svg"));
    expect(result.indexFile).toBe(path.join(path.resolve(outDir), "index.json"));

    for (const icon of result.icons) {
      expect(icon.file).toBe(`${icon.name}.svg`);
      expect(icon.pathCount).toBeGreaterThanOrEqual(1);
      expect(icon.bbox.x).toBeGreaterThanOrEqual(0);
      expect(icon.bbox.y).toBeGreaterThanOrEqual(0);
      expect(icon.bbox.x + icon.bbox.w).toBeLessThanOrEqual(24.01);
      expect(icon.bbox.y + icon.bbox.h).toBeLessThanOrEqual(24.01);

      const svg = await fs.readFile(path.join(outDir, icon.file), "utf8");
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('fill="currentColor"');
      // True vector path data, not an embedded bitmap.
      expect(svg).not.toContain("<image");
      const d = svg.match(/<path d="([^"]+)"\/>/)?.[1];
      expect(d).toBeTruthy();
      expect(d).toContain("M");
    }

    const sprite = await fs.readFile(path.join(outDir, "sprite.svg"), "utf8");
    for (const key of KEYS) expect(sprite).toContain(`<symbol id="icon-${key}"`);

    const index = JSON.parse(await fs.readFile(path.join(outDir, "index.json"), "utf8"));
    expect(index.schema).toBe("repochan.iconfont.v1");
    expect(index.rows).toBe(2);
    expect(index.cols).toBe(2);
    expect(index.viewBox).toBe(24);
    expect(index.spriteFile).toBe("sprite.svg");
    expect(index.icons).toHaveLength(4);
    for (const icon of index.icons) {
      expect(icon).toMatchObject({
        name: expect.stringMatching(/^[a-z]+$/),
        file: expect.stringMatching(/\.svg$/),
        pathCount: expect.any(Number),
        bbox: { x: expect.any(Number), y: expect.any(Number), w: expect.any(Number), h: expect.any(Number) },
      });
    }
  });

  it("traces holes as reversed subpaths (ring keeps its center cutout)", async () => {
    const { sheet, outDir } = await setup();
    await extractIconfont(sheet, outDir, { rows: 2, cols: 2, mapping: [...KEYS], normalizeSize: 128 });
    const ring = await fs.readFile(path.join(outDir, "ring.svg"), "utf8");
    const d = ring.match(/<path d="([^"]+)"\/>/)?.[1] ?? "";
    // Outer contour + hole contour = at least two subpaths in one path element.
    expect(d.split("M").length - 1).toBeGreaterThanOrEqual(2);
    const circle = await fs.readFile(path.join(outDir, "triangle.svg"), "utf8");
    const circleD = circle.match(/<path d="([^"]+)"\/>/)?.[1] ?? "";
    expect(circleD.split("M").length - 1).toBe(1);
  });

  it("honors a custom viewBox", async () => {
    const { sheet, outDir } = await setup();
    await extractIconfont(sheet, outDir, { rows: 2, cols: 2, mapping: [...KEYS], normalizeSize: 128, viewBox: 32 });
    const svg = await fs.readFile(path.join(outDir, "triangle.svg"), "utf8");
    expect(svg).toContain('viewBox="0 0 32 32"');
  });

  it("latches on existing output unless overwrite=true", async () => {
    const { sheet, outDir } = await setup();
    await extractIconfont(sheet, outDir, { rows: 2, cols: 2, mapping: [...KEYS], normalizeSize: 128 });
    await expect(
      extractIconfont(sheet, outDir, { rows: 2, cols: 2, mapping: [...KEYS], normalizeSize: 128 }),
    ).rejects.toThrow(/already exists/);
    await expect(
      extractIconfont(sheet, outDir, { rows: 2, cols: 2, mapping: [...KEYS], normalizeSize: 128, overwrite: true }),
    ).resolves.toMatchObject({ icons: expect.any(Array) });
  });

  it("rejects invalid options before touching the output", async () => {
    const { sheet, outDir } = await setup();
    await expect(
      extractIconfont(sheet, outDir, { rows: 0, cols: 2, mapping: [...KEYS] }),
    ).rejects.toThrow(/rows and cols/);
    await expect(
      extractIconfont(sheet, outDir, { rows: 2, cols: 2, mapping: [...KEYS], geometry: { alphaThreshold: 0 } }),
    ).rejects.toThrow(/alphaThreshold/);
    await expect(
      extractIconfont(sheet, outDir, { rows: 2, cols: 2, mapping: [...KEYS], normalizeSize: 8 }),
    ).rejects.toThrow(/normalizeSize/);
  });
});

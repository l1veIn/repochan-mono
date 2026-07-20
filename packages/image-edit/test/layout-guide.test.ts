import { describe, it, expect, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PNG } from "pngjs";
import { writeLayoutGuide } from "../src/index.js";

// ---------------------------------------------------------------------------
// Layout guide golden (design doc §11): the default visual recipe is fixed —
// background #F5F5F5, cell stroke #CCCCCC (2px), safe area #2F80ED (2px),
// no crosshair, no labels — so the default 3×3 render is pinned by sha256.
// Regenerate intentionally by updating GOLDEN_SHA256 after reviewing a diff.
// ---------------------------------------------------------------------------

const GOLDEN_SHA256 = "0f3307654299059fcb95026a21cb362c6983364881d46f60af74073ba4e0de09";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-layout-guide-"));
  tempDirs.push(dir);
  return dir;
}

async function readPixels(file: string): Promise<PNG> {
  return PNG.sync.read(await fs.readFile(file));
}

function px(png: PNG, x: number, y: number): [number, number, number] {
  const q = (y * png.width + x) * 4;
  return [png.data[q], png.data[q + 1], png.data[q + 2]];
}

describe("writeLayoutGuide", () => {
  it("renders the default 3×3 recipe to a byte-deterministic golden PNG", async () => {
    const dir = await tempDir();
    const out = path.join(dir, "guide.png");
    const result = await writeLayoutGuide(out, { rows: 3, cols: 3 });
    expect(result).toMatchObject({
      width: 1023,
      height: 1023,
      rows: 3,
      cols: 3,
      cellWidth: 341,
      cellHeight: 341,
      safeMargin: { x: 34, y: 34 },
    });
    const bytes = await fs.readFile(out);
    const hash = createHash("sha256").update(bytes).digest("hex");
    expect(hash).toBe(GOLDEN_SHA256);

    // Determinism: a second render over the same recipe hashes identically.
    const out2 = path.join(dir, "guide-2.png");
    await writeLayoutGuide(out2, { rows: 3, cols: 3 });
    const hash2 = createHash("sha256").update(await fs.readFile(out2)).digest("hex");
    expect(hash2).toBe(hash);
  });

  it("draws background, cell stroke, and safe-area stroke at the expected pixels", async () => {
    const dir = await tempDir();
    const out = path.join(dir, "guide.png");
    // 1×1 cell of 40px, 25% safe margin → safe rect spans 10..29 (2px stroke).
    await writeLayoutGuide(out, { rows: 1, cols: 1, cellWidth: 40, cellHeight: 40, safeMarginFraction: 0.25 });
    const png = await readPixels(out);
    expect(png.width).toBe(40);
    expect(png.height).toBe(40);
    expect(px(png, 0, 0)).toEqual([0xcc, 0xcc, 0xcc]); // cell stroke corner
    expect(px(png, 39, 39)).toEqual([0xcc, 0xcc, 0xcc]); // cell stroke opposite corner
    expect(px(png, 10, 20)).toEqual([0x2f, 0x80, 0xed]); // safe stroke left edge
    expect(px(png, 20, 29)).toEqual([0x2f, 0x80, 0xed]); // safe stroke bottom edge
    expect(px(png, 20, 20)).toEqual([0xf5, 0xf5, 0xf5]); // center: background (no crosshair by default)
    expect(px(png, 5, 5)).toEqual([0xf5, 0xf5, 0xf5]); // between cell border and safe area
  });

  it("draws a dashed crosshair only when enabled", async () => {
    const dir = await tempDir();
    const out = path.join(dir, "guide.png");
    await writeLayoutGuide(out, { rows: 1, cols: 1, cellWidth: 40, cellHeight: 40, safeMarginFraction: 0.25, crosshair: true });
    const png = await readPixels(out);
    // Center lines at x=20 / y=20; dash = 4px on / 4px off.
    expect(px(png, 20, 2)).toEqual([0xb0, 0xb0, 0xb0]); // vertical dash on
    expect(px(png, 2, 20)).toEqual([0xb0, 0xb0, 0xb0]); // horizontal dash on
    expect(px(png, 20, 6)).toEqual([0xf5, 0xf5, 0xf5]); // vertical dash off (6 % 8 >= 4)
    expect(px(png, 6, 20)).toEqual([0xf5, 0xf5, 0xf5]); // horizontal dash off
  });

  it("labels cells with the row-major index only when labelCells=true", async () => {
    const dir = await tempDir();
    const labeled = path.join(dir, "labeled.png");
    const plain = path.join(dir, "plain.png");
    await writeLayoutGuide(labeled, { rows: 1, cols: 2, cellWidth: 40, cellHeight: 40, labelCells: true });
    await writeLayoutGuide(plain, { rows: 1, cols: 2, cellWidth: 40, cellHeight: 40 });
    const a = await fs.readFile(labeled);
    const b = await fs.readFile(plain);
    expect(a.equals(b)).toBe(false);
    const png = await readPixels(labeled);
    // Cell 1 label ("1") starts at (40+6, 6): glyph row 0 = 0b010 → pixel at x+1.
    expect(px(png, 47, 6)).toEqual([0x88, 0x88, 0x88]);
  });

  it("rejects invalid grid arguments", async () => {
    const dir = await tempDir();
    const out = path.join(dir, "guide.png");
    await expect(writeLayoutGuide(out, { rows: 0, cols: 3 })).rejects.toThrow(/rows and cols/);
    await expect(writeLayoutGuide(out, { rows: 1, cols: 1, cellWidth: 4 })).rejects.toThrow(/cellWidth\/cellHeight/);
    await expect(writeLayoutGuide(out, { rows: 1, cols: 1, safeMarginFraction: 0.5 })).rejects.toThrow(/safeMarginFraction/);
    await expect(writeLayoutGuide(out, { rows: 1, cols: 1, background: "red" })).rejects.toThrow(/background/);
  });

  it("refuses to overwrite an existing guide unless overwrite=true", async () => {
    const dir = await tempDir();
    const out = path.join(dir, "guide.png");
    await writeLayoutGuide(out, { rows: 1, cols: 1 });
    await expect(writeLayoutGuide(out, { rows: 1, cols: 1 })).rejects.toThrow(/already exists/);
    await writeLayoutGuide(out, { rows: 1, cols: 1, overwrite: true });
  });
});

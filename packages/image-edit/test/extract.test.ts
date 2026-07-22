import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PNG } from "pngjs";
import {
  extractAssets,
  extractMatteGrid,
  ExtractError,
  measureChromaResidue,
  type ExtractAssetsOptions,
  type MatteGridItem,
} from "../src/index.js";
import { matteImage } from "../src/imgly.js";

// ---------------------------------------------------------------------------
// PR3 gate A: synthetic fixture suite for extractAssets.
//
// ML guard: matteImage (the optional native ISNet capability) is mocked in
// this file. The chroma strategies (equal-cell / chroma-grid) must
// NEVER call it — each chroma test asserts the mock was not touched. Hybrid
// tests set explicit mock implementations instead.
// ---------------------------------------------------------------------------

vi.mock("../src/imgly.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/imgly.js")>();
  return { ...actual, matteImage: vi.fn() };
});
const matteImageMock = vi.mocked(matteImage);

const KEYS = ["welcome", "searching", "loading", "empty", "error", "success", "not-found", "cta", "cozy"] as const;
const MATTE: [number, number, number] = [255, 0, 255];
const SUBJECT: [number, number, number] = [0, 180, 40]; // green: low key-tint vs magenta

type RGB = [number, number, number];

type SheetMutation = {
  skipCells?: number[];
  overflow?: boolean; // cell 0 subject crosses the grid line into cell 1
  merged?: boolean; // cells 0+1 share one connected component spanning the grid line
  fringe?: boolean; // anti-aliased matte-blend ring around every subject
  sheetEdge?: boolean; // cell 0 subject touches the sheet outer boundary
  blotch?: boolean; // opaque matte-colored stain inside cell 4
  subjectColors?: Record<number, RGB>;
  matte?: RGB;
};

const W = 90;
const H = 90;
const CELL = 30;

function setPx(png: PNG, x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const q = (y * W + x) * 4;
  png.data[q] = c[0]; png.data[q + 1] = c[1]; png.data[q + 2] = c[2]; png.data[q + 3] = 255;
}

function drawCircle(png: PNG, cx: number, cy: number, r: number, color: RGB): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setPx(png, x, y, color);
    }
  }
}

function lerp(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Build the 3x3 synthetic sheet (magenta matte, green circles r6 centered per cell). */
async function makeSheet(file: string, mut: SheetMutation = {}): Promise<void> {
  const matte = mut.matte ?? MATTE;
  const png = new PNG({ width: W, height: H });
  for (let p = 0; p < W * H; p++) {
    const q = p * 4;
    png.data[q] = matte[0]; png.data[q + 1] = matte[1]; png.data[q + 2] = matte[2]; png.data[q + 3] = 255;
  }
  const skip = new Set(mut.skipCells ?? []);
  if (mut.merged) { skip.add(0); skip.add(1); }
  for (let index = 0; index < 9; index++) {
    if (skip.has(index)) continue;
    const row = Math.floor(index / 3), col = index % 3;
    const color = mut.subjectColors?.[index] ?? SUBJECT;
    if (index === 0 && mut.overflow) {
      drawCircle(png, col * CELL + 26, row * CELL + 15, 8, color); // crosses x=30 grid line
      continue;
    }
    if (index === 0 && mut.sheetEdge) {
      drawCircle(png, 4, 15, 6, color); // clipped at x=0 → touches the sheet boundary
      continue;
    }
    drawCircle(png, col * CELL + 15, row * CELL + 15, 6, color);
  }
  if (mut.merged) {
    // Two r8 circles bridged into ONE component spanning x 7..53 (span 47 > 1.5*30).
    drawCircle(png, 15, 15, 8, SUBJECT);
    drawCircle(png, 45, 15, 8, SUBJECT);
    for (let y = 14; y <= 16; y++) for (let x = 15; x <= 45; x++) setPx(png, x, y, SUBJECT);
  }
  if (mut.fringe) {
    // 2px anti-aliased ring blending subject → matte around every cell center.
    for (let index = 0; index < 9; index++) {
      if (skip.has(index)) continue;
      const row = Math.floor(index / 3), col = index % 3;
      const cx = col * CELL + 15, cy = row * CELL + 15;
      const color = mut.subjectColors?.[index] ?? SUBJECT;
      for (let y = cy - 9; y <= cy + 9; y++) {
        for (let x = cx - 9; x <= cx + 9; x++) {
          const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          if (d > 6 && d <= 8) setPx(png, x, y, lerp(color, matte, (d - 6) / 2));
        }
      }
    }
  }
  if (mut.blotch) {
    // Opaque matte-ish stain (200,50,200): far enough from the matte to survive
    // v1 keying (dist ~92 > 28+34), still high key-tint → chroma_residue target.
    for (let y = 32; y < 38; y++) for (let x = 32; x < 38; x++) setPx(png, x, y, [200, 50, 200]);
  }
  await fs.writeFile(file, PNG.sync.write(png));
}

function options(mut: Partial<ExtractAssetsOptions> = {}): ExtractAssetsOptions {
  return {
    strategy: "chroma-grid",
    rows: 3,
    cols: 3,
    mapping: [...KEYS],
    // The synthetic suite is tuned for the frozen v1 semantics (threshold 10 /
    // softness 10 fixtures) — pipeline stays explicit; the PR7 defaults have
    // their own dedicated test below.
    chroma: { matteColor: MATTE, pipeline: "v1", threshold: 10, softness: 10 },
    normalize: { canvasSize: 64, padding: 8 },
    ...mut,
  };
}

async function fixture(mut: SheetMutation = {}): Promise<{ dir: string; image: string; out: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-extract-"));
  const image = path.join(dir, "sheet.png");
  const out = path.join(dir, "out");
  await makeSheet(image, mut);
  return { dir, image, out };
}

async function expectExtractError(promise: Promise<unknown>): Promise<ExtractError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ExtractError);
    return error as ExtractError;
  }
  throw new Error("expected ExtractError, but the call succeeded");
}

beforeEach(() => {
  matteImageMock.mockReset();
  matteImageMock.mockImplementation(() => {
    throw new Error("matteImage must not be called on chroma-only paths (no ML allowed)");
  });
});

// ── chroma-grid synthetic suite (门禁 A) ────────────────────────────────────

describe("extractAssets chroma-grid synthetic fixtures", () => {
  it("clean 3x3 sheet extracts 9 items with zero residue and no edge contact", async () => {
    const { dir, image, out } = await fixture();
    const result = await extractAssets(image, out, options());

    expect(result.items.map((item) => item.key)).toEqual([...KEYS]);
    expect(result.qa.ok).toBe(true);
    expect(result.qa.strategyUsed).toBe("chroma-grid");
    expect(result.qa.pipeline).toBe("v1");
    expect(result.qa.metrics?.chromaResidueRatio).toBe(0);
    expect(result.qa.metrics?.sheetEdgeTouchRatio).toBe(0);
    expect(result.matteColor).toEqual(MATTE);
    expect(result.matteColorSource).toBe("provided");
    for (const item of result.items) {
      expect(item.qa.edgeTouchRatio).toBe(0); // soft seed-cell metric: no overflow
      expect(item.qa.sheetEdgeTouchPixels).toBe(0);
      expect(item.geometry.sourceBounds).toBeDefined();
      expect(item.geometry.cropSize).toBeDefined();
      const png = PNG.sync.read(await fs.readFile(item.path));
      expect([png.width, png.height]).toEqual([64, 64]);
    }
    expect(matteImageMock).not.toHaveBeenCalled();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("defaults to chroma-grid + pipeline v2 when strategy/pipeline are omitted (PR7)", async () => {
    const { dir, image, out } = await fixture();
    const result = await extractAssets(image, out, {
      rows: 3,
      cols: 3,
      mapping: [...KEYS],
      chroma: { matteColor: MATTE },
      normalize: { canvasSize: 64, padding: 8 },
    });

    expect(result.qa.strategyUsed).toBe("chroma-grid");
    expect(result.qa.pipeline).toBe("v2");
    expect(result.items).toHaveLength(9);
    expect(result.qa.ok).toBe(true);
    expect(matteImageMock).not.toHaveBeenCalled();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("clean 3x3 sheet also passes with pipeline v2 (whole-sheet soft-unmix)", async () => {
    const { dir, image, out } = await fixture();
    const result = await extractAssets(image, out, options({
      chroma: { matteColor: MATTE, pipeline: "v2" },
    }));
    expect(result.items).toHaveLength(9);
    expect(result.qa.pipeline).toBe("v2");
    expect(result.qa.metrics?.chromaResidueRatio).toBe(0);
    expect(matteImageMock).not.toHaveBeenCalled();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("neighbour overflow is rescued by centroid assignment (seed-cell edge stays soft)", async () => {
    const { dir, image, out } = await fixture({ overflow: true });
    const result = await extractAssets(image, out, options());

    expect(result.items).toHaveLength(9);
    const welcome = result.items[0];
    // Union crop crosses the seed cell boundary: soft metric records it, no hard fail.
    expect(welcome.qa.edgeTouchRatio).toBeGreaterThan(0);
    expect(welcome.qa.sheetEdgeTouchPixels).toBe(0);
    expect(welcome.geometry.sourceBounds!.x + welcome.geometry.sourceBounds!.w)
      .toBeGreaterThan(welcome.geometry.cell.x + welcome.geometry.cell.w);
    expect(matteImageMock).not.toHaveBeenCalled();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("merged double subject is split at the grid line and relabelled per cell", async () => {
    const { dir, image, out } = await fixture({ merged: true });
    const result = await extractAssets(image, out, options());

    expect(result.items).toHaveLength(9);
    expect(result.items[0].qa.splitFromMerged).toBe(true);
    expect(result.items[1].qa.splitFromMerged).toBe(true);
    expect(result.items[0].qa.foregroundPixels).toBeGreaterThan(0);
    expect(result.items[1].qa.foregroundPixels).toBeGreaterThan(0);
    expect(matteImageMock).not.toHaveBeenCalled();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("soft fringe passes with pipeline v2 and leaves no chroma residue", async () => {
    const { dir, image, out } = await fixture({ fringe: true });
    // Corner auto: fringe blend pixels sit inside v2's erase radius, which is a
    // warning (not a hard matte_subject_collision) by design §2.
    const result = await extractAssets(image, out, options({
      chroma: { matteColor: "auto", pipeline: "v2" },
    }));
    expect(result.items).toHaveLength(9);
    expect(result.qa.metrics?.chromaResidueRatio).toBeLessThanOrEqual(0.001);
    expect(result.qa.metrics?.warnings?.length).toBeGreaterThan(0);
    expect(matteImageMock).not.toHaveBeenCalled();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("empty cell hard-fails with empty_cell", async () => {
    const { dir, image, out } = await fixture({ skipCells: [4] });
    const error = await expectExtractError(extractAssets(image, out, options()));
    expect(error.defects.some((d) => d.code === "empty_cell" && d.index === 4)).toBe(true);
    await expect(fs.access(out)).rejects.toThrow();
    expect(matteImageMock).not.toHaveBeenCalled();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("subject touching the sheet boundary hard-fails sheet_edge_touch (default 0)", async () => {
    const { dir, image, out } = await fixture({ sheetEdge: true });
    const error = await expectExtractError(extractAssets(image, out, options()));
    expect(error.defects.some((d) => d.code === "sheet_edge_touch" && d.index === 0)).toBe(true);
    expect(matteImageMock).not.toHaveBeenCalled();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("sheet-edge contact passes when maxSheetEdgeTouchRatio is relaxed", async () => {
    const { dir, image, out } = await fixture({ sheetEdge: true });
    const result = await extractAssets(image, out, options({ qa: { maxSheetEdgeTouchRatio: 1 } }));
    expect(result.items).toHaveLength(9);
    expect(result.items[0].qa.sheetEdgeTouchPixels).toBeGreaterThan(0);
    expect(result.qa.metrics?.sheetEdgeTouchRatio).toBeGreaterThan(0);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("opaque matte blotch hard-fails chroma_residue; clean sheet does not", async () => {
    const { dir, image, out } = await fixture({ blotch: true });
    const error = await expectExtractError(extractAssets(image, out, options()));
    const residue = error.defects.find((d) => d.code === "chroma_residue");
    expect(residue).toBeDefined();
    expect(residue!.metric).toBeGreaterThan(0.001);
    expect(matteImageMock).not.toHaveBeenCalled();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("provided matte colliding with a subject hard-fails matte_subject_collision", async () => {
    // Cell 4 subject (255,20,255): distance 20 to the magenta matte — far enough
    // to count as a subject sample (>16) but inside the v2 eraseRadius 96.
    const { dir, image, out } = await fixture({ subjectColors: { 4: [255, 20, 255] } });
    const error = await expectExtractError(extractAssets(image, out, options({
      chroma: { matteColor: MATTE }, // v2 default threshold → eraseRadius 96
    })));
    expect(error.defects.some((d) => d.code === "matte_subject_collision")).toBe(true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("corner auto matte collision only warns (then fails as empty_cell, legacy policy)", async () => {
    const { dir, image, out } = await fixture({ subjectColors: { 4: [255, 20, 255] } });
    const error = await expectExtractError(extractAssets(image, out, options({
      chroma: { matteColor: "auto" }, // corner mode: no hard collision fail by design
    })));
    expect(error.defects.some((d) => d.code === "matte_subject_collision")).toBe(false);
    expect(error.defects.some((d) => d.code === "empty_cell" && d.index === 4)).toBe(true);
    expect(error.qa?.matte.warnings?.length).toBeGreaterThan(0);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("subject-aware auto picks the clearing candidate on a clean sheet", async () => {
    const { dir, image, out } = await fixture();
    const result = await extractAssets(image, out, options({
      chroma: { matteColor: "auto", matteSelect: "subject-aware" },
    }));
    expect(result.items).toHaveLength(9);
    expect(result.matteColorSource).toBe("auto-subject-aware");
    expect(result.matteColor).toEqual(MATTE); // magenta clears the green subjects by a wide margin
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("subject-aware auto hard-fails matte_subject_collision when the background candidate collides", async () => {
    // Cell 4 subject (255,20,255): 20 from the magenta matte — magenta is the
    // only candidate matching the sampled background, but it sits inside the
    // erase radius (v2 default 96) → collision hard fail (design §2 rule 1).
    const { dir, image, out } = await fixture({ subjectColors: { 4: [255, 20, 255] } });
    const error = await expectExtractError(extractAssets(image, out, options({
      chroma: { matteColor: "auto", matteSelect: "subject-aware" },
    })));
    expect(error.defects.some((d) => d.code === "matte_subject_collision")).toBe(true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("subject-aware never keys a candidate absent from the sheet (green sheet + mint subjects)", async () => {
    // PR7 production defect: a pure-green sticker sheet with mint subjects.
    // Old subject-aware picked magenta (farthest from the subject) and keyed
    // nothing. The background existence check must select the measured green;
    // the mint tips inside the erase radius then surface as a collision.
    const mint: RGB = [30, 235, 60];
    const subjectColors: Record<number, RGB> = {};
    for (let i = 0; i < 9; i++) subjectColors[i] = mint;
    const { dir, image, out } = await fixture({ matte: [0, 255, 0], subjectColors });
    const error = await expectExtractError(extractAssets(image, out, options({
      chroma: { matteColor: "auto", matteSelect: "subject-aware" },
    })));
    expect(error.qa?.matte.matte).toEqual([0, 255, 0]); // measured green — never magenta
    expect(error.qa?.matte.source).toBe("auto-subject-aware");
    expect(error.defects.some((d) => d.code === "matte_subject_collision")).toBe(true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("subset publishes only the requested keys but QA still covers the full mapping", async () => {
    const { dir, image, out } = await fixture({ skipCells: [5] });
    // Default requireFullCount=true: a broken non-subset cell still hard-fails.
    const error = await expectExtractError(extractAssets(image, out, options({ subset: ["welcome"] })));
    expect(error.defects.some((d) => d.code === "empty_cell" && d.index === 5)).toBe(true);

    // requireFullCount=false: non-subset defects demote to warnings, subset publishes.
    const result = await extractAssets(image, out, options({
      subset: ["welcome"],
      qa: { requireFullCount: false },
    }));
    expect(result.items.map((item) => item.key)).toEqual(["welcome"]);
    expect(result.qa.metrics?.warnings?.some((note) => note.includes("requireFullCount=false"))).toBe(true);
    expect(await fs.readdir(out)).toEqual(["welcome.png"]);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("rejects an existing output directory without overwrite", async () => {
    const { dir, image, out } = await fixture();
    await fs.mkdir(out, { recursive: true });
    await expect(extractAssets(image, out, options())).rejects.toThrow(/already exists.*overwrite=true/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("enforces the max dimension guard", async () => {
    const { dir, image, out } = await fixture();
    await expect(extractAssets(image, out, options({ maxDimension: 30 }))).rejects.toThrow(/max dimension 30/);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ── option validation (strategy/geometry/hybrid pairing, design §3/§7) ─────

describe("extractAssets option validation", () => {
  const invalid = async (opts: ExtractAssetsOptions, pattern: RegExp) => {
    const error = await expectExtractError(extractAssets("/nonexistent.png", "/tmp/ie-never", opts));
    expect(error.defects.every((d) => d.code === "invalid_options")).toBe(true);
    expect(error.message).toMatch(pattern);
  };

  it("rejects strategy=chroma-grid with geometry.mode=equal-cell", async () => {
    await invalid(
      { strategy: "chroma-grid", rows: 3, cols: 3, mapping: [...KEYS], normalize: { canvasSize: 64 }, geometry: { mode: "equal-cell" } },
      /requires geometry\.mode "centroid-components"/,
    );
  });

  it("rejects strategy=equal-cell with geometry.mode=centroid-components", async () => {
    await invalid(
      { strategy: "equal-cell", rows: 3, cols: 3, mapping: [...KEYS], normalize: { canvasSize: 64 }, geometry: { mode: "centroid-components" } },
      /requires geometry\.mode "equal-cell"/,
    );
  });

  it("rejects strategy=ml-blobs with any geometry", async () => {
    await invalid(
      { strategy: "ml-blobs", rows: 2, cols: 2, geometry: { minBlobFraction: 0.01 } },
      /does not accept a geometry/,
    );
  });

  it("rejects strategy=ml-blobs with subset", async () => {
    await invalid(
      { strategy: "ml-blobs", rows: 2, cols: 2, subset: ["a"] },
      /does not accept subset/,
    );
  });

  it("rejects strategy=hybrid without hybrid.mlFallback === true", async () => {
    await invalid(
      { strategy: "hybrid", rows: 3, cols: 3, mapping: [...KEYS], normalize: { canvasSize: 64 } },
      /hybrid requires hybrid\.mlFallback === true; use strategy chroma-grid otherwise/,
    );
    await invalid(
      { strategy: "hybrid", rows: 3, cols: 3, mapping: [...KEYS], normalize: { canvasSize: 64 }, hybrid: { mlFallback: false } },
      /hybrid requires hybrid\.mlFallback === true/,
    );
  });

  it("rejects hybrid model sizes not bundled by the pinned ML runtime", async () => {
    await invalid(
      {
        strategy: "hybrid",
        rows: 3,
        cols: 3,
        mapping: [...KEYS],
        normalize: { canvasSize: 64 },
        hybrid: { mlFallback: true, model: "large" },
      } as unknown as ExtractAssetsOptions,
      /hybrid\.model must be small \| medium \(got "large"\)/,
    );
  });

  it("rejects out-of-range numeric options", async () => {
    await invalid(
      { strategy: "chroma-grid", rows: 3, cols: 3, mapping: [...KEYS], normalize: { canvasSize: 64 }, geometry: { debrisFraction: 1.5 } },
      /geometry\.debrisFraction must be between 0 and 1/,
    );
    await invalid(
      { strategy: "chroma-grid", rows: 3, cols: 3, mapping: [...KEYS], normalize: { canvasSize: 64 }, qa: { residueEdgeDepthPx: 9 } },
      /qa\.residueEdgeDepthPx must be an integer from 0 to 8/,
    );
  });
});

// ── hybrid ML fallback (design §7) ──────────────────────────────────────────

/** Synthetic ISNet output: transparent background + opaque circles (cells configurable). */
function makeMatted(width: number, height: number, skipCells: number[] = []): { data: Buffer; width: number; height: number; channels: number } {
  const data = Buffer.alloc(width * height * 4); // all zeros = transparent
  const skip = new Set(skipCells);
  for (let index = 0; index < 9; index++) {
    if (skip.has(index)) continue;
    const row = Math.floor(index / 3), col = index % 3;
    const cx = col * 30 + 15, cy = row * 30 + 15;
    for (let y = cy - 7; y <= cy + 7; y++) {
      for (let x = cx - 7; x <= cx + 7; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > 36) continue;
        const q = (y * width + x) * 4;
        data[q] = SUBJECT[0]; data[q + 1] = SUBJECT[1]; data[q + 2] = SUBJECT[2]; data[q + 3] = 255;
      }
    }
  }
  return { data, width, height, channels: 4 };
}

describe("extractAssets hybrid", () => {
  const hybridOptions = (mut: Partial<ExtractAssetsOptions> = {}): ExtractAssetsOptions =>
    options({ strategy: "hybrid", hybrid: { mlFallback: true }, ...mut });

  it("recovers a failed chroma-grid cell via ML assist (dilated-seed default)", async () => {
    const { dir, image, out } = await fixture({ skipCells: [4] }); // cell 4 empty for chroma
    matteImageMock.mockResolvedValue(makeMatted(W, H)); // ML sees all 9 subjects

    const result = await extractAssets(image, out, hybridOptions());
    expect(result.items).toHaveLength(9);
    expect(result.qa.strategyUsed).toBe("hybrid:ml-cell");
    expect(result.qa.metrics?.warnings?.some((note) => note.includes("cell 4"))).toBe(true);
    expect(matteImageMock).toHaveBeenCalledTimes(1);
    const recovered = result.items.find((item) => item.index === 4)!;
    expect(recovered.qa.foregroundPixels).toBeGreaterThan(0);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("still throws ExtractError when ML assist cannot recover the cell", async () => {
    const { dir, image, out } = await fixture({ skipCells: [4] });
    matteImageMock.mockResolvedValue(makeMatted(W, H, [4])); // ML also sees an empty cell 4

    const error = await expectExtractError(extractAssets(image, out, hybridOptions()));
    expect(error.defects.some((d) => d.code === "empty_cell" && d.index === 4)).toBe(true);
    expect(error.qa?.strategyUsed).toBe("hybrid:chroma-grid");
    await expect(fs.access(out)).rejects.toThrow();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reports ml_unavailable when the model fails to load", async () => {
    const { dir, image, out } = await fixture({ skipCells: [4] });
    matteImageMock.mockRejectedValue(new Error("induced ML runtime failure"));

    const error = await expectExtractError(extractAssets(image, out, hybridOptions()));
    expect(error.defects[0].code).toBe("ml_unavailable");
    expect(error.defects[0].detail).toMatch(/induced ML runtime failure/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("passes straight through as hybrid:chroma-grid when chroma-grid succeeds", async () => {
    const { dir, image, out } = await fixture();
    const result = await extractAssets(image, out, hybridOptions());
    expect(result.items).toHaveLength(9);
    expect(result.qa.strategyUsed).toBe("hybrid:chroma-grid");
    expect(matteImageMock).not.toHaveBeenCalled(); // no ML when chroma-grid is green
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ── equal-cell pixel regression + wrapper fidelity ─────────────────────────

describe("extractAssets equal-cell", () => {
  const LEGACY_GOLDEN = "34f5cd8af7f39d17896076acd8f6fdd1bb43bda55ba7c293b710d6ff03ea89c8";

  // The exact fixture + options from the legacy matte-grid tests.
  async function makeLegacyGrid(file: string): Promise<void> {
    const png = new PNG({ width: W, height: H });
    for (let p = 0; p < W * H; p++) {
      const q = p * 4;
      png.data[q] = MATTE[0]; png.data[q + 1] = MATTE[1]; png.data[q + 2] = MATTE[2]; png.data[q + 3] = 255;
    }
    for (let index = 0; index < 9; index++) {
      const row = Math.floor(index / 3), col = index % 3;
      const x0 = col * CELL + 8, y0 = row * CELL + 7;
      for (let y = y0; y < y0 + 16; y++) {
        for (let x = x0; x < x0 + 14; x++) {
          const q = (y * W + x) * 4;
          png.data[q] = 20 + index * 10; png.data[q + 1] = 180; png.data[q + 2] = 40; png.data[q + 3] = 255;
        }
      }
    }
    await fs.writeFile(file, PNG.sync.write(png));
  }

  // Rebuild the legacy metadata shape (pre-PR3 fields only) so the golden hash
  // compares exactly what the legacy extractMatteGrid returned + wrote.
  function legacyMetaOf(item: MatteGridItem): Record<string, unknown> {
    const { align: _align, ...normalized } = item.geometry.normalized;
    return {
      key: item.key,
      index: item.index,
      file: item.file,
      geometry: { cell: item.geometry.cell, foreground: item.geometry.foreground, normalized },
      qa: item.qa,
    };
  }

  it("extractAssets equal-cell + chroma v1 is pixel-identical to the pre-PR3 golden", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-golden-"));
    const image = path.join(dir, "grid.png");
    const out = path.join(dir, "out");
    await makeLegacyGrid(image);

    const result = await extractAssets(image, out, {
      strategy: "equal-cell",
      rows: 3,
      cols: 3,
      mapping: [...KEYS],
      chroma: { pipeline: "v1", matteColor: MATTE, threshold: 10, softness: 10 },
      normalize: { canvasSize: 64, padding: 8 },
    });

    const hash = createHash("sha256");
    for (const item of result.items) {
      hash.update(JSON.stringify(legacyMetaOf(item)));
      hash.update(await fs.readFile(item.path));
    }
    hash.update(JSON.stringify({ matteColor: result.matteColor, matteColorSource: result.matteColorSource }));
    expect(hash.digest("hex")).toBe(LEGACY_GOLDEN);
    expect(matteImageMock).not.toHaveBeenCalled();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("extractMatteGrid wrapper (explicit equal-cell + v1 escape hatch) returns the same bytes as direct extractAssets", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ie-wrap-"));
    const image = path.join(dir, "grid.png");
    await makeLegacyGrid(image);

    const legacyOptions = {
      rows: 3, cols: 3, mapping: [...KEYS] as string[],
      strategy: "equal-cell" as const,
      chroma: { matteColor: MATTE as RGB, pipeline: "v1" as const, threshold: 10, softness: 10 },
      normalize: { canvasSize: 64, padding: 8 },
    };
    const viaWrapper = await extractMatteGrid(image, path.join(dir, "out-wrapper"), legacyOptions);
    const viaExtract = await extractAssets(image, path.join(dir, "out-extract"), legacyOptions);

    expect(viaWrapper.items.map((item) => item.file)).toEqual(viaExtract.items.map((item) => item.file));
    for (let i = 0; i < viaWrapper.items.length; i++) {
      const a = await fs.readFile(viaWrapper.items[i].path);
      const b = await fs.readFile(viaExtract.items[i].path);
      expect(a.equals(b)).toBe(true);
    }
    expect(viaWrapper.matteColorSource).toBe("provided");
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("extractMatteGrid wrapper defaults to chroma-grid + v2 (PR7)", async () => {
    const { dir, image, out } = await fixture(); // circle subjects (crop ratios < 0.8)

    const result = await extractMatteGrid(image, out, {
      rows: 3, cols: 3, mapping: [...KEYS],
      chroma: { matteColor: MATTE },
      normalize: { canvasSize: 64, padding: 8 },
    });

    expect(result.items).toHaveLength(9);
    expect(result.matteColorSource).toBe("provided");
    for (const item of result.items) {
      expect(item.geometry.sourceBounds).toBeDefined();
      expect(item.qa.sheetEdgeTouchPixels).toBe(0);
    }
    expect(matteImageMock).not.toHaveBeenCalled();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("equal-cell keeps seed-cell edge contact as a HARD failure (legacy policy)", async () => {
    const { dir, image, out } = await fixture({ overflow: true });
    // The overflow circle crosses the cell boundary: chroma-grid rescued it
    // above; equal-cell must still hard-fail edge_touch (design §5 table).
    const error = await expectExtractError(extractAssets(image, out, options({ strategy: "equal-cell" })));
    expect(error.defects.some((d) => d.code === "edge_touch" && d.index === 0)).toBe(true);
    expect(matteImageMock).not.toHaveBeenCalled();
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ── chroma_residue unit (design §2 normative algorithm) ────────────────────

describe("measureChromaResidue", () => {
  it("ignores key-tinted material deep inside the subject (dist > edgeDepthPx)", () => {
    // 10x10: opaque subject block (2..7)²; its inner (4..5)² is matte-tinted
    // (Chebyshev dist to transparent = 3 > D=2 → must NOT count as residue).
    const width = 10, height = 10;
    const data = Buffer.alloc(width * height * 4);
    for (let y = 2; y <= 7; y++) {
      for (let x = 2; x <= 7; x++) {
        const q = (y * width + x) * 4;
        const inner = x >= 4 && x <= 5 && y >= 4 && y <= 5;
        const c: RGB = inner ? [255, 0, 255] : [0, 180, 40];
        data[q] = c[0]; data[q + 1] = c[1]; data[q + 2] = c[2]; data[q + 3] = 255;
      }
    }
    const result = measureChromaResidue(data, width, height, MATTE);
    expect(result.subjectPixels).toBe(36);
    expect(result.residuePixels).toBe(0);
    expect(result.ratio).toBe(0);
  });

  it("counts opaque key-tinted pixels hugging transparent regions", () => {
    // 10x10: 3x3 opaque matte-tinted blotch surrounded by transparency.
    const width = 10, height = 10;
    const data = Buffer.alloc(width * height * 4);
    for (let y = 3; y <= 5; y++) {
      for (let x = 3; x <= 5; x++) {
        const q = (y * width + x) * 4;
        data[q] = 255; data[q + 1] = 0; data[q + 2] = 255; data[q + 3] = 255;
      }
    }
    const result = measureChromaResidue(data, width, height, MATTE);
    expect(result.residuePixels).toBe(9);
    expect(result.ratio).toBe(1);
  });
});

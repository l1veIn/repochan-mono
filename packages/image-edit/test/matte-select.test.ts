import { describe, it, expect } from "vitest";
import { selectMatteColor, estimateMatteColor, type MatteColor } from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers: synthetic raw RGBA buffers
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

type Rect = { x: number; y: number; w: number; h: number; color: RGB };

function makeBuffer(width: number, height: number, bg: RGB, rects: Rect[] = []): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const rect = rects.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      const c = rect ? rect.color : bg;
      data[idx] = c[0];
      data[idx + 1] = c[1];
      data[idx + 2] = c[2];
      data[idx + 3] = 255;
    }
  }
  return data;
}

const MAGENTA: RGB = [255, 0, 255];
const GREEN: RGB = [0, 255, 0];
const WHITE: RGB = [255, 255, 255];

// ---------------------------------------------------------------------------
// corner mode (default — back-compat with today's "auto")
// ---------------------------------------------------------------------------

describe("selectMatteColor corner mode", () => {
  const data = makeBuffer(60, 60, MAGENTA, [{ x: 20, y: 20, w: 20, h: 20, color: GREEN }]);

  it("is the default mode and matches estimateMatteColor", () => {
    const result = selectMatteColor(data, 60, 60, 4);
    expect(result.source).toBe("auto-sampled");
    expect(result.matte).toEqual(estimateMatteColor(data, 60, 60, 4));
    expect(result.matte[0]).toBeGreaterThanOrEqual(248);
    expect(result.matte[1]).toBeLessThanOrEqual(7);
    expect(result.matte[2]).toBeGreaterThanOrEqual(248);
  });

  it("reports corner-mode metadata: score 0, clearance, default eraseRadius 96 (v2 default)", () => {
    const result = selectMatteColor(data, 60, 60, 4, { mode: "corner" });
    expect(result.score).toBe(0);
    expect(result.eraseRadius).toBe(96);
    expect(result.clearsEraseRadius).toBe(true);
    // estimated [252,4,252] vs green [0,255,0] ≈ 435.9
    expect(result.minSubjectDistance).toBeCloseTo(435.9, 0);
    expect(result.candidateScores).toHaveLength(1);
    expect(result.candidateScores[0].matte).toEqual(result.matte);
    expect(result.warnings).toBeUndefined();
  });

  it("derives eraseRadius 28 for an explicit pipeline v1 (escape hatch)", () => {
    const result = selectMatteColor(data, 60, 60, 4, { pipeline: "v1" });
    expect(result.eraseRadius).toBe(28);
    expect(result.clearsEraseRadius).toBe(true);
  });

  it("honors an explicit eraseRadius override", () => {
    const result = selectMatteColor(data, 60, 60, 4, { eraseRadius: 500 });
    expect(result.eraseRadius).toBe(500);
    // Subject green is only ~436 away → does not clear a 500px radius.
    expect(result.clearsEraseRadius).toBe(false);
    expect(result.warnings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// subject-aware mode (opt-in)
//
// PR7 semantics: candidates must FIRST match the sampled background (within
// eraseRadius); "far from the subject" only breaks ties among the survivors.
// When no candidate matches the background, the result falls back to the
// corner-sampled matte (source "auto-sampled") with a warning.
// ---------------------------------------------------------------------------

describe("selectMatteColor subject-aware mode", () => {
  it("picks the candidate matching the sampled background, not the highest-scoring absent one", () => {
    const pink: RGB = [255, 100, 200];
    const data = makeBuffer(60, 60, MAGENTA, [{ x: 20, y: 20, w: 20, h: 20, color: pink }]);
    const result = selectMatteColor(data, 60, 60, 4, { mode: "subject-aware" });

    expect(result.source).toBe("auto-subject-aware");
    // Green scores farther from the pink subject (~359) but is not in the
    // image → excluded by the background existence check; magenta wins.
    expect(result.matte).toEqual([255, 0, 255]);
    expect(result.minSubjectDistance).toBeCloseTo(114.1, 0);
    expect(result.clearsEraseRadius).toBe(true); // 114 ≥ default eraseRadius 96
    expect(result.warnings).toBeUndefined();

    expect(result.candidateScores).toHaveLength(3);
    const green = result.candidateScores.find((c) => c.matte[1] === 255)!;
    expect(green.score).toBeCloseTo(359.2, 0); // score kept for observability
  });

  it("rejects background-verified candidates colliding with subject pixels", () => {
    const nearMagenta: MatteColor = [200, 0, 200]; // ~74 from the bg estimate → passes existence
    const magentaShade: RGB = [200, 0, 150]; // 50 from nearMagenta (< 96) but 118 from MAGENTA
    const data = makeBuffer(60, 60, MAGENTA, [
      { x: 10, y: 20, w: 15, h: 15, color: magentaShade },
      { x: 35, y: 20, w: 15, h: 15, color: GREEN },
    ]);
    const result = selectMatteColor(data, 60, 60, 4, { mode: "subject-aware", candidates: [nearMagenta, MAGENTA] });

    // nearMagenta passes existence but collides with the magentaShade subject
    // (min distance 50 < 96) → rejected; MAGENTA clears (118, 436) and wins.
    expect(result.matte).toEqual([255, 0, 255]);
    expect(result.clearsEraseRadius).toBe(true);
    const colliding = result.candidateScores[0];
    expect(colliding.clearsEraseRadius).toBe(false);
    expect(colliding.minSubjectDistance).toBe(50);
  });

  it("keeps the background-matching candidate with clearsEraseRadius=false when it collides", () => {
    // Subject (255,20,255) is a subject sample (dist ~16.5 > 16 from the
    // background estimate) but sits 20 from the magenta candidate (< 96).
    const data = makeBuffer(60, 60, MAGENTA, [{ x: 15, y: 5, w: 10, h: 10, color: [255, 20, 255] }]);
    const result = selectMatteColor(data, 60, 60, 4, { mode: "subject-aware" });

    expect(result.matte).toEqual([255, 0, 255]); // green/cyan excluded by existence, never picked
    expect(result.source).toBe("auto-subject-aware");
    expect(result.clearsEraseRadius).toBe(false);
    expect(result.minSubjectDistance).toBeCloseTo(20, 0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings![0]).toMatch(/no candidate clears eraseRadius/);
  });

  it("never keys a candidate absent from the sheet (green sheet + mint subject, production defect)", () => {
    // Production failure: a pure-green sticker sheet whose mint subject tips
    // sit 21 from green and 80 from cyan (both < eraseRadius 96) while magenta
    // scored 115 — old logic picked magenta, keyed nothing, and hard-failed on
    // foreground ratio. The existence check must select the measured green.
    const mint: RGB = [30, 235, 60]; // dist to green ≈ 70, to cyan ≈ 198, to magenta ≈ 383
    const data = makeBuffer(60, 60, GREEN, [{ x: 20, y: 20, w: 20, h: 20, color: mint }]);
    const result = selectMatteColor(data, 60, 60, 4, { mode: "subject-aware", pipeline: "v2" });

    expect(result.matte).toEqual([0, 255, 0]); // the actual background — NOT magenta
    expect(result.source).toBe("auto-subject-aware");
    expect(result.clearsEraseRadius).toBe(false); // mint is inside the erase radius
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings![0]).toMatch(/no candidate clears eraseRadius/);
  });

  it("falls back to the corner-sampled matte when no candidate matches the background", () => {
    const data = makeBuffer(60, 60, [0, 0, 255], [{ x: 20, y: 20, w: 20, h: 20, color: GREEN }]);
    const result = selectMatteColor(data, 60, 60, 4, { mode: "subject-aware" });

    // Blue sheet: magenta/green/cyan are all > eraseRadius from the sampled
    // background → corner fallback (never a hard matte_subject_collision).
    expect(result.source).toBe("auto-sampled");
    expect(result.matte[0]).toBeLessThanOrEqual(7);
    expect(result.matte[1]).toBeLessThanOrEqual(7);
    expect(result.matte[2]).toBeGreaterThanOrEqual(248);
    expect(result.clearsEraseRadius).toBe(true); // green subject is ~360 away
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings![0]).toMatch(/falling back to the corner-sampled matte/);
  });

  it("uses pipeline v2's hard threshold (96) as the default eraseRadius", () => {
    const pink: RGB = [255, 100, 200];
    const data = makeBuffer(60, 60, MAGENTA, [{ x: 20, y: 20, w: 20, h: 20, color: pink }]);
    const result = selectMatteColor(data, 60, 60, 4, { mode: "subject-aware" });
    expect(result.eraseRadius).toBe(96);
    // magenta min distance ≈ 114 still clears 96
    expect(result.matte).toEqual([255, 0, 255]);
    expect(result.clearsEraseRadius).toBe(true);
  });

  it("accepts custom candidates", () => {
    const pink: RGB = [255, 100, 200];
    const blue: MatteColor = [0, 0, 255];
    const data = makeBuffer(60, 60, [0, 0, 255], [{ x: 20, y: 20, w: 20, h: 20, color: pink }]);
    const result = selectMatteColor(data, 60, 60, 4, { mode: "subject-aware", candidates: [blue] });
    expect(result.matte).toEqual(blue);
    expect(result.source).toBe("auto-subject-aware");
    expect(result.candidateScores).toHaveLength(1);
    expect(result.clearsEraseRadius).toBe(true);
  });

  it("handles an image with no subject pixels (uniform background)", () => {
    const data = makeBuffer(30, 30, WHITE);
    const result = selectMatteColor(data, 30, 30, 4, { mode: "subject-aware" });
    // No candidate matches the white background → corner fallback to white.
    expect(result.source).toBe("auto-sampled");
    expect(result.clearsEraseRadius).toBe(true); // Infinity >= eraseRadius
    expect(result.matte[0]).toBeGreaterThanOrEqual(248);
    expect(result.matte[1]).toBeGreaterThanOrEqual(248);
    expect(result.matte[2]).toBeGreaterThanOrEqual(248);
    expect(result.warnings).toHaveLength(1);
  });
});

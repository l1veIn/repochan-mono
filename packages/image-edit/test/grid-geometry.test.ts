import { describe, it, expect } from "vitest";
import { computeCentroidGridGeometry, CENTROID_GRID_DEFAULTS } from "../src/grid-geometry.js";

// Synthetic RGBA sheets: fully transparent background, opaque solid rects as
// subjects. Pure Buffer fixtures — no sharp, no pngjs, no IO.

function makeSheet(width: number, height: number): Buffer {
  return Buffer.alloc(width * height * 4); // all zeros = fully transparent
}

/** Fill an opaque rectangle (inclusive bounds) into the RGBA sheet. */
function fillRect(buf: Buffer, width: number, x: number, y: number, w: number, h: number): void {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const idx = (py * width + px) * 4;
      buf[idx] = 40; buf[idx + 1] = 90; buf[idx + 2] = 160; buf[idx + 3] = 255;
    }
  }
}

describe("computeCentroidGridGeometry", () => {
  it("assigns a clean 3x3 sheet one subject per cell", () => {
    const width = 90, height = 90; // cell 30x30=900, minBlob = max(60, floor(900*0.005)=4) = 60
    const buf = makeSheet(width, height);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        fillRect(buf, width, col * 30 + 10, row * 30 + 10, 10, 10); // 100px each
      }
    }
    const result = computeCentroidGridGeometry(buf, width, height, 3, 3);
    expect(result.items).toHaveLength(9);
    expect(result.minBlobPixels).toBe(60);
    expect(result.sheetEdgeTouchPixels).toBe(0);
    for (const item of result.items) {
      expect(item.empty).toBe(false);
      expect(item.foregroundPixels).toBe(100);
      expect(item.componentCount).toBe(1);
      expect(item.splitFromMerged).toBe(false);
      expect(item.sheetEdgeTouchPixels).toBe(0);
    }
    const center = result.items[4];
    expect(center.cell).toMatchObject({ row: 1, col: 1, x: 30, y: 30, w: 30, h: 30 });
    expect(center.sourceBounds).toEqual({ x: 40, y: 40, w: 10, h: 10 });
    expect(center.foreground).toEqual({ x: 10, y: 10, w: 10, h: 10 }); // relative to cell origin
    expect(center.cropSize).toEqual({ w: 10, h: 10 });
  });

  it("keeps cross-cell overflow with the centroid cell (foreground may be negative / exceed cell)", () => {
    const width = 90, height = 90;
    const buf = makeSheet(width, height);
    // Cell 3 (origin 0,30): 14x10 blob at x20..33 — overflows 4px into cell 4, centroid x=26.5 stays in cell 3.
    fillRect(buf, width, 20, 40, 14, 10);
    // Cell 7 (origin 30,60): 10x14 blob at y56..69 — overflows 4px into cell 4 above, centroid y=62.5 stays in row 2.
    fillRect(buf, width, 30, 56, 10, 14);
    const result = computeCentroidGridGeometry(buf, width, height, 3, 3);

    const cell3 = result.items[3];
    expect(cell3.empty).toBe(false);
    expect(cell3.sourceBounds).toEqual({ x: 20, y: 40, w: 14, h: 10 });
    expect(cell3.foreground).toEqual({ x: 20, y: 10, w: 14, h: 10 }); // x+w = 34 > cellW 30

    const cell7 = result.items[7];
    expect(cell7.empty).toBe(false);
    expect(cell7.sourceBounds).toEqual({ x: 30, y: 56, w: 10, h: 14 });
    expect(cell7.foreground).toEqual({ x: 0, y: -4, w: 10, h: 14 }); // negative y: overflow into the row above

    expect(result.items[4].empty).toBe(true); // the overlapped cell owns nothing itself
  });

  it("splits a merged double subject at the grid line and relabels per cell (span > 1.5x cell)", () => {
    const width = 90, height = 90;
    const buf = makeSheet(width, height);
    // One connected blob spanning cells 3 and 4: 55x16, bbox width 55 > 1.5*30 = 45.
    fillRect(buf, width, 5, 35, 55, 16);
    const result = computeCentroidGridGeometry(buf, width, height, 3, 3);

    const cell3 = result.items[3];
    expect(cell3.empty).toBe(false);
    expect(cell3.splitFromMerged).toBe(true);
    expect(cell3.sourceBounds).toEqual({ x: 5, y: 35, w: 25, h: 16 }); // cut at x=30
    expect(cell3.foreground).toEqual({ x: 5, y: 5, w: 25, h: 16 });
    expect(cell3.foregroundPixels).toBe(25 * 16);

    const cell4 = result.items[4];
    expect(cell4.empty).toBe(false);
    expect(cell4.splitFromMerged).toBe(true);
    expect(cell4.sourceBounds).toEqual({ x: 30, y: 35, w: 30, h: 16 }); // cell 4 spans x30..59
    expect(cell4.foreground).toEqual({ x: 0, y: 5, w: 30, h: 16 });
    expect(cell4.foregroundPixels).toBe(30 * 16);
  });

  it("unions border-hugging debris into the owner bbox by default (PR7) and keeps non-border effects too", () => {
    const width = 150, height = 150; // cell 50x50=2500, minBlob = max(60, floor(2500*0.005)=12) = 60
    const buf = makeSheet(width, height);
    // Cell 4 (origin 50,50): main 24x24 at (60,60) = 576px.
    fillRect(buf, width, 60, 60, 24, 24);
    // Border debris 11x11 at (50,86) = 121px: hugs left cell edge (dist 0 < 2), 121 < 0.30*576.
    // Sticker sheets hug decorations to cell edges on purpose — the default keeps them.
    fillRect(buf, width, 50, 86, 11, 11);
    // Non-border effect 11x11 at (86,54) = 121px: >=2px from every cell edge → kept as effect.
    fillRect(buf, width, 86, 54, 11, 11);
    const result = computeCentroidGridGeometry(buf, width, height, 3, 3);

    const cell4 = result.items[4];
    expect(cell4.empty).toBe(false);
    expect(cell4.componentCount).toBe(3); // main + effect + debris (keep-with-owner)
    expect(cell4.foregroundPixels).toBe(576 + 121 + 121);
    // union extends left to x=50 via the debris
    expect(cell4.sourceBounds).toEqual({ x: 50, y: 54, w: 47, h: 43 });
    expect(cell4.foreground).toEqual({ x: 0, y: 4, w: 47, h: 43 });
    expect(cell4.cropSize).toEqual({ w: 47, h: 43 });
  });

  it("debrisPolicy drop (explicit opt-out) discards border debris but keeps non-border effects", () => {
    const width = 150, height = 150;
    const buf = makeSheet(width, height);
    fillRect(buf, width, 60, 60, 24, 24); // main 576px
    fillRect(buf, width, 50, 86, 11, 11); // border debris 121px
    fillRect(buf, width, 86, 54, 11, 11); // effect 121px
    const result = computeCentroidGridGeometry(buf, width, height, 3, 3, { debrisPolicy: "drop" });

    const cell4 = result.items[4];
    expect(cell4.componentCount).toBe(2); // main + effect; debris dropped
    expect(cell4.foregroundPixels).toBe(576 + 121);
    // union of main (60..83, 60..83) and effect (86..96, 54..64)
    expect(cell4.sourceBounds).toEqual({ x: 60, y: 54, w: 37, h: 30 });
    expect(cell4.foreground).toEqual({ x: 10, y: 4, w: 37, h: 30 });
  });

  it("drops noise below the noiseMinAbs floor and flags the cell empty (cell-relative fraction is smaller here)", () => {
    const width = 120, height = 120; // cell 40x40=1600, minBlob = max(60, floor(1600*0.005)=8) = 60
    const buf = makeSheet(width, height);
    fillRect(buf, width, 5, 5, 7, 7); // 49px < 60 → noise, cell 0 becomes empty
    fillRect(buf, width, 45, 5, 9, 9); // 81px ≥ 60 → kept in cell 1
    const result = computeCentroidGridGeometry(buf, width, height, 3, 3);
    expect(result.minBlobPixels).toBe(60);

    const cell0 = result.items[0];
    expect(cell0.empty).toBe(true);
    expect(cell0.foreground).toBeNull();
    expect(cell0.sourceBounds).toBeNull();
    expect(cell0.cropSize).toBeNull();
    expect(cell0.foregroundPixels).toBe(0);
    expect(cell0.componentCount).toBe(0);

    expect(result.items[1].empty).toBe(false);
    expect(result.items[1].foregroundPixels).toBe(81);
  });

  it("keeps a small floating decoration that a whole-sheet fraction would have eaten (PR7 production fix)", () => {
    // 300x300 3x3: cell 100x100=10000 → minBlob = max(60, floor(10000*0.005)=50) = 60.
    // Under the pre-PR7 whole-sheet rule the floor was floor(90000*0.005)=450,
    // which dropped the 200px floating decoration as noise.
    const width = 300, height = 300;
    const buf = makeSheet(width, height);
    fillRect(buf, width, 130, 130, 40, 40); // cell 4 main: 1600px
    fillRect(buf, width, 170, 115, 20, 10); // floating decoration: 200px, interior (not border-hugging)
    const result = computeCentroidGridGeometry(buf, width, height, 3, 3);
    expect(result.minBlobPixels).toBe(60);

    const cell4 = result.items[4];
    expect(cell4.empty).toBe(false);
    expect(cell4.componentCount).toBe(2); // main + decoration survive and union
    expect(cell4.foregroundPixels).toBe(1600 + 200);
    expect(cell4.sourceBounds).toEqual({ x: 130, y: 115, w: 60, h: 55 });
  });

  it("lets the cell-relative fraction raise the floor above noiseMinAbs on large cells", () => {
    const width = 420, height = 420; // cell 140x140=19600 → minBlob = max(60, floor(19600*0.005)=98) = 98
    const buf = makeSheet(width, height);
    fillRect(buf, width, 10, 10, 9, 9); // 81px < 98 → noise, cell 0 empty
    fillRect(buf, width, 150, 10, 10, 10); // 100px ≥ 98 → kept in cell 1
    const result = computeCentroidGridGeometry(buf, width, height, 3, 3);
    expect(result.minBlobPixels).toBe(98);
    expect(result.items[0].empty).toBe(true);
    expect(result.items[1].empty).toBe(false);
    expect(result.items[1].foregroundPixels).toBe(100);
  });

  it("applies the absolute noiseMinAbs floor on small sheets", () => {
    const width = 60, height = 60; // cell 20x20=400, minBlob = max(60, floor(400*0.005)=2) = 60
    const buf = makeSheet(width, height);
    fillRect(buf, width, 2, 2, 7, 7); // 49px < 60 → noise
    fillRect(buf, width, 25, 5, 8, 8); // 64px ≥ 60 → kept in cell 1
    const result = computeCentroidGridGeometry(buf, width, height, 3, 3);
    expect(result.minBlobPixels).toBe(60);
    expect(result.items[0].empty).toBe(true);
    expect(result.items[1].empty).toBe(false);
  });

  it("counts foreground pixels touching the outer sheet boundary per item and in total", () => {
    const width = 90, height = 90;
    const buf = makeSheet(width, height);
    fillRect(buf, width, 0, 35, 10, 10); // cell 3: touches left sheet edge → 10 border pixels
    fillRect(buf, width, 38, 80, 10, 10); // cell 7: touches bottom sheet edge → 10 border pixels
    fillRect(buf, width, 40, 40, 10, 10); // cell 4: interior, no border contact
    const result = computeCentroidGridGeometry(buf, width, height, 3, 3);

    expect(result.items[3].sheetEdgeTouchPixels).toBe(10);
    expect(result.items[7].sheetEdgeTouchPixels).toBe(10);
    expect(result.items[4].sheetEdgeTouchPixels).toBe(0);
    expect(result.sheetEdgeTouchPixels).toBe(20);
  });

  it("honours option overrides while keeping pinned defaults", () => {
    expect(CENTROID_GRID_DEFAULTS).toEqual({
      alphaThreshold: 16,
      noiseMinAbs: 60,
      minBlobFraction: 0.005,
      mergedSpanFactor: 1.5,
      debrisFraction: 0.3,
      debrisBorderTolPx: 2,
      debrisPolicy: "keep-with-owner",
    });
    const width = 90, height = 90; // cell 30x30=900
    const buf = makeSheet(width, height);
    fillRect(buf, width, 40, 40, 10, 10); // 100px
    // Raise the fraction so the cell-relative floor exceeds the blob.
    const strict = computeCentroidGridGeometry(buf, width, height, 3, 3, { minBlobFraction: 0.2 });
    expect(strict.minBlobPixels).toBe(Math.max(60, Math.floor(900 * 0.2))); // 180
    expect(strict.items[4].empty).toBe(true); // 100 < 180 → dropped under the override
  });
});

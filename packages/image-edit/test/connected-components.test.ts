import { describe, it, expect } from "vitest";
import { findConnectedComponents } from "../src/index.js";

// Pure connected-component tests (migrated from the removed stickers.test.ts;
// the extract-stickers adapter tests were dropped with the legacy surface).

describe("findConnectedComponents (pure)", () => {
  it("finds a single blob in a uniform-alpha mask", () => {
    const width = 10, height = 10;
    const alpha = new Uint8Array(width * height).fill(200); // all foreground
    const blobs = findConnectedComponents(alpha, width, height, 128);
    expect(blobs).toHaveLength(1);
    const b = blobs[0];
    expect(b.x0).toBe(0); expect(b.y0).toBe(0);
    expect(b.x1).toBe(9); expect(b.y1).toBe(9);
    expect(b.size).toBe(100);
  });

  it("finds four separate blobs in a 2x2 sparse grid", () => {
    const width = 30, height = 30;
    const alpha = new Uint8Array(width * height).fill(0); // all background
    // place 4 small squares: top-left, top-right, bottom-left, bottom-right
    const squares = [[2, 2], [20, 2], [2, 20], [20, 20]];
    for (const [sx, sy] of squares) {
      for (let dy = 0; dy < 6; dy++) {
        for (let dx = 0; dx < 6; dx++) {
          alpha[width * (sy + dy) + (sx + dx)] = 200;
        }
      }
    }
    const blobs = findConnectedComponents(alpha, width, height, 128);
    expect(blobs).toHaveLength(4);
    // each blob should be 6x6 = 36px
    for (const b of blobs) expect(b.size).toBe(36);
  });

  it("treats pixels below threshold as background", () => {
    const width = 5, height = 1;
    const alpha = new Uint8Array([200, 200, 50, 200, 200]);
    const blobs = findConnectedComponents(alpha, width, height, 128);
    // 50 < 128 splits into 2 blobs
    expect(blobs).toHaveLength(2);
    expect(blobs[0].size).toBe(2);
    expect(blobs[1].size).toBe(2);
  });

  it("returns empty for an all-background mask", () => {
    const alpha = new Uint8Array(100).fill(0);
    expect(findConnectedComponents(alpha, 10, 10, 128)).toHaveLength(0);
  });
});

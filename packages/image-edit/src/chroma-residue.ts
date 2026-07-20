// ---------------------------------------------------------------------------
// chroma_residue detection (design doc §2 "chroma_residue 算法").
//
// Normative algorithm: recompute on the chroma OUTPUT RGBA — independent of
// any pipeline-internal depth array. v2's `depth == 0` marks KEYED pixels
// which are already written (0,0,0,0), so `opaque ∧ depth==0` is always empty
// and must NOT be used. Instead:
//
//   residue(p) := opaque(p)                       (alpha >= alphaThreshold)
//              AND keyTintScore(rgb(p), matte) >= fringeDelta
//              AND distTransparent[p] <= edgeDepthPx
//
// where distTransparent is the 8-connected Chebyshev distance to the nearest
// transparent pixel (alpha < alphaThreshold), scanned only up to edgeDepthPx.
// ratio = residuePixels / max(1, subjectPixels). The caller decides the
// hard-fail threshold (qa.residueMaxFraction, default 0.001).
//
// Intent: catch opaque key-colored stains hugging regions that should be
// transparent, while leaving intentional key-tinted material deep inside the
// subject (dist > edgeDepthPx) and normal despilled anti-aliased edges
// (tint < fringeDelta) alone.
// ---------------------------------------------------------------------------

import { keyTintScore } from "./chroma-pipeline.js";
import type { MatteColor } from "./chroma-key.js";

export const CHROMA_RESIDUE_DEFAULTS = {
  /** Alpha at or above which a pixel counts as opaque (subject). */
  alphaThreshold: 16,
  /** Minimum key tint for a pixel to count as residue. Shared v1/v2 floor. */
  fringeDelta: 18,
  /** Chebyshev distance to transparent within which opaque key-tint counts. */
  edgeDepthPx: 2,
} as const;

export type ChromaResidueOptions = {
  alphaThreshold?: number;
  fringeDelta?: number;
  edgeDepthPx?: number;
};

export type ChromaResidueResult = {
  /** Opaque pixels (alpha >= alphaThreshold). */
  subjectPixels: number;
  /** Opaque key-tinted pixels within edgeDepthPx of a transparent pixel. */
  residuePixels: number;
  /** residuePixels / max(1, subjectPixels). */
  ratio: number;
  alphaThreshold: number;
  fringeDelta: number;
  edgeDepthPx: number;
};

/**
 * Measure chroma residue on a chroma pipeline's RGBA output.
 * Pure and synchronous; shared by v1 and v2 outputs.
 */
export function measureChromaResidue(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  matte: MatteColor,
  options?: ChromaResidueOptions,
): ChromaResidueResult {
  if (data.length !== width * height * 4) {
    throw new Error(`chroma-residue: expected an RGBA buffer of ${width * height * 4} bytes, got ${data.length}.`);
  }
  const alphaThreshold = options?.alphaThreshold ?? CHROMA_RESIDUE_DEFAULTS.alphaThreshold;
  const fringeDelta = options?.fringeDelta ?? CHROMA_RESIDUE_DEFAULTS.fringeDelta;
  const edgeDepthPx = options?.edgeDepthPx ?? CHROMA_RESIDUE_DEFAULTS.edgeDepthPx;

  const pixelCount = width * height;
  const UNSEEN = 255;
  const dist = new Uint8Array(pixelCount).fill(UNSEEN);
  let frontier: number[] = [];
  let subjectPixels = 0;

  for (let i = 0; i < pixelCount; i++) {
    if (data[i * 4 + 3] < alphaThreshold) {
      dist[i] = 0;
      frontier.push(i);
    } else {
      subjectPixels++;
    }
  }

  // Multi-source 8-connected BFS from transparent pixels, capped at edgeDepthPx.
  let depth = 0;
  while (frontier.length > 0 && depth < edgeDepthPx) {
    depth++;
    const next: number[] = [];
    for (const index of frontier) {
      const x = index % width;
      const y = Math.floor(index / width);
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbor = ny * width + nx;
          if (dist[neighbor] === UNSEEN) {
            dist[neighbor] = depth;
            next.push(neighbor);
          }
        }
      }
    }
    frontier = next;
  }

  let residuePixels = 0;
  for (let i = 0; i < pixelCount; i++) {
    // dist > 0 ⇒ opaque (transparent pixels sit at 0); dist <= edgeDepthPx ⇒ hugs transparency.
    if (dist[i] === 0 || dist[i] > edgeDepthPx) continue;
    const q = i * 4;
    const tint = keyTintScore([data[q], data[q + 1], data[q + 2]], matte);
    if (tint >= fringeDelta) residuePixels++;
  }

  return {
    subjectPixels,
    residuePixels,
    ratio: residuePixels / Math.max(1, subjectPixels),
    alphaThreshold,
    fringeDelta,
    edgeDepthPx,
  };
}

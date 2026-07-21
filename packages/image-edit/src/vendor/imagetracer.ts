// ---------------------------------------------------------------------------
// Typed shim over the vendored imagetracer.js v1.2.6 (see ./imagetracer.cjs —
// the upstream single-file build, header with The Unlicense text retained).
// Upstream: https://github.com/jankovicsandras/imagetracerjs (public domain).
// Attribution is recorded in packages/image-edit/NOTICE.
// ---------------------------------------------------------------------------

import { createRequire } from "node:module";

export type ImageTracerColor = { r: number; g: number; b: number; a: number };

export type ImageTracerOptions = {
  // Tracing
  ltres?: number;
  qtres?: number;
  pathomit?: number;
  rightangleenhance?: boolean;
  // Color quantization
  colorsampling?: number;
  numberofcolors?: number;
  mincolorratio?: number;
  colorquantcycles?: number;
  /** Custom palette; when set, sampling is skipped. */
  pal?: ImageTracerColor[];
  // Layering
  layering?: number;
  // SVG rendering
  strokewidth?: number;
  linefilter?: boolean;
  scale?: number;
  roundcoords?: number;
  viewbox?: boolean;
  desc?: boolean;
  lcpr?: number;
  qcpr?: number;
  // Blur
  blurradius?: number;
  blurdelta?: number;
  corsenabled?: boolean;
};

export type TraceSegment = {
  type: "L" | "Q";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3?: number;
  y3?: number;
};

export type TracedPath = {
  segments: TraceSegment[];
  holechildren: number[];
  isholepath: boolean;
};

export type TraceData = {
  layers: TracedPath[][];
  palette: ImageTracerColor[];
  width: number;
  height: number;
};

export type TraceImageData = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type ImageTracerApi = {
  versionnumber: string;
  imagedataToTracedata(imgd: TraceImageData, options?: ImageTracerOptions): TraceData;
  svgpathstring(tracedata: TraceData, lnum: number, pathnum: number, options: ImageTracerOptions): string;
};

const require = createRequire(import.meta.url);

/** Singleton instance (upstream exports `new ImageTracer()`). */
export const imageTracer = require("./imagetracer.cjs") as ImageTracerApi;

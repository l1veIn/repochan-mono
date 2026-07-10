declare module "gifenc" {
  export interface GifEncoderInstance {
    writeFrame(
      index: Uint8Array | number[],
      width: number,
      height: number,
      opts?: {
        palette?: number[][];
        delay?: number;
        transparent?: boolean;
        transparentIndex?: number;
        dispose?: number;
        repeat?: number;
        first?: boolean;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
    writeHeader(): void;
  }

  export function GIFEncoder(width: number, height: number, opts?: { auto?: boolean; initialCapacity?: number }): GifEncoderInstance;

  export function quantize(
    rgba: Uint8Array,
    maxColors: number,
    opts?: { format?: "rgb565" | "rgba4444" | "rgb444"; oneBitAlpha?: boolean | number; clearAlpha?: boolean; clearAlphaThreshold?: number; clearAlphaColor?: number },
  ): number[][];

  export function applyPalette(
    rgba: Uint8Array,
    palette: number[][],
    format?: "rgb565" | "rgba4444" | "rgb444",
  ): number[];

  export function nearestColor(palette: number[][], pixel: number[]): number;
  export function nearestColorIndex(palette: number[][], pixel: number[]): number;
  export function prequantize(rgba: Uint8Array, opts?: { roundRGB?: number; roundAlpha?: number }): void;
  export function snapColorsToPalette(palette: number[][], maxColors: number): void;

  const _default: {
    GIFEncoder: typeof GIFEncoder;
    quantize: typeof quantize;
    applyPalette: typeof applyPalette;
    nearestColor: typeof nearestColor;
    nearestColorIndex: typeof nearestColorIndex;
    prequantize: typeof prequantize;
    snapColorsToPalette: typeof snapColorsToPalette;
  };
  export default _default;
}

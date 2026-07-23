import { describe, it, expect, afterEach, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { readPngSize } from "@repochan/image-edit";
import {
  runImageEditChromaKey,
  runImageEditBgRemove,
  runImageEditExtract,
  runImageEditLayoutGuide,
} from "./image.js";
import { isExtractError, printError, UsageError } from "../lib/output.js";
import { ImageMlCapabilityRequiredError } from "../lib/image-ml-capability.js";

// ---------------------------------------------------------------------------
// PR4 CLI E2E (cutout-slice-stability design, "Structured failure plumbing"):
//   - empty-cell sheet → `image edit extract --json` → parseable
//     { ok:false, error:"ExtractError", defects:[… empty_cell …] }, exit 1
//     (both through the run function + printError, and through the real CLI
//     binary incl. main()'s --json plumbing)
//   - extract success path, layout-guide generation, chroma-key --pipeline v2
//
// Fixtures are hand-encoded PNGs (zero extra deps): a 90×90 magenta-matte
// 3×3 sheet with a green circle per cell.
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = path.resolve(HERE, "..", "index.ts");
const TSX_BIN = path.resolve(HERE, "..", "..", "..", "..", "node_modules", ".bin", "tsx");

const W = 90;
const H = 90;
const CELL = 30;
const MATTE: [number, number, number] = [255, 0, 255];
const SUBJECT: [number, number, number] = [0, 180, 40];
const KEYS = ["welcome", "searching", "loading", "empty", "error", "success", "not-found", "cta", "cozy"];

// ── Minimal PNG encoder (RGBA8, filter 0, zlib deflate) ────────────────────

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const scan = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    scan[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(scan, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scan)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeGridRgba(skipCells: number[] = []): Buffer {
  const rgba = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    rgba[p * 4] = MATTE[0];
    rgba[p * 4 + 1] = MATTE[1];
    rgba[p * 4 + 2] = MATTE[2];
    rgba[p * 4 + 3] = 255;
  }
  const skip = new Set(skipCells);
  for (let index = 0; index < 9; index++) {
    if (skip.has(index)) continue;
    const cx = (index % 3) * CELL + 15;
    const cy = Math.floor(index / 3) * CELL + 15;
    for (let y = cy - 6; y <= cy + 6; y++) {
      for (let x = cx - 6; x <= cx + 6; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > 36) continue;
        const q = (y * W + x) * 4;
        rgba[q] = SUBJECT[0];
        rgba[q + 1] = SUBJECT[1];
        rgba[q + 2] = SUBJECT[2];
      }
    }
  }
  return rgba;
}

// ── Test scaffolding ────────────────────────────────────────────────────────

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repochan-image-"));
  tempDirs.push(dir);
  return dir;
}

async function writeGrid(dir: string, skipCells: number[] = []): Promise<string> {
  const file = path.join(dir, "grid.png");
  await writeFile(file, encodePng(W, H, makeGridRgba(skipCells)));
  return file;
}

function captureStdout(): string[] {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((v) => lines.push(String(v)));
  return lines;
}

describe("image edit extract", () => {
  it("fails an empty-cell sheet with structured ExtractError JSON (--json)", async () => {
    const dir = await tempDir();
    const grid = await writeGrid(dir, [4]); // center cell empty
    const outDir = path.join(dir, "out");

    let thrown: unknown;
    try {
      await runImageEditExtract(dir, grid, {
        rows: 3, cols: 3, out: outDir, mapping: KEYS.join(","), normalize: 64, json: true,
      });
    } catch (err) {
      thrown = err;
    }
    expect(isExtractError(thrown)).toBe(true);
    // Failed extraction must not publish a partial output directory.
    expect(existsSync(outDir)).toBe(false);

    // What main() does with it under --json:
    const lines = captureStdout();
    printError(thrown, { json: true });
    vi.restoreAllMocks();
    const payload = JSON.parse(lines.join("\n"));
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("ExtractError");
    expect(payload.defects.map((d: { code: string }) => d.code)).toContain("empty_cell");
    expect(payload.qa.strategyUsed).toBe("chroma-grid");
  });

  it("exits 1 with parseable defects JSON through the real CLI binary", async () => {
    const dir = await tempDir();
    const grid = await writeGrid(dir, [4]);
    const outDir = path.join(dir, "out");

    const res = spawnSync(
      TSX_BIN,
      [CLI_ENTRY, "image", "edit", "extract", grid,
        "--rows", "3", "--cols", "3", "--out", outDir,
        "--mapping", KEYS.join(","), "--normalize", "64", "--json"],
      { cwd: dir, encoding: "utf8", timeout: 180_000 },
    );
    expect(res.error).toBeUndefined();
    expect(res.status).toBe(1);
    const payload = JSON.parse(res.stdout);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("ExtractError");
    expect(payload.defects.map((d: { code: string }) => d.code)).toContain("empty_cell");
  }, 200_000);

  it("extracts a clean 3×3 sheet (chroma-grid + v2 defaults, PR7)", async () => {
    const dir = await tempDir();
    const grid = await writeGrid(dir);
    const outDir = path.join(dir, "out");

    const lines = captureStdout();
    const result = await runImageEditExtract(dir, grid, {
      rows: 3, cols: 3, out: outDir, mapping: KEYS.join(","), normalize: 64, json: true,
    });
    vi.restoreAllMocks();

    expect(result!.items).toHaveLength(9);
    expect(result!.qa.ok).toBe(true);
    expect(result!.qa.strategyUsed).toBe("chroma-grid");
    expect(result!.qa.pipeline).toBe("v2");
    for (const item of result!.items) {
      expect(existsSync(path.join(outDir, item.file))).toBe(true);
    }
    const payload = JSON.parse(lines.join("\n"));
    expect(payload.items).toHaveLength(9);
    expect(payload.strategy).toBe("chroma-grid");
    expect(payload.pipeline).toBe("v2");
    // Corner auto-sample quantizes to bin centers (#fc04fc for a #ff00ff matte).
    expect(payload.matteColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(payload.matteColorSource).toBe("auto-sampled");
  });

  it("honors the explicit equal-cell + v1 escape hatch", async () => {
    const dir = await tempDir();
    const grid = await writeGrid(dir);
    const outDir = path.join(dir, "out");

    captureStdout();
    const result = await runImageEditExtract(dir, grid, {
      rows: 3, cols: 3, out: outDir, mapping: KEYS.join(","), normalize: 64,
      strategy: "equal-cell", pipeline: "v1", json: true,
    });
    vi.restoreAllMocks();

    expect(result!.items).toHaveLength(9);
    expect(result!.qa.ok).toBe(true);
    expect(result!.qa.strategyUsed).toBe("equal-cell");
    expect(result!.qa.pipeline).toBe("v1");
    for (const item of result!.items) {
      expect(existsSync(path.join(outDir, item.file))).toBe(true);
    }
  });

  it("rejects invalid arguments as UsageError", async () => {
    const dir = await tempDir();
    const grid = await writeGrid(dir);
    const base = { rows: 3, cols: 3, out: path.join(dir, "out"), mapping: KEYS.join(","), normalize: 64 };
    await expect(runImageEditExtract(dir, undefined, base)).rejects.toThrow(UsageError);
    await expect(runImageEditExtract(dir, grid, { ...base, out: undefined })).rejects.toThrow(UsageError);
    await expect(runImageEditExtract(dir, grid, { ...base, strategy: "bogus" })).rejects.toThrow(UsageError);
    await expect(runImageEditExtract(dir, grid, { ...base, pipeline: "v3" })).rejects.toThrow(UsageError);
    await expect(runImageEditExtract(dir, grid, { ...base, mapping: undefined })).rejects.toThrow(UsageError);
    await expect(runImageEditExtract(dir, grid, { ...base, strategy: "hybrid" })).rejects.toThrow(UsageError);
    await expect(runImageEditExtract(dir, grid, { ...base, mlFallback: true })).rejects.toThrow(UsageError);
    await expect(runImageEditExtract(dir, grid, { ...base, normalize: undefined })).rejects.toThrow(UsageError);
  });
});

describe("image edit ML capability preflight", () => {
  it("guards bg-remove before image processing", async () => {
    const dir = await tempDir();
    const source = await writeGrid(dir);
    await expect(runImageEditBgRemove(dir, source, { out: path.join(dir, "cutout.png") }, { homeDir: dir }))
      .rejects.toBeInstanceOf(ImageMlCapabilityRequiredError);
    expect(existsSync(path.join(dir, "cutout.png"))).toBe(false);
  });

  it("rejects the unavailable large model before capability lookup", async () => {
    const dir = await tempDir();
    const source = await writeGrid(dir);
    await expect(runImageEditBgRemove(dir, source, {
      out: path.join(dir, "cutout.png"), model: "large",
    }, { homeDir: dir })).rejects.toThrow(UsageError);
  });

  it.each(["ml-blobs", "hybrid"])("guards extract strategy %s with the same capability error", async (strategy) => {
    const dir = await tempDir();
    const source = await writeGrid(dir);
    await expect(runImageEditExtract(dir, source, {
      rows: 3,
      cols: 3,
      out: path.join(dir, "out"),
      strategy,
      ...(strategy === "hybrid" ? { mapping: KEYS.join(","), normalize: 64, mlFallback: true } : {}),
    }, { homeDir: dir })).rejects.toBeInstanceOf(ImageMlCapabilityRequiredError);
    expect(existsSync(path.join(dir, "out"))).toBe(false);
  });
});

describe("image edit layout-guide", () => {
  it("renders the default 3×3 guide PNG", async () => {
    const dir = await tempDir();
    const out = path.join(dir, "guide.png");
    const lines = captureStdout();
    await runImageEditLayoutGuide(dir, { rows: 3, cols: 3, out, json: true });
    vi.restoreAllMocks();
    expect(existsSync(out)).toBe(true);
    const size = await readPngSize(out);
    expect(size).toEqual({ width: 1023, height: 1023 });
    const payload = JSON.parse(lines.join("\n"));
    expect(payload).toMatchObject({ rows: 3, cols: 3, width: 1023, height: 1023, cellWidth: 341, cellHeight: 341 });
  });

  it("requires --out and a positive grid", async () => {
    const dir = await tempDir();
    await expect(runImageEditLayoutGuide(dir, { rows: 3, cols: 3 })).rejects.toThrow(UsageError);
    await expect(runImageEditLayoutGuide(dir, { rows: 0, cols: 3, out: "g.png" })).rejects.toThrow(UsageError);
  });
});

describe("image edit chroma-key --pipeline", () => {
  it("defaults to v2 (PR7); explicit v1 remains as the escape hatch", async () => {
    const dir = await tempDir();
    const src = path.join(dir, "cutout.png");
    // 30×30 magenta matte with a green circle subject.
    const size = 30;
    const rgba = Buffer.alloc(size * size * 4);
    for (let p = 0; p < size * size; p++) {
      const x = p % size;
      const y = Math.floor(p / size);
      const subject = (x - 15) ** 2 + (y - 15) ** 2 <= 36;
      const c = subject ? SUBJECT : MATTE;
      rgba[p * 4] = c[0];
      rgba[p * 4 + 1] = c[1];
      rgba[p * 4 + 2] = c[2];
      rgba[p * 4 + 3] = 255;
    }
    await writeFile(src, encodePng(size, size, rgba));

    const lines = captureStdout();
    const outDefault = path.join(dir, "cutout-default.png");
    await runImageEditChromaKey(dir, src, { out: outDefault, json: true });
    vi.restoreAllMocks();
    expect(existsSync(outDefault)).toBe(true);
    const payload = JSON.parse(lines.join("\n"));
    expect(payload.pipeline).toBe("v2");

    const v1Lines = captureStdout();
    const outV1 = path.join(dir, "cutout-v1.png");
    await runImageEditChromaKey(dir, src, { out: outV1, pipeline: "v1", json: true });
    vi.restoreAllMocks();
    expect(existsSync(outV1)).toBe(true);
    expect(JSON.parse(v1Lines.join("\n")).pipeline).toBe("v1");

    await expect(runImageEditChromaKey(dir, src, { out: "x.png", pipeline: "v3" })).rejects.toThrow(UsageError);
  });
});

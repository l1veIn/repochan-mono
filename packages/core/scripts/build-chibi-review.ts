/**
 * Build a human-reviewable chibi-slicing gallery using ML matting.
 *
 * For every original grid in chibi-review/original/, produces:
 *   chibi-review/tiles-with-bg/<name>/sNN.png          — equal-cell crops, NO matting
 *   chibi-review/stickers-ml/<name>/sNN.png            — ML-matted (ISNet) + sliced
 *
 * The ML pipeline matches production: mat the WHOLE grid once, then slice the
 * transparent result. This lets a reviewer judge (a) slicing alignment
 * (tiles-with-bg) and (b) ML matting quality incl. hair/halo/non-white bg
 * (stickers-ml) — the cases where the old flood-fill failed.
 *
 * Run from repo root: node_modules/.bin/tsx packages/core/scripts/build-chibi-review.ts
 */
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { removeBackground } from "@imgly/background-removal-node";
import { computeTileCells, readPngSize, findConnectedComponents } from "../src/entities/index.js";

const ROWS = 4;
const COLS = 4;
const MODEL = "small";

// Resolve imgly's vendored sharp (0.32) for the post-matting slice, so this
// script does not add sharp as a separate dependency.
const require = createRequire(import.meta.url);
const IMGLY_DIST = path.dirname(require.resolve("@imgly/background-removal-node"));
const IMGLY_PUBLIC_PATH = `file://${IMGLY_DIST}/`;
const sharp = (await import(require.resolve("sharp", { paths: [IMGLY_DIST] }))).default;

const REPO_ROOT = (() => {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("repo root not found");
})();

const REVIEW_DIR = path.join(REPO_ROOT, "chibi-review");
const ORIGINAL_DIR = path.join(REVIEW_DIR, "original");
const TILES_BG_DIR = path.join(REVIEW_DIR, "tiles-with-bg");
const STICKERS_ML_DIR = path.join(REVIEW_DIR, "stickers-ml");

async function processOne(name: string, srcPath: string) {
  const { width, height } = await readPngSize(srcPath);
  const tiles = computeTileCells(width, height, ROWS, COLS);

  const tilesOut = path.join(TILES_BG_DIR, name);
  const stickersOut = path.join(STICKERS_ML_DIR, name);
  await fs.mkdir(tilesOut, { recursive: true });
  await fs.mkdir(stickersOut, { recursive: true });

  // ── tiles-with-bg: slice the ORIGINAL grid (no matting) ──────────────
  const rawOrig = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const gridOrig = rawOrig.data;
  const chOrig = rawOrig.info.channels;

  // ── ML matting: run ISNet on the WHOLE grid once ─────────────────────
  const srcBuf = await fs.readFile(srcPath);
  const mattedBlob = await removeBackground(new Blob([srcBuf], { type: "image/png" }), {
    publicPath: IMGLY_PUBLIC_PATH,
    model: MODEL,
  });
  const mattedBuf = Buffer.from(await mattedBlob.arrayBuffer());
  const rawMat = await sharp(mattedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const gridMat = rawMat.data;
  const chMat = rawMat.info.channels;

  const stats: Array<{ idx: number; transparentPct: number; opaquePct: number; featherPct: number; bbox: string }> = [];

  // ── tiles-with-bg: equal-cell slice of ORIGINAL (diagnostic: shows misalignment) ──
  for (let i = 0; i < tiles.cells.length; i++) {
    const { x, y, w, h } = tiles.cells[i];
    const idx2 = String(i).padStart(2, "0");
    const tileBuf = Buffer.alloc(w * h * 4);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const sIdx = (width * (y + dy) + (x + dx)) * chOrig;
        const dIdx = (w * dy + dx) << 2;
        tileBuf[dIdx] = gridOrig[sIdx];
        tileBuf[dIdx + 1] = gridOrig[sIdx + 1];
        tileBuf[dIdx + 2] = gridOrig[sIdx + 2];
        tileBuf[dIdx + 3] = 255;
      }
    }
    await sharp(tileBuf, { raw: { width: w, height: h, channels: 4 } }).png().toFile(path.join(tilesOut, `s${idx2}.png`));
  }

  // ── stickers-ml: smart blob localization from the matting alpha mask ────
  // This is the production path: find each sticker's true bbox via connected
  // components on the alpha, crop precisely (no equal-cell assumption).
  const alpha = new Uint8Array(width * height);
  for (let p = 0, q = 3; p < alpha.length; p++, q += chMat) alpha[p] = gridMat[q];
  const allBlobs = findConnectedComponents(alpha, width, height, 128);
  const minBlob = Math.floor(width * height * 0.005);
  const blobs = allBlobs.filter((b) => b.size >= minBlob);

  // Sort reading-order: by Y-centroid into ROWS bands, then by X within band.
  blobs.sort((a, b) => a.cy - b.cy);
  const band = Math.ceil(blobs.length / ROWS);
  const sorted: typeof blobs = [];
  for (let r = 0; r < ROWS; r++) {
    const slice = blobs.slice(r * band, Math.min((r + 1) * band, blobs.length));
    slice.sort((a, b) => a.cx - b.cx);
    sorted.push(...slice);
  }

  const mismatchNote = sorted.length !== ROWS * COLS ? ` [MISMATCH: ${sorted.length}≠${ROWS * COLS}]` : "";
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    const stickerBuf = Buffer.alloc(bw * bh * 4);
    for (let dy = 0; dy < bh; dy++) {
      for (let dx = 0; dx < bw; dx++) {
        const sIdx = (width * (b.y0 + dy) + (b.x0 + dx)) * chMat;
        const dIdx = (bw * dy + dx) << 2;
        stickerBuf[dIdx] = gridMat[sIdx];
        stickerBuf[dIdx + 1] = gridMat[sIdx + 1];
        stickerBuf[dIdx + 2] = gridMat[sIdx + 2];
        stickerBuf[dIdx + 3] = chMat >= 4 ? gridMat[sIdx + 3] : 255;
      }
    }
    await sharp(stickerBuf, { raw: { width: bw, height: bh, channels: 4 } }).png().toFile(path.join(stickersOut, `s${String(i).padStart(2, "0")}.png`));

    let t = 0, o = 0, f = 0;
    for (let p = 3; p < stickerBuf.length; p += 4) {
      if (stickerBuf[p] === 0) t++;
      else if (stickerBuf[p] === 255) o++;
      else f++;
    }
    const total = bw * bh;
    stats.push({ idx: i, transparentPct: +(t / total * 100).toFixed(1), opaquePct: +(o / total * 100).toFixed(1), featherPct: +(f / total * 100).toFixed(1), bbox: `(${b.x0},${b.y0})${bw}x${bh}` });
  }

  return { width, height, stats, blobCount: sorted.length, mismatchNote };
}

async function main() {
  const files = (await fs.readdir(ORIGINAL_DIR)).filter((f) => f.endsWith(".png")).sort();
  console.log(`Processing ${files.length} grids as ${ROWS}×${COLS} with ML matting (model=${MODEL})...\n`);

  const rows: string[] = [];
  for (const file of files) {
    const name = path.basename(file, ".png");
    const src = path.join(ORIGINAL_DIR, file);
    try {
      const { width, height, stats, blobCount, mismatchNote } = await processOne(name, src);
      const avgTrans = (stats.reduce((a, s) => a + s.transparentPct, 0) / stats.length).toFixed(1);
      const avgFeather = (stats.reduce((a, s) => a + s.featherPct, 0) / stats.length).toFixed(1);
      console.log(`✓ ${name.padEnd(20)} ${width}×${height}  ${blobCount} blobs${mismatchNote}  bg=${avgTrans}% feather=${avgFeather}%`);
      rows.push(`| ${name} | ${width}×${height} | ${blobCount}${mismatchNote} | ${avgTrans}% | ${avgFeather}% |`);
    } catch (e) {
      console.log(`✗ ${name.padEnd(20)} FAILED: ${(e as Error).message}`);
      rows.push(`| ${name} | ERROR | - | - | - |`);
    }
  }

  const readme = `# Chibi ML 抠图 + 智能 blob 定位 检查目录 (v3)

> 由 \`packages/core/scripts/build-chibi-review.ts\` 生成。
> 流水线: 整张图 ML matting (ISNet) → alpha mask 连通域分析定位每个贴纸真实 bbox → 按 bbox 精确裁切。
> 对比 v2 (等分切分): v3 解决了"切歪/切到相邻图"——AI 网格行会偏移几十像素，等分必然切错，blob 定位按贴纸真实位置切。

## 目录结构

\`\`\`
chibi-review/
├── original/                # 归档的 15 张 chibi 网格原图
├── tiles-with-bg/<name>/    # 等分切片 (保留原背景) — 诊断用，看等分为什么会切歪
└── stickers-ml/<name>/      # 智能 blob 定位 + ML matting 的透明 sticker — 尺寸不一(按真实 bbox)
\`\`\`

## 怎么看

1. **等分的缺陷** → \`tiles-with-bg/clean-tauri/\`：看 s11/s12，等分切进了相邻贴纸（行偏移）。
2. **blob 定位的修复** → \`stickers-ml/clean-tauri/\`：每张按真实 bbox 裁，不再切到邻居。尺寸不一属正常。
3. **MISMATCH 标记** → 统计表里 blob 数 ≠ 16 的图，说明生成质量有问题（贴纸重叠/镂空），算法会拒绝。

## 统计 (ML matting + blob 定位)

| 图 | 尺寸 | blob数 | bg 透明占比 | feather 占比 |
|----|------|-------|------------|-------------|
${rows.join("\n")}
`;
  await fs.writeFile(path.join(REVIEW_DIR, "README.md"), readme);
  console.log(`\nREADME → chibi-review/README.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

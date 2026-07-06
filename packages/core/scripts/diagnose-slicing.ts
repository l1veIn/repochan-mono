// @ts-check
/**
 * Asset-slicing diagnostic — the "is naive equal-slicing good enough?" probe.
 *
 * This is NOT part of the core runtime. It is a research tool that answers an
 * empirical question the unit tests cannot: for real AI-generated chibi grid
 * images, does a rows×cols equal split produce clean per-sticker tiles, or does
 * it cut through stickers because the underlying grid is irregular (4-4-3-3,
 * tilted, bordered, with text labels, etc.)?
 *
 * It scans every `ord-chibi-001` version across the test-repos, decodes each
 * PNG with pngjs, slices it using core's `computeTileCells` coordinates, writes
 * the per-cell PNGs to scripts/out/<repo>/tile-rR-cC.png, and prints a summary
 * with a lightweight "suspicious cell" heuristic (cells that are mostly a flat
 * background are flagged as possible gutters/empty cells — a sign the grid does
 * not align to rows×cols). The final cleanliness verdict is made by a human
 * (eyeballing the exported tiles) plus analyze_image on the suspicious ones.
 *
 * Run from the repo root after building core:
 *   pnpm --filter @repochan/core build
 *   node --experimental-strip-types packages/core/scripts/diagnose-slicing.ts
 *   # or via tsx if available
 */
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { computeTileCells } from "../src/slicing/index.js";

// Resolve the script's own directory without import.meta (tsx/esbuild-safe).
// process.argv[1] is the script path under both node and tsx.
const __dirname = path.dirname(process.argv[1]);

// Default grid for chibi_4x4.yaml. Override per-image via the GRID_OVERRIDES
// map if you want to test 3x3 templates too.
const DEFAULT_ROWS = 4;
const DEFAULT_COLS = 4;

// Resolve the repo root. tsx/pnpm wrappers can make process.argv[1] and
// import.meta unreliable, so we locate the monorepo by walking up from cwd
// until we find pnpm-workspace.yaml (the repo root marker). Allow a --root
// override for non-standard invocations.
function resolveRepoRoot(): string {
  const rootFlagIdx = process.argv.indexOf("--root");
  if (rootFlagIdx !== -1 && process.argv[rootFlagIdx + 1]) return path.resolve(process.argv[rootFlagIdx + 1]);
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    // pnpm-workspace.yaml is the stable repo-root marker for this monorepo.
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not locate repo root (no pnpm-workspace.yaml found walking up from cwd). Pass --root.");
}

const REPO_ROOT = resolveRepoRoot();
const TEST_REPOS_DIR = path.join(REPO_ROOT, "test-repos");
// Output dir sits next to this script file. We compute it relative to repo
// root + the known package path so the location is stable regardless of cwd.
const OUT_DIR = path.join(REPO_ROOT, "packages", "core", "scripts", "out");

/** Find every chibi grid PNG under test-repos/<repo>/.repochan/orders/ord-chibi-001/. */
async function findChibiGrids(): Promise<Array<{ repo: string; pngPath: string; versionDir: string }>> {
  const out: Array<{ repo: string; pngPath: string; versionDir: string }> = [];
  let repos: string[] = [];
  try {
    repos = (await fs.readdir(TEST_REPOS_DIR)).filter((e) => !e.startsWith("."));
  } catch {
    // ignore
  }
  for (const repo of repos) {
    const orderDir = path.join(TEST_REPOS_DIR, repo, ".repochan", "orders", "ord-chibi-001", "versions");
    let versionDirs: string[] = [];
    try {
      versionDirs = (await fs.readdir(orderDir)).map((v) => path.join(orderDir, v));
    } catch {
      continue;
    }
    for (const versionDir of versionDirs) {
      let entries: string[] = [];
      try {
        entries = await fs.readdir(versionDir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.toLowerCase().endsWith(".png")) {
          out.push({ repo, pngPath: path.join(versionDir, entry), versionDir });
        }
      }
    }
  }
  return out;
}

/** Decode a PNG to raw RGBA pixels. */
async function decodePng(filePath: string): Promise<PNG> {
  const buf = await fs.readFile(filePath);
  return new Promise<PNG>((resolve, reject) => {
    new PNG().parse(buf, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

/** Extract a sub-rectangle from a decoded PNG and return a new PNG. */
function cropTile(src: PNG, x: number, y: number, w: number, h: number): PNG {
  const dst = new PNG({ width: w, height: h });
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const sx = x + dx;
      const sy = y + dy;
      const srcIdx = (src.width * sy + sx) << 2;
      const dstIdx = (w * dy + dx) << 2;
      dst.data[dstIdx] = src.data[srcIdx];
      dst.data[dstIdx + 1] = src.data[srcIdx + 1];
      dst.data[dstIdx + 2] = src.data[srcIdx + 2];
      dst.data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }
  return dst;
}

/**
 * Lightweight "is this cell suspiciously empty?" heuristic: sample the pixel
 * variance. A cell that's mostly a flat background (white/grey gutter, or an
 * empty sticker slot) has very low variance. Returns variance and the dominant
 * background color guess. This is a coarse signal, NOT a verdict — the human +
 * analyze_image step makes the real call.
 */
function cellVariance(src: PNG, x: number, y: number, w: number, h: number): { variance: number; meanR: number; meanG: number; meanB: number } {
  let sumR = 0,
    sumG = 0,
    sumB = 0,
    n = 0;
  // Sample every 4th pixel for speed; chibi tiles are 256px so this is plenty.
  for (let dy = 0; dy < h; dy += 4) {
    for (let dx = 0; dx < w; dx += 4) {
      const idx = (src.width * (y + dy) + (x + dx)) << 2;
      sumR += src.data[idx];
      sumG += src.data[idx + 1];
      sumB += src.data[idx + 2];
      n++;
    }
  }
  const meanR = sumR / n;
  const meanG = sumG / n;
  const meanB = sumB / n;
  let sumSqDiff = 0;
  for (let dy = 0; dy < h; dy += 4) {
    for (let dx = 0; dx < w; dx += 4) {
      const idx = (src.width * (y + dy) + (x + dx)) << 2;
      const dr = src.data[idx] - meanR;
      const dg = src.data[idx + 1] - meanG;
      const db = src.data[idx + 2] - meanB;
      sumSqDiff += dr * dr + dg * dg + db * db;
    }
  }
  return { variance: sumSqDiff / n, meanR, meanG, meanB };
}

async function main() {
  const grids = await findChibiGrids();
  if (grids.length === 0) {
    console.error(`No chibi grid images found under ${TEST_REPOS_DIR}.`);
    process.exit(1);
  }

  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log(`Found ${grids.length} chibi grid images. Slicing ${DEFAULT_ROWS}x${DEFAULT_COLS}...\n`);

  const report: Array<{ repo: string; cells: number; suspicious: number; tilesDir: string }> = [];

  for (const { repo, pngPath } of grids) {
    const png = await decodePng(pngPath);
    const tiles = computeTileCells(png.width, png.height, DEFAULT_ROWS, DEFAULT_COLS);
    const tilesDir = path.join(OUT_DIR, repo);
    await fs.mkdir(tilesDir, { recursive: true });

    let suspicious = 0;
    const cellReports: string[] = [];
    for (const cell of tiles.cells) {
      const tile = cropTile(png, cell.x, cell.y, cell.w, cell.h);
      const outPath = path.join(tilesDir, `tile-r${cell.row}-c${cell.col}.png`);
      await fs.writeFile(outPath, PNG.sync.write(tile));

      const { variance } = cellVariance(png, cell.x, cell.y, cell.w, cell.h);
      // Empirical threshold: a sticker cell has lots of content; a flat
      // background/gutter cell has near-zero variance. Tunable.
      if (variance < 50) {
        suspicious++;
        cellReports.push(`  ⚠  r${cell.row}c${cell.col} variance=${variance.toFixed(1)} (flat — empty/gutter?)`);
      }
    }

    report.push({ repo, cells: tiles.cells.length, suspicious, tilesDir });
    console.log(`✓ ${repo}: ${tiles.cells.length} tiles → ${path.relative(REPO_ROOT, tilesDir)}`);
    if (cellReports.length) {
      console.log(`  ${suspicious} suspicious cell(s):`);
      for (const line of cellReports) console.log(line);
    }
  }

  console.log("\n=== Summary ===");
  console.log("repo                  cells  suspicious");
  for (const r of report) {
    console.log(`${r.repo.padEnd(20)}  ${String(r.cells).padStart(5)}  ${String(r.suspicious).padStart(10)}`);
  }
  console.log(`\nTiles written to ${path.relative(REPO_ROOT, OUT_DIR)}/`);
  console.log("Next: eyeball the tiles, and run analyze_image on any ⚠ cells to decide");
  console.log("whether naive equal-slicing is good enough or grid-line detection is needed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import path from "node:path";
import { promises as fs } from "node:fs";
import {
  root,
  exists,
  readJson,
  writeJson,
  stamp,
  validateVersionId,
  validateOrderId,
  isPlainObject,
  orderVersionDir,
  orderJsonPath,
  readOrder,
  type JsonObject,
} from "@repochan/core";
import { sliceImage, extractStickersFromImage } from "@repochan/image-edit";
import { emitResult, type OutputOptions, UsageError } from "../lib/output.js";

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];

// ---------------------------------------------------------------------------
// Shared orchestration helpers (cli is the orchestration layer: it resolves
// the protocol-side concerns — which version, which image — then delegates
// the pure pixel math to @repochan/image-edit, then persists via core.)
// ---------------------------------------------------------------------------

async function resolveVersionId(projectRoot: string, orderId: string, explicit?: string): Promise<string> {
  if (explicit) return validateVersionId(explicit);
  const order = await readJson(orderJsonPath(projectRoot, orderId));
  if (typeof order.currentVersion === "string" && order.currentVersion) return validateVersionId(order.currentVersion);
  const versionsDir = orderVersionDir(projectRoot, orderId, "__noop__").replace(/__noop\/?$/, "");
  const entries = (await fs.readdir(versionsDir).catch(() => [] as string[])).filter((e) => e !== "meta.json");
  const latest = entries.sort().at(-1);
  if (!latest) throw new UsageError(`order ${orderId} has no result version. Pass --version or create a result first.`);
  return validateVersionId(latest);
}

async function findSingleGridImage(versionDir: string, orderId: string, versionId: string): Promise<string> {
  const entries = await fs.readdir(versionDir).catch(() => [] as string[]);
  const imageFiles = entries.filter((e) => IMAGE_EXT.includes(path.extname(e).toLowerCase()));
  if (imageFiles.length === 0) throw new UsageError(`order.slice: no image in ${orderId}/${versionId}. Requires a grid image.`);
  if (imageFiles.length > 1) throw new UsageError(`order: ${imageFiles.length} images in ${orderId}/${versionId}; needs exactly one. Found: ${imageFiles.join(", ")}.`);
  return path.join(versionDir, imageFiles[0]);
}

async function writeMetaAndMirror(
  projectRoot: string,
  orderId: string,
  versionId: string,
  key: string,
  value: unknown,
  extraMeta?: Record<string, unknown>,
): Promise<void> {
  const versionDir = orderVersionDir(projectRoot, orderId, versionId);
  const metaPath = path.join(versionDir, "meta.json");
  const meta = ((await exists(metaPath)) ? await readJson(metaPath) : {}) as JsonObject;
  meta[key] = value;
  if (extraMeta) Object.assign(meta, extraMeta);
  meta.updatedAt = stamp();
  await writeJson(metaPath, meta, true);

  const orderPath = orderJsonPath(projectRoot, orderId);
  const order = await readJson(orderPath);
  if (order.orderAsset && Array.isArray(order.orderAsset.versions)) {
    const idx = order.orderAsset.versions.findIndex((v: any) => v && v.versionId === versionId);
    if (idx >= 0) {
      const v = order.orderAsset.versions[idx];
      v.meta = isPlainObject(v.meta) ? v.meta : {};
      v.meta[key] = value;
      if (extraMeta) Object.assign(v.meta, extraMeta);
    }
  }
  order.updatedAt = stamp();
  await writeJson(orderPath, order, true);
}

// ---------------------------------------------------------------------------
// repochan order slice <id> --rows --cols [--version]
// ---------------------------------------------------------------------------
export async function runOrderSlice(
  cwd: string,
  orderId: string,
  options: OutputOptions & { rows?: number; cols?: number; version?: string },
) {
  const id = validateOrderId(orderId);
  const rows = options.rows;
  const cols = options.cols;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows! < 1 || cols! < 1) {
    throw new UsageError("Usage: repochan order slice <id> --rows <n> --cols <n> [--version <v>]");
  }
  const versionId = await resolveVersionId(cwd, id, options.version);
  const versionDir = orderVersionDir(cwd, id, versionId);
  if (!(await exists(versionDir))) throw new UsageError(`order ${id} has no result version ${versionId}.`);

  const imagePath = await findSingleGridImage(versionDir, id, versionId);
  if (path.extname(imagePath).toLowerCase() !== ".png") {
    throw new UsageError(`${path.basename(imagePath)} is not a PNG. Header-based slicing supports PNG only.`);
  }

  const { tiles, sourceFile } = await sliceImage(imagePath, rows!, cols!);
  await writeMetaAndMirror(cwd, id, versionId, "tiles", tiles);
  emitResult(options, `Sliced ${id}/${versionId} into ${tiles.rows}×${tiles.cols} (${tiles.cells.length} tiles).`, { tiles, sourceFile, versionId, orderId: id });
}

// ---------------------------------------------------------------------------
// repochan order extract-stickers <id> --rows --cols [--model] [--overwrite] [--version]
// ---------------------------------------------------------------------------
export async function runOrderExtractStickers(
  cwd: string,
  orderId: string,
  options: OutputOptions & { rows?: number; cols?: number; model?: string; overwrite?: boolean; version?: string },
) {
  const id = validateOrderId(orderId);
  const rows = options.rows;
  const cols = options.cols;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows! < 1 || cols! < 1) {
    throw new UsageError("Usage: repochan order extract-stickers <id> --rows <n> --cols <n> [--model small|medium|large] [--overwrite] [--version <v>]");
  }
  const model = options.model && ["small", "medium", "large"].includes(options.model) ? options.model as "small" | "medium" | "large" : "small";

  const versionId = await resolveVersionId(cwd, id, options.version);
  const versionDir = orderVersionDir(cwd, id, versionId);
  if (!(await exists(versionDir))) throw new UsageError(`order ${id} has no result version ${versionId}.`);

  const imagePath = await findSingleGridImage(versionDir, id, versionId);
  if (path.extname(imagePath).toLowerCase() !== ".png") {
    throw new UsageError(`${path.basename(imagePath)} is not a PNG. Sticker extraction supports PNG only.`);
  }

  const stickersOutDir = path.join(versionDir, "stickers");
  const result = await extractStickersFromImage(imagePath, { rows: rows!, cols: cols!, model, overwrite: options.overwrite === true }, stickersOutDir);
  const stickers = result.stickers.map((s) => ({ ...s, file: `stickers/${s.file}` }));
  const stickersConfig = { model, engine: "imgly-isnet", method: "blob-detection", expected: result.config.expected, detected: result.config.detected, sourceFile: result.sourceFile };

  await writeMetaAndMirror(cwd, id, versionId, "stickers", stickers, { stickersConfig });
  emitResult(options, `Extracted ${stickers.length} stickers from ${id}/${versionId}.`, { stickers, sourceFile: result.sourceFile, versionId, orderId: id });
}

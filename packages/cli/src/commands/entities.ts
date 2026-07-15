import path from "node:path";
import {
  root,
  exists,
  readJson,
  writeJson,
  safeProtocolPath,
  findFoundationSheet,
  createReview,
} from "@repochan/core";
import { emitResult, type OutputOptions, UsageError } from "../lib/output.js";
import { readDataFile } from "../lib/data-file.js";

// ---------------------------------------------------------------------------
// foundation find — locate the foundation sheet (visual anchor) order
// ---------------------------------------------------------------------------
export async function runFoundationFind(cwd: string, options: OutputOptions) {
  const result = await findFoundationSheet(cwd);
  emitResult(options, result ? `Foundation sheet found: ${result.orderId}` : "No foundation sheet found.", result);
}

// ---------------------------------------------------------------------------
// review create --data-file
// review create --data-file
// ---------------------------------------------------------------------------
export async function runReviewCreate(cwd: string, dataFile: string | undefined, options: OutputOptions) {
  const params = readDataFile(dataFile);
  const result = await createReview(cwd, params);
  emitResult(options, "Created review.", result);
}

// ---------------------------------------------------------------------------
// protocol inspect / read / write
// ---------------------------------------------------------------------------
export async function runProtocolInspect(cwd: string, options: OutputOptions) {
  const { inspectProtocol } = await import("@repochan/core");
  const summary = await inspectProtocol(cwd);
  emitResult(options, JSON.stringify(summary, null, 2), summary);
}

export async function runProtocolRead(cwd: string, artifactPath: string | undefined, options: OutputOptions) {
  if (!artifactPath) throw new UsageError("Usage: repochan protocol read <artifact-path>");
  const file = safeProtocolPath(cwd, artifactPath);
  const data = await readJson(file);
  emitResult(options, JSON.stringify(data, null, 2), data);
}

export async function runProtocolWrite(cwd: string, artifactPath: string | undefined, dataFile: string | undefined, options: OutputOptions & { overwrite?: boolean }) {
  if (!artifactPath) throw new UsageError("Usage: repochan protocol write <artifact-path> --data-file -");
  const file = safeProtocolPath(cwd, artifactPath);
  const protocolRelative = path.relative(root(cwd), file).split(path.sep).join("/");
  if (/^orders\/[^/]+\//.test(protocolRelative)) {
    throw new UsageError(
      `protocol write cannot modify Core-managed order state: ${protocolRelative}.`,
      "Use the corresponding `repochan order ...` command so evidence, locking, history, and mirrored metadata stay consistent.",
    );
  }
  const data = readDataFile(dataFile);
  await writeJson(file, data, options.overwrite === true);
  emitResult(options, `Wrote ${artifactPath}`, { artifactPath, path: path.relative(cwd, file) });
}

import {
  readJson,
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
// protocol inspect / read
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

export const PROTOCOL_SUBCOMMANDS = ["inspect", "read"] as const;

export async function runProtocolCommand(
  cwd: string,
  subcommand: string | undefined,
  artifactPath: string | undefined,
  options: OutputOptions,
) {
  if (subcommand === "inspect") return runProtocolInspect(cwd, options);
  if (subcommand === "read") return runProtocolRead(cwd, artifactPath, options);
  throw new UsageError(`Unknown protocol subcommand: ${String(subcommand)}. Use: ${PROTOCOL_SUBCOMMANDS.join(" | ")}`);
}

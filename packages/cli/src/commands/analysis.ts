import path from "node:path";
import {
  root,
  exists,
  readAnalysisArtifact,
  writeAnalysisArtifact,
  updateAnalysisArtifact,
  enrichAnalysisArtifact,
} from "@repochan/core";
import { emitResult, type OutputOptions, UsageError } from "../lib/output.js";
import { readDataFile } from "../lib/data-file.js";

// ---------------------------------------------------------------------------
// repochan analysis run — deterministic repository scan (no LLM)
// ---------------------------------------------------------------------------
export async function runAnalysisRun(cwd: string, options: OutputOptions & { overwrite?: boolean }) {
  const { data, path: outPath } = await writeAnalysisArtifact(cwd, {
    overwrite: options.overwrite === true,
  });
  emitResult(options, `Analyzed repository → ${outPath}`, { path: outPath, schemaVersion: data.schemaVersion });
}

// ---------------------------------------------------------------------------
// repochan analysis get — read analysis/current.json
// ---------------------------------------------------------------------------
export async function runAnalysisGet(cwd: string, options: OutputOptions) {
  const file = path.join(root(cwd), "analysis", "current.json");
  if (!(await exists(file))) throw new UsageError("No analysis found. Run `repochan analysis run` first.");
  const data = await readAnalysisArtifact(cwd);
  emitResult(options, JSON.stringify(data, null, 2), data);
}

// ---------------------------------------------------------------------------
// repochan analysis update — merge a patch object into current.json
// ---------------------------------------------------------------------------
export async function runAnalysisUpdate(cwd: string, dataFile: string | undefined, options: OutputOptions & { overwrite?: boolean }) {
  const params = readDataFile(dataFile);
  if (!params.patch || typeof params.patch !== "object") {
    throw new UsageError("analysis update --data-file must contain a `patch` object.");
  }
  const { data } = await updateAnalysisArtifact(cwd, {
    ...params,
    overwrite: options.overwrite === true,
  } as Parameters<typeof updateAnalysisArtifact>[1]);
  emitResult(options, "Updated .repochan/analysis/current.json", data);
}

// ---------------------------------------------------------------------------
// repochan analysis enrich — merge LLM-generated preAnalysis/abstract
// (the "thinking" content comes from the agent; CLI just persists it)
// ---------------------------------------------------------------------------
export async function runAnalysisEnrich(cwd: string, dataFile: string | undefined, options: OutputOptions) {
  const params = readDataFile(dataFile);
  const { data } = await enrichAnalysisArtifact(cwd, params);
  emitResult(options, "Enriched analysis/current.json with preAnalysis/abstract.", { analysis: data });
}

// ---------------------------------------------------------------------------
// repochan analysis versions — list archived analysis versions
// ---------------------------------------------------------------------------
export async function runAnalysisVersions(cwd: string, options: OutputOptions) {
  const dir = path.join(root(cwd), "analysis", "versions");
  if (!(await exists(dir))) return void emitResult(options, "No analysis versions.", { versions: [] });
  const { readdir } = await import("node:fs/promises");
  const entries = (await readdir(dir).catch(() => [] as string[])).filter((e) => e.endsWith(".json")).sort();
  emitResult(options, `Analysis versions (${entries.length}):\n${entries.map((e) => `  - ${e}`).join("\n")}`, { versions: entries });
}

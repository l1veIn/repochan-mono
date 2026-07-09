import path from "node:path";
import {
  root,
  exists,
  readJson,
  writeJson,
  writeAnalysisArtifact,
  updateAnalysisArtifact,
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
  const data = await readJson(file);
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
    patch: params.patch as Record<string, unknown>,
    overwrite: options.overwrite === true,
    versionPrevious: params.versionPrevious !== false,
    reason: typeof params.reason === "string" ? params.reason : undefined,
  });
  emitResult(options, "Updated .repochan/analysis/current.json", data);
}

// ---------------------------------------------------------------------------
// repochan analysis enrich — merge LLM-generated preAnalysis/abstract
// (the "thinking" content comes from the agent; CLI just persists it)
// ---------------------------------------------------------------------------
export async function runAnalysisEnrich(cwd: string, dataFile: string | undefined, options: OutputOptions) {
  const params = readDataFile(dataFile);
  const analysisPath = path.join(root(cwd), "analysis", "current.json");
  if (!(await exists(analysisPath))) throw new UsageError("No analysis found. Run `repochan analysis run` first.");
  const existing = await readJson(analysisPath);

  // Version the pre-enrichment state (mirror the old pi-layer logic).
  const versionDir = path.join(root(cwd), "analysis", "versions");
  const versionStamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeJson(path.join(versionDir, `${versionStamp}-pre-enrich.json`), existing, false);

  const enriched = { ...existing } as Record<string, unknown>;
  if (params.preAnalysis && typeof params.preAnalysis === "object") enriched.preAnalysis = params.preAnalysis;
  if (params.abstract && typeof params.abstract === "object") enriched.abstract = params.abstract;
  enriched.enrichedAt = new Date().toISOString();
  await writeJson(analysisPath, enriched, true);

  emitResult(options, "Enriched analysis/current.json with preAnalysis/abstract.", { analysis: enriched });
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

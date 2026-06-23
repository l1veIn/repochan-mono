import path from "node:path";
import { exists, initProtocol, readJson, relativeProtocolPath, root, stamp, stampForPath, writeJson } from "../protocol/index.js";
import { deepMerge, isPlainObject } from "../utils/index.js";
import { validateInput } from "../validate.js";
import { AnalysisRunParamsSchema, AnalysisUpdateParamsSchema } from "../schemas/index.js";
import type { AnalyzeInput } from "./schema.js";
import type { AnalysisResult } from "./types.js";
import { performAnalysis } from "./assemble.js";

export type WriteAnalysisInput = AnalyzeInput & {
  analysis?: Record<string, unknown>;
};

export async function writeAnalysisArtifact(
  projectRoot: string,
  params: WriteAnalysisInput,
): Promise<{ path: string; data: AnalysisResult }> {
  validateInput("analysis.run", AnalysisRunParamsSchema, params);
  await initProtocol(projectRoot);
  const target = path.join(root(projectRoot), "analysis", "current.json");
  const targetExists = await exists(target);
  if (targetExists && !params.overwrite) {
    throw new Error(
      ".repochan/analysis/current.json already exists. Ask whether to reuse it or rerun with params.overwrite=true (params.versionPrevious defaults to true).",
    );
  }
  if (targetExists && params.versionPrevious !== false) {
    const prior = await readJson(target);
    await writeJson(path.join(root(projectRoot), "analysis", "versions", `${stampForPath()}.json`), prior, false);
  }
  const generated = await performAnalysis(projectRoot, params);
  const data = {
    ...generated,
    ...(isPlainObject(params.analysis) ? params.analysis : {}),
    schemaVersion: "repochan.analysis.v1" as const,
    generatedAt: stamp(),
  } as AnalysisResult;
  await writeJson(target, data, Boolean(params.overwrite));
  return { path: relativeProtocolPath(projectRoot, target), data };
}

export type UpdateAnalysisInput = {
  patch: Record<string, unknown>;
  overwrite?: boolean;
  versionPrevious?: boolean;
  reason?: string;
};

export async function updateAnalysisArtifact(
  projectRoot: string,
  params: UpdateAnalysisInput,
): Promise<{ path: string; data: AnalysisResult }> {
  validateInput("analysis.update", AnalysisUpdateParamsSchema, params);
  await initProtocol(projectRoot);
  if (params.overwrite !== true) {
    throw new Error("analysis.update requires params.overwrite=true after explicit user approval.");
  }
  if (!isPlainObject(params.patch)) {
    throw new Error("analysis.update requires params.patch (an object).");
  }

  const target = path.join(root(projectRoot), "analysis", "current.json");
  if (!(await exists(target))) {
    throw new Error("Missing .repochan/analysis/current.json. Run analysis.run first.");
  }

  const current = await readJson(target);
  if (params.versionPrevious !== false) {
    await writeJson(path.join(root(projectRoot), "analysis", "versions", `${stampForPath()}-previous.json`), current, false);
  }

  const data = {
    ...deepMerge(current, params.patch),
    schemaVersion: "repochan.analysis.v1" as const,
    updatedAt: stamp(),
    ...(typeof params.reason === "string" && params.reason.trim() ? { revisionReason: params.reason.trim() } : {}),
  } as AnalysisResult;

  await writeJson(target, data, true);
  return { path: relativeProtocolPath(projectRoot, target), data };
}

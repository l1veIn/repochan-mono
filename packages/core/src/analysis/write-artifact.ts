import path from "node:path";
import { exists, initProtocol, readJson, relativeProtocolPath, root, stamp, stampForPath, writeJson } from "../protocol/index.js";
import { isPlainObject } from "../utils/index.js";
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
  await initProtocol(projectRoot);
  const target = path.join(root(projectRoot), "analysis.json");
  const targetExists = await exists(target);
  if (targetExists && !params.overwrite) {
    throw new Error(
      ".repochan/analysis.json already exists. Ask whether to reuse it or rerun with params.overwrite=true (params.versionPrevious defaults to true).",
    );
  }
  if (targetExists && params.versionPrevious !== false) {
    const prior = await readJson(target);
    await writeJson(path.join(root(projectRoot), "analysis.versions", `${stampForPath()}.json`), prior, false);
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

import path from "node:path";
import type { InterviewQuestion, InterviewReport, InterviewResponse, JsonObject } from "../types.js";
import { exists, initProtocol, protocolRoot, readJson, requireAnalysis, stamp, stampForPath, writeJson } from "../protocol/index.js";
import { validateInput } from "../validate.js";
import { InterviewAppendParamsSchema, InterviewCreateParamsSchema } from "../schemas/index.js";
import { isPlainObject } from "../utils/index.js";

export async function createOrUpdateInterview(projectRoot: string, params: JsonObject) {
  validateInput("interview.create", InterviewCreateParamsSchema, params);
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);
  if (!isPlainObject(params.interview)) throw new Error("params.interview is required and must be an object.");
  const current = path.join(protocolRoot(projectRoot), "interview", "current.json");
  const currentExists = await exists(current);
  const overwrite = params.overwrite === true;
  const versionPrevious = params.versionPrevious !== false;
  if (currentExists && !overwrite) {
    throw new Error(".repochan/interview/current.json already exists. Use interview.get, or ask the user before interview.create with overwrite=true.");
  }
  const ts = stampForPath();
  if (currentExists && overwrite && versionPrevious) {
    await writeJson(path.join(protocolRoot(projectRoot), "interview", "versions", `${ts}-previous.json`), await readJson(current), false);
  }
  const provenance = params.interview.provenance ?? params.provenance ?? { tool: "repochan", action: "interview.create" };
  const data: InterviewReport = {
    ...(params.interview as InterviewReport),
    schemaVersion: "repochan.interview.v1",
    generatedAt: stamp(),
    provenance,
  };
  const slug = typeof params.slug === "string" ? params.slug : "interview";
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("slug must match ^[a-z0-9-]+$.");
  const versionName = `${ts}-${slug}.json`;
  await writeJson(path.join(protocolRoot(projectRoot), "interview", "versions", versionName), data, false);
  await writeJson(current, data, currentExists || overwrite);
  return { versionName, data };
}

export async function appendToInterview(projectRoot: string, params: JsonObject) {
  validateInput("interview.append", InterviewAppendParamsSchema, params);
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);
  const current = path.join(protocolRoot(projectRoot), "interview", "current.json");
  if (!(await exists(current))) throw new Error("Missing .repochan/interview/current.json. Use interview.create first.");

  const existing = (await readJson(current)) as InterviewReport;
  const ts = stampForPath();

  // Archive the pre-append state
  const slug = typeof params.slug === "string" ? params.slug : "appended";
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("slug must match ^[a-z0-9-]+$.");
  const archiveName = `${ts}-${slug}-previous.json`;
  await writeJson(path.join(protocolRoot(projectRoot), "interview", "versions", archiveName), existing, false);

  // Merge: append questions/responses, replace summary fields
  const merged: InterviewReport = {
    ...existing,
    questions: [
      ...(existing.questions ?? []),
      ...((Array.isArray(params.questions) ? params.questions : []) as InterviewQuestion[]),
    ],
    responses: [
      ...(existing.responses ?? []),
      ...((Array.isArray(params.responses) ? params.responses : []) as InterviewResponse[]),
    ],
    summary: typeof params.summary === "string" ? params.summary : existing.summary,
    keyConstraints: Array.isArray(params.keyConstraints)
      ? (params.keyConstraints as string[])
      : existing.keyConstraints ?? [],
    preferences: Array.isArray(params.preferences)
      ? (params.preferences as string[])
      : existing.preferences ?? [],
    avoidList: Array.isArray(params.avoidList)
      ? (params.avoidList as string[])
      : existing.avoidList ?? [],
    generatedAt: stamp(),
    provenance: params.provenance ?? { tool: "repochan", action: "interview.append" },
  };

  const versionName = `${ts}-${slug}.json`;
  await writeJson(path.join(protocolRoot(projectRoot), "interview", "versions", versionName), merged, false);
  await writeJson(current, merged, true);
  return { versionName, data: merged };
}

import path from "node:path";
import { promises as fs } from "node:fs";
import type { JsonObject } from "../types.js";
import { exists, initProtocol, personaCandidatePath, personaCandidatesDir, protocolRoot, readJson, readPersonaArtifact, requireAnalysis, stamp, stampForPath, withProtocolRollback, writeJson } from "../protocol/index.js";
import { validateInput } from "../validate.js";
import { PersonaArtifactSchema, PersonaCandidateCreateParamsSchema, PersonaCandidatePromoteParamsSchema, PersonaCreateParamsSchema, PersonaUpdateParamsSchema } from "../schemas/index.js";
import { isPlainObject } from "../utils/index.js";

export async function createOrUpdatePersona(projectRoot: string, params: JsonObject, mode: "create" | "update") {
  const schemaName = mode === "create" ? "persona.create" : "persona.update";
  validateInput(schemaName, mode === "create" ? PersonaCreateParamsSchema : PersonaUpdateParamsSchema, params);
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);
  if (!isPlainObject(params.persona)) throw new Error("params.persona is required and must be an object.");
  const current = path.join(protocolRoot(projectRoot), "persona", "current.json");
  const overwrite = params.overwrite === true;
  const versionPrevious = params.versionPrevious !== false;
  const ts = stampForPath();
  const provenance = params.persona.provenance ?? params.provenance ?? { tool: "repochan", action: `persona.${mode}` };
  const data = { ...params.persona, schemaVersion: "repochan.persona.v2", generatedAt: stamp(), provenance };
  validateInput("persona.artifact", PersonaArtifactSchema, data);
  const slug = typeof params.slug === "string" ? params.slug : "persona";
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("slug must match ^[a-z0-9-]+$.");
  const versionName = `${ts}-${slug}.json`;
  await withProtocolRollback([current, path.join(protocolRoot(projectRoot), "persona", "versions")], async () => {
    const currentExists = await exists(current);
    if (mode === "create" && currentExists && !overwrite) {
      throw new Error(".repochan/persona/current.json already exists. Use persona.get, or ask the user before persona.create with overwrite=true.");
    }
    if (mode === "update") {
      if (!currentExists) throw new Error("Missing .repochan/persona/current.json. Use persona.create first.");
      if (!overwrite) throw new Error("persona.update replaces current persona and requires params.overwrite=true after explicit user approval.");
    }
    if (currentExists && overwrite && versionPrevious) {
      await writeJson(path.join(protocolRoot(projectRoot), "persona", "versions", `${ts}-previous.json`), await readPersonaArtifact(projectRoot), false);
    }
    await writeJson(path.join(protocolRoot(projectRoot), "persona", "versions", versionName), data, false);
    await writeJson(current, data, currentExists || overwrite);
  });
  return { versionName, data };
}

/**
 * Create a persona candidate draft — a parallel persona that is NOT promoted
 * to current. Stored at persona/candidates/<slug>.json. Multiple candidates
 * can coexist; the user/AD later calls promotePersonaCandidate to select one.
 *
 * Unlike orders, persona has no role field — candidate-ness is positional
 * (living in candidates/ makes it a candidate).
 */
export async function createPersonaCandidate(projectRoot: string, params: JsonObject) {
  validateInput("persona.create_candidate", PersonaCandidateCreateParamsSchema, params);
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);
  if (!isPlainObject(params.persona)) throw new Error("params.persona is required and must be an object.");
  const slug = String(params.slug ?? "");
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("params.slug is required and must match ^[a-z0-9-]+$.");

  const candidateFile = personaCandidatePath(projectRoot, slug);
  const overwrite = params.overwrite === true;

  const provenance = params.persona.provenance ?? params.provenance ?? { tool: "repochan", action: "persona.create_candidate" };
  const data = { ...params.persona, schemaVersion: "repochan.persona.v2", generatedAt: stamp(), provenance };
  validateInput("persona.artifact", PersonaArtifactSchema, data);
  await withProtocolRollback([candidateFile], async () => {
    if ((await exists(candidateFile)) && !overwrite) {
      throw new Error(`Persona candidate '${slug}' already exists. Use overwrite=true to replace it.`);
    }
    await writeJson(candidateFile, data, overwrite);
  });
  return { slug, data };
}

/**
 * Promote a persona candidate to current. The candidate is copied to
 * persona/current.json (overwriting), the old current is archived to
 * versions/, and the candidate file is deleted (it has become current).
 * Other candidates are left untouched.
 */
export async function promotePersonaCandidate(projectRoot: string, slug: string) {
  validateInput("persona.promote_candidate", PersonaCandidatePromoteParamsSchema, { slug });
  await initProtocol(projectRoot);

  const candidateFile = personaCandidatePath(projectRoot, slug);
  const current = path.join(protocolRoot(projectRoot), "persona", "current.json");
  const ts = stampForPath();
  let previousArchived = false;
  let candidateData: unknown;
  await withProtocolRollback([candidateFile, current, path.join(protocolRoot(projectRoot), "persona", "versions")], async () => {
    if (!(await exists(candidateFile))) {
      throw new Error(`Persona candidate '${slug}' does not exist.`);
    }
    candidateData = await readJson(candidateFile);
    validateInput("persona.artifact", PersonaArtifactSchema, candidateData);
    const currentExists = await exists(current);
    if (currentExists) {
      await writeJson(path.join(protocolRoot(projectRoot), "persona", "versions", `${ts}-previous.json`), await readPersonaArtifact(projectRoot), false);
      previousArchived = true;
    }
    await writeJson(current, candidateData, true);
    await fs.unlink(candidateFile);
  });

  return { data: candidateData, previousArchived };
}

/** List all persona candidates by slug. */
export async function listPersonaCandidates(projectRoot: string): Promise<string[]> {
  const dir = personaCandidatesDir(projectRoot);
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

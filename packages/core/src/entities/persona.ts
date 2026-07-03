import path from "node:path";
import type { JsonObject } from "../types.js";
import { exists, initProtocol, protocolRoot, readJson, requireAnalysis, stamp, stampForPath, writeJson } from "../protocol/index.js";
import { validateInput } from "../validate.js";
import { PersonaCreateParamsSchema, PersonaUpdateParamsSchema } from "../schemas/index.js";
import { isPlainObject } from "../utils/index.js";

export async function createOrUpdatePersona(projectRoot: string, params: JsonObject, mode: "create" | "update") {
  const schemaName = mode === "create" ? "persona.create" : "persona.update";
  validateInput(schemaName, mode === "create" ? PersonaCreateParamsSchema : PersonaUpdateParamsSchema, params);
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);
  if (!isPlainObject(params.persona)) throw new Error("params.persona is required and must be an object.");
  const current = path.join(protocolRoot(projectRoot), "persona", "current.json");
  const currentExists = await exists(current);
  const overwrite = params.overwrite === true;
  const versionPrevious = params.versionPrevious !== false;
  if (mode === "create" && currentExists && !overwrite) {
    throw new Error(".repochan/persona/current.json already exists. Use persona.get, or ask the user before persona.create with overwrite=true.");
  }
  if (mode === "update") {
    if (!currentExists) throw new Error("Missing .repochan/persona/current.json. Use persona.create first.");
    if (!overwrite) throw new Error("persona.update replaces current persona and requires params.overwrite=true after explicit user approval.");
  }
  const ts = stampForPath();
  if (currentExists && overwrite && versionPrevious) {
    await writeJson(path.join(protocolRoot(projectRoot), "persona", "versions", `${ts}-previous.json`), await readJson(current), false);
  }
  const provenance = params.persona.provenance ?? params.provenance ?? { tool: "repochan", action: `persona.${mode}` };
  const data = { ...params.persona, schemaVersion: "repochan.persona.v1", generatedAt: stamp(), provenance };
  const slug = typeof params.slug === "string" ? params.slug : "persona";
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("slug must match ^[a-z0-9-]+$.");
  const versionName = `${ts}-${slug}.json`;
  await writeJson(path.join(protocolRoot(projectRoot), "persona", "versions", versionName), data, false);
  await writeJson(current, data, currentExists || overwrite);
  return { versionName, data };
}

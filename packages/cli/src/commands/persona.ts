import path from "node:path";
import {
  root,
  exists,
  readJson,
  createOrUpdatePersona,
  createPersonaCandidate,
  promotePersonaCandidate,
  createPersonaReview,
} from "@repochan/core";
import { emitResult, type OutputOptions, UsageError } from "../lib/output.js";
import { readDataFile } from "../lib/data-file.js";

// repochan persona get
export async function runPersonaGet(cwd: string, options: OutputOptions) {
  const file = path.join(root(cwd), "persona", "current.json");
  if (!(await exists(file))) throw new UsageError("No persona found. Ask your agent to generate one, then pipe JSON into `repochan persona create`.");
  const data = await readJson(file);
  emitResult(options, JSON.stringify(data, null, 2), data);
}

// repochan persona create --data-file
export async function runPersonaCreate(cwd: string, dataFile: string | undefined, options: OutputOptions & { overwrite?: boolean }) {
  const params = readDataFile(dataFile);
  if (options.overwrite) params.overwrite = true;
  const { data, versionName } = await createOrUpdatePersona(cwd, params, "create");
  emitResult(options, `Wrote persona current and persona/versions/${versionName}`, data);
}

// repochan persona update --data-file
export async function runPersonaUpdate(cwd: string, dataFile: string | undefined, options: OutputOptions) {
  const params = readDataFile(dataFile);
  params.overwrite = true; // update always overwrites current after explicit approval
  const { data, versionName } = await createOrUpdatePersona(cwd, params, "update");
  emitResult(options, `Updated persona current and wrote persona/versions/${versionName}`, data);
}

// repochan persona review --data-file
export async function runPersonaReview(cwd: string, dataFile: string | undefined, options: OutputOptions) {
  const params = readDataFile(dataFile);
  const result = await createPersonaReview(cwd, params);
  emitResult(options, "Wrote persona review.", result);
}

// repochan persona candidate create --data-file
export async function runPersonaCandidateCreate(cwd: string, dataFile: string | undefined, options: OutputOptions) {
  const params = readDataFile(dataFile);
  const result = await createPersonaCandidate(cwd, params);
  emitResult(options, "Wrote persona candidate draft.", result);
}

// repochan persona candidate promote --slug <slug>
export async function runPersonaCandidatePromote(cwd: string, slug: string | undefined, options: OutputOptions) {
  if (!slug) throw new UsageError("Usage: repochan persona candidate promote --slug <slug>");
  const result = await promotePersonaCandidate(cwd, slug);
  emitResult(options, `Promoted persona candidate '${slug}' to current.`, result);
}

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { TSchema } from "typebox";
import {
  AnalysisArtifactSchema,
  InterviewArtifactSchema,
  PersonaArtifactSchema,
  PersonaReviewArtifactSchema,
  ReviewArtifactSchema,
  type StoredAnalysisArtifact,
  type StoredInterviewArtifact,
  type StoredPersonaArtifact,
  type StoredPersonaReviewArtifact,
  type StoredReviewArtifact,
} from "../schemas/index.js";
import { validateInput } from "../validate.js";
export { withProtocolRollback, recoverProtocolTransactions } from "./transaction.js";
import { recoverProtocolTransactions } from "./transaction.js";
export { assertNoProtocolSymlinkPath } from "./path-safety.js";
import { assertNoProtocolSymlinkPath } from "./path-safety.js";

export const PROTOCOL_DIR = ".repochan";

export function stamp() {
  return new Date().toISOString();
}

export function stampForPath() {
  return stamp().replace(/[:.]/g, "-");
}

export function protocolRoot(projectRoot: string) {
  return path.join(projectRoot, PROTOCOL_DIR);
}

export const root = protocolRoot;

export function stripProtocolPrefix(inputPath: string) {
  return inputPath.startsWith(PROTOCOL_DIR)
    ? inputPath.slice(PROTOCOL_DIR.length).replace(/^[/\\]+/, "")
    : inputPath.replace(/^[/\\]+/, "");
}

export function safeProtocolPath(projectRoot: string, inputPath: string) {
  const rel = stripProtocolPrefix(inputPath);
  const resolved = path.resolve(protocolRoot(projectRoot), rel);
  const protocolRootPath = path.resolve(protocolRoot(projectRoot));
  if (resolved !== protocolRootPath && !resolved.startsWith(protocolRootPath + path.sep)) {
    throw new Error(`Refusing to access path outside ${PROTOCOL_DIR}: ${inputPath}`);
  }
  return resolved;
}

export async function exists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(file: string) {
  if (path.resolve(file).split(path.sep).includes(PROTOCOL_DIR)) await assertNoProtocolSymlinkPath(file);
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export async function readJsonIfExists(file: string) {
  if (path.resolve(file).split(path.sep).includes(PROTOCOL_DIR)) await assertNoProtocolSymlinkPath(file);
  return (await exists(file)) ? readJson(file) : undefined;
}

export async function writeJson(file: string, data: unknown, overwrite = false) {
  const isProtocolFile = path.resolve(file).split(path.sep).includes(PROTOCOL_DIR);
  if (isProtocolFile) await assertNoProtocolSymlinkPath(file);
  const serialized = JSON.stringify(data, null, 2);
  if (serialized === undefined) throw new Error(`Cannot serialize JSON artifact: ${file}`);
  const directory = path.dirname(file);
  await fs.mkdir(directory, { recursive: true });
  if (isProtocolFile) await assertNoProtocolSymlinkPath(directory);
  const temp = path.join(directory, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(temp, "wx", 0o666);
    await handle.writeFile(`${serialized}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;

    if (overwrite) {
      await fs.rename(temp, file);
    } else {
      try {
        await fs.link(temp, file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new Error(`Refusing to overwrite existing artifact without overwrite=true: ${file}`);
        }
        throw error;
      }
      await fs.unlink(temp);
    }

    // Persist the directory entry where the platform supports directory fsync.
    try {
      const dirHandle = await fs.open(directory, "r");
      try { await dirHandle.sync(); } finally { await dirHandle.close(); }
    } catch {
      // Some platforms do not permit opening directories. The file itself was
      // still fsynced and atomically published above.
    }
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await fs.unlink(temp).catch(() => undefined);
  }
}

async function readStoredJson<T>(file: string, schemaName: string, schema: TSchema): Promise<T> {
  const data = await readJson(file);
  validateInput(schemaName, schema, data);
  return data as T;
}

export function readAnalysisArtifact(projectRoot: string): Promise<StoredAnalysisArtifact> {
  return readStoredJson(path.join(protocolRoot(projectRoot), "analysis", "current.json"), "analysis.artifact", AnalysisArtifactSchema);
}

export function readPersonaArtifact(projectRoot: string): Promise<StoredPersonaArtifact> {
  return readStoredJson(path.join(protocolRoot(projectRoot), "persona", "current.json"), "persona.artifact", PersonaArtifactSchema);
}

export function readInterviewArtifact(projectRoot: string): Promise<StoredInterviewArtifact> {
  return readStoredJson(path.join(protocolRoot(projectRoot), "interview", "current.json"), "interview.artifact", InterviewArtifactSchema);
}

export function readReviewArtifact(file: string): Promise<StoredReviewArtifact> {
  return readStoredJson(file, "review.artifact", ReviewArtifactSchema);
}

export function readPersonaReviewArtifact(projectRoot: string): Promise<StoredPersonaReviewArtifact> {
  return readStoredJson(personaReviewPath(projectRoot), "persona_review.artifact", PersonaReviewArtifactSchema);
}

export async function initProtocol(projectRoot: string) {
  const r = protocolRoot(projectRoot);
  await assertNoProtocolSymlinkPath(r);
  await fs.mkdir(r, { recursive: true });
  await assertNoProtocolSymlinkPath(r);
  await recoverProtocolTransactions(r);
  const dirs = [
    path.join(r, "analysis", "versions"),
    path.join(r, "interview", "versions"),
    path.join(r, "persona", "versions"),
    path.join(r, "orders"),
  ];
  for (const dir of dirs) {
    await assertNoProtocolSymlinkPath(dir);
    await fs.mkdir(dir, { recursive: true });
    await assertNoProtocolSymlinkPath(dir);
  }
}

export async function inspectProtocol(projectRoot: string) {
  const r = protocolRoot(projectRoot);
  await assertNoProtocolSymlinkPath(r);
  const summary: Record<string, unknown> = { exists: await exists(r), root: PROTOCOL_DIR };
  summary.analysis = await exists(path.join(r, "analysis", "current.json"));
  summary.interview = await exists(path.join(r, "interview", "current.json"));
  summary.persona = await exists(path.join(r, "persona", "current.json"));
  try {
    summary.analysisVersions = (await fs.readdir(path.join(r, "analysis", "versions"))).filter((f) => f.endsWith(".json"));
  } catch {
    summary.analysisVersions = [];
  }
  try {
    summary.interviewVersions = (await fs.readdir(path.join(r, "interview", "versions"))).filter((f) => f.endsWith(".json"));
  } catch {
    summary.interviewVersions = [];
  }
  try {
    summary.personaVersions = (await fs.readdir(path.join(r, "persona", "versions"))).filter((f) => f.endsWith(".json"));
  } catch {
    summary.personaVersions = [];
  }
  try {
    const orderEntries = await fs.readdir(path.join(r, "orders"), { withFileTypes: true });
    summary.orders = orderEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    summary.orderVersions = Object.fromEntries(
      await Promise.all(
        (summary.orders as string[]).map(async (orderId) => {
          try {
            const versions = (await fs.readdir(path.join(r, "orders", orderId, "versions"), { withFileTypes: true }))
              .filter((entry) => entry.isDirectory())
              .map((entry) => entry.name)
              .sort();
            return [orderId, versions];
          } catch {
            return [orderId, []];
          }
        }),
      ),
    );
  } catch {
    summary.orders = [];
    summary.orderVersions = {};
  }
  summary.assets = [];
  return summary;
}

export function protocolVersionPath(strippedArtifactPath: string, stampValue = stampForPath()) {
  const clean = stripProtocolPrefix(strippedArtifactPath).split(/[\\/]+/).join("/");
  if (clean === "analysis/current.json") return path.join("analysis", "versions", `${stampValue}.json`);
  if (clean === "persona/current.json") return path.join("persona", "versions", `${stampValue}.json`);
  return path.join(path.dirname(clean), "versions", `${stampValue}.json`);
}

export function relativeProtocolPath(projectRoot: string, file: string) {
  return path.relative(projectRoot, file).split(path.sep).join("/");
}

function validateOrderIdForPath(orderId: string) {
  if (!/^ord-[a-z0-9][a-z0-9-]*$/.test(orderId)) throw new Error("orderId must match ^ord-[a-z0-9][a-z0-9-]*$.");
  return orderId;
}

function validateVersionIdForPath(versionId: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(versionId)) throw new Error("versionId must match ^[A-Za-z0-9][A-Za-z0-9_.-]*$.");
  return versionId;
}

export function orderDir(projectRoot: string, orderId: string) {
  return path.join(protocolRoot(projectRoot), "orders", validateOrderIdForPath(orderId));
}

export function orderJsonPath(projectRoot: string, orderId: string) {
  return path.join(orderDir(projectRoot, orderId), "order.json");
}

export function orderVersionsDir(projectRoot: string, orderId: string) {
  return path.join(orderDir(projectRoot, orderId), "versions");
}

/** Directory for materialized file-reference images: orders/<orderId>/references/ */
export function orderReferencesDir(projectRoot: string, orderId: string) {
  return path.join(orderDir(projectRoot, orderId), "references");
}

export function orderVersionDir(projectRoot: string, orderId: string, versionId: string) {
  return path.join(orderVersionsDir(projectRoot, orderId), validateVersionIdForPath(versionId));
}

/** Path to the review file for a specific order result version: orders/<orderId>/reviews/<versionId>.json */
export function reviewJsonPath(projectRoot: string, orderId: string, versionId: string) {
  return path.join(orderDir(projectRoot, orderId), "reviews", `${validateVersionIdForPath(versionId)}.json`);
}

/** Directory for archived review snapshots: orders/<orderId>/reviews/versions/ */
export function reviewVersionsDir(projectRoot: string, orderId: string) {
  return path.join(orderDir(projectRoot, orderId), "reviews", "versions");
}

/** Path to the current persona review: persona/reviews/current.json */
export function personaReviewPath(projectRoot: string) {
  return path.join(protocolRoot(projectRoot), "persona", "reviews", "current.json");
}

/** Directory for archived persona reviews: persona/reviews/versions/ */
export function personaReviewVersionsDir(projectRoot: string) {
  return path.join(protocolRoot(projectRoot), "persona", "reviews", "versions");
}

/** Directory for persona candidates: persona/candidates/ */
export function personaCandidatesDir(projectRoot: string) {
  return path.join(protocolRoot(projectRoot), "persona", "candidates");
}

/** Path to a specific persona candidate: persona/candidates/<slug>.json */
export function personaCandidatePath(projectRoot: string, slug: string) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("candidate slug must match ^[a-z0-9-]+$.");
  return path.join(protocolRoot(projectRoot), "persona", "candidates", `${slug}.json`);
}

export async function listJsonFiles(dir: string) {
  try {
    return (await fs.readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

export async function requireAnalysis(projectRoot: string) {
  const file = path.join(protocolRoot(projectRoot), "analysis", "current.json");
  if (!(await exists(file))) throw new Error("Missing .repochan/analysis/current.json. Run repochan action='analysis.run' first.");
  return readAnalysisArtifact(projectRoot);
}

export async function requirePersona(projectRoot: string) {
  const file = path.join(protocolRoot(projectRoot), "persona", "current.json");
  if (!(await exists(file))) throw new Error("Missing .repochan/persona/current.json. Run repochan action='persona.create' first.");
  return readPersonaArtifact(projectRoot);
}

export async function requireInterview(projectRoot: string) {
  const file = path.join(protocolRoot(projectRoot), "interview", "current.json");
  if (!(await exists(file))) throw new Error("Missing .repochan/interview/current.json. Run repochan action='interview.create' first.");
  return readInterviewArtifact(projectRoot);
}

/** Check whether an interview report exists, without throwing. */
export async function hasInterview(projectRoot: string) {
  const file = path.join(protocolRoot(projectRoot), "interview", "current.json");
  if (!(await exists(file))) return false;
  await readInterviewArtifact(projectRoot);
  return true;
}

import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);

const CLI_PACKAGE_DIR = path.dirname(require.resolve("../../package.json"));

/**
 * Append source-checkout identity while developing RepoChan itself.
 *
 * A published CLI normally lives under a user's git repository at
 * `node_modules/repochan`. Running git against process.cwd() (or blindly
 * walking up from the package) would therefore mistake the user's project
 * commit and dirty state for the CLI version. Only the canonical monorepo
 * layout is allowed to contribute a git suffix.
 */
export function gitSuffixForPackageDir(packageDir: string): string {
  try {
    const repoRoot = execFileSync("git", ["-C", packageDir, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const packagePrefix = execFileSync("git", ["-C", packageDir, "rev-parse", "--show-prefix"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim().replace(/\\/g, "/").replace(/\/$/, "");
    if (packagePrefix !== "packages/cli") return "";

    const short = execFileSync("git", ["-C", repoRoot, "rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const dirty = execFileSync("git", ["-C", repoRoot, "status", "--porcelain"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim().length > 0;
    return `+g${short}${dirty ? "-dirty" : ""}`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// ~/.repochan/register.json — global registry of installed skills + projects.
//
// This is the "single source of truth" for:
//   - which agents have RepoChan skills installed (and where, at what version)
//   - which projects have been initialized with `repochan init`
//
// Future desktop/web clients read this file to list projects and detect stale
// skills. `repochan status` uses `cliVersion` to detect skill/cli version
// drift and prompt a refresh via `repochan setup`; `getStaleAgents()` is kept
// for a future dedicated `update` command.
// ---------------------------------------------------------------------------

export type SkillScope = "global" | "project";

export interface SkillRecord {
  scope: SkillScope;
  installedAt: string;
  /** CLI version at the time these skills were installed. */
  cliVersion: string;
  skillCount: number;
  /** Human-readable install path (e.g. "~/.claude/skills" or ".claude/skills"). */
  path: string;
}

export interface ProjectRecord {
  /** Absolute path to the project root. */
  path: string;
  initializedAt: string;
  lastSeenAt: string;
  cliVersion: string;
}

export interface Register {
  /** Current schema version of this file. */
  version: number;
  /** CLI version at the last write. */
  cliVersion: string;
  updatedAt: string;
  skills: Record<string, SkillRecord>;
  projects: ProjectRecord[];
}

const REGISTER_DIR = path.join(os.homedir(), ".repochan");
const REGISTER_PATH = path.join(REGISTER_DIR, "register.json");
const SCHEMA_VERSION = 1;

/** Current CLI version (semver from package.json + git hash suffix). */
export function cliVersion(): string {
  try {
    // resolve from this module's location — works in both src/ and dist/.
    const pkgPath = path.join(CLI_PACKAGE_DIR, "package.json");
    const pkg = JSON.parse(require("fs").readFileSync(pkgPath, "utf8"));
    return (pkg.version ?? "0.0.0") + gitSuffixForPackageDir(CLI_PACKAGE_DIR);
  } catch {
    return "0.0.0";
  }
}

function emptyRegister(): Register {
  return {
    version: SCHEMA_VERSION,
    cliVersion: cliVersion(),
    updatedAt: new Date().toISOString(),
    skills: {},
    projects: [],
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (unknown.length || missing.length) {
    throw new Error(`${label} fields are invalid. Missing: ${missing.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"}.`);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function requireTimestamp(value: unknown, label: string): string {
  const timestamp = requireString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp) || new Date(timestamp).toISOString() !== timestamp) {
    throw new Error(`${label} must be a canonical UTC ISO date-time string.`);
  }
  return timestamp;
}

function validateRegister(value: unknown, label: string): Register {
  const data = asRecord(value, label);
  requireExactKeys(data, ["version", "cliVersion", "updatedAt", "skills", "projects"], label);
  if (data.version !== SCHEMA_VERSION) throw new Error(`${label} must declare "version": ${SCHEMA_VERSION}.`);

  const rawSkills = asRecord(data.skills, `${label}.skills`);
  const skills: Record<string, SkillRecord> = {};
  for (const [agentId, rawRecord] of Object.entries(rawSkills)) {
    requireString(agentId, `${label}.skills agent id`);
    const record = asRecord(rawRecord, `${label}.skills.${agentId}`);
    requireExactKeys(record, ["scope", "installedAt", "cliVersion", "skillCount", "path"], `${label}.skills.${agentId}`);
    if (record.scope !== "global" && record.scope !== "project") {
      throw new Error(`${label}.skills.${agentId}.scope must be global or project.`);
    }
    if (!Number.isSafeInteger(record.skillCount) || Number(record.skillCount) < 0) {
      throw new Error(`${label}.skills.${agentId}.skillCount must be a non-negative integer.`);
    }
    skills[agentId] = {
      scope: record.scope,
      installedAt: requireTimestamp(record.installedAt, `${label}.skills.${agentId}.installedAt`),
      cliVersion: requireString(record.cliVersion, `${label}.skills.${agentId}.cliVersion`),
      skillCount: Number(record.skillCount),
      path: requireString(record.path, `${label}.skills.${agentId}.path`),
    };
  }

  if (!Array.isArray(data.projects)) throw new Error(`${label}.projects must be an array.`);
  const projects = data.projects.map((rawProject, index): ProjectRecord => {
    const project = asRecord(rawProject, `${label}.projects[${index}]`);
    requireExactKeys(project, ["path", "initializedAt", "lastSeenAt", "cliVersion"], `${label}.projects[${index}]`);
    const projectPath = requireString(project.path, `${label}.projects[${index}].path`);
    if (!path.isAbsolute(projectPath)) throw new Error(`${label}.projects[${index}].path must be absolute.`);
    return {
      path: projectPath,
      initializedAt: requireTimestamp(project.initializedAt, `${label}.projects[${index}].initializedAt`),
      lastSeenAt: requireTimestamp(project.lastSeenAt, `${label}.projects[${index}].lastSeenAt`),
      cliVersion: requireString(project.cliVersion, `${label}.projects[${index}].cliVersion`),
    };
  });
  if (new Set(projects.map(({ path: projectPath }) => projectPath)).size !== projects.length) {
    throw new Error(`${label}.projects must not contain duplicate paths.`);
  }

  return {
    version: SCHEMA_VERSION,
    cliVersion: requireString(data.cliVersion, `${label}.cliVersion`),
    updatedAt: requireTimestamp(data.updatedAt, `${label}.updatedAt`),
    skills,
    projects,
  };
}

export function parseRegister(source: string, label = "register.json"): Register {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid register JSON at ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateRegister(parsed, label);
}

export async function loadRegister(): Promise<Register> {
  let raw: string;
  try {
    raw = await fs.readFile(REGISTER_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyRegister();
    throw error;
  }
  return parseRegister(raw, REGISTER_PATH);
}

export async function saveRegister(reg: Register): Promise<void> {
  reg.updatedAt = new Date().toISOString();
  reg.cliVersion = cliVersion();
  validateRegister(reg, REGISTER_PATH);
  await fs.mkdir(REGISTER_DIR, { recursive: true });
  const tmp = `${REGISTER_PATH}.tmp.${process.pid}.${randomUUID()}`;
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(tmp, "wx", 0o600);
    await handle.writeFile(JSON.stringify(reg, null, 2) + "\n", "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(tmp, REGISTER_PATH);
    try {
      const dirHandle = await fs.open(REGISTER_DIR, "r");
      try { await dirHandle.sync(); } finally { await dirHandle.close(); }
    } catch {
      // The file itself is fsynced and atomically published on platforms that
      // do not permit opening directories.
    }
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await fs.unlink(tmp).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function recordSkillInstall(
  agentId: string,
  scope: SkillScope,
  installPath: string,
  skillCount: number,
): Promise<void> {
  const reg = await loadRegister();
  reg.skills[agentId] = {
    scope,
    installedAt: reg.skills[agentId]?.installedAt ?? new Date().toISOString(),
    cliVersion: cliVersion(),
    skillCount,
    path: installPath,
  };
  await saveRegister(reg);
}

export async function recordSkillRemove(agentId: string, scope?: SkillScope): Promise<void> {
  const reg = await loadRegister();
  if (scope && reg.skills[agentId]?.scope !== scope) return;
  delete reg.skills[agentId];
  await saveRegister(reg);
}

export async function recordProjectInit(cwd: string): Promise<void> {
  const reg = await loadRegister();
  const abs = path.resolve(cwd);
  const now = new Date().toISOString();
  const existing = reg.projects.find((p) => p.path === abs);
  if (existing) {
    existing.lastSeenAt = now;
    existing.cliVersion = cliVersion();
  } else {
    reg.projects.push({
      path: abs,
      initializedAt: now,
      lastSeenAt: now,
      cliVersion: cliVersion(),
    });
  }
  await saveRegister(reg);
}

export async function recordProjectSeen(cwd: string): Promise<void> {
  const reg = await loadRegister();
  const abs = path.resolve(cwd);
  const existing = reg.projects.find((p) => p.path === abs);
  if (existing) {
    existing.lastSeenAt = new Date().toISOString();
    await saveRegister(reg);
  }
  // If the project isn't in the register, don't auto-add it — only `init`
  // registers projects. `status` just refreshes lastSeen for known ones.
}

// ---------------------------------------------------------------------------
// Queries — skill/cli version drift detection
// ---------------------------------------------------------------------------

/** One agent whose installed skill version differs from the current CLI. */
export interface SkillDriftEntry {
  agentId: string;
  installedVersion: string;
  currentVersion: string;
  scope: SkillScope;
  path: string;
}

/**
 * Return agent records whose installed skill cliVersion differs from the
 * current CLI version — i.e. "skills may be stale, run `repochan setup`".
 * Carries version/path context so callers (e.g. `repochan status`) can show it.
 */
export async function getStaleSkillRecords(): Promise<SkillDriftEntry[]> {
  const reg = await loadRegister();
  const current = cliVersion();
  return Object.entries(reg.skills)
    .filter(([, rec]) => rec.cliVersion !== current)
    .map(([id, rec]) => ({
      agentId: id,
      installedVersion: rec.cliVersion,
      currentVersion: current,
      scope: rec.scope,
      path: rec.path,
    }));
}

/**
 * Return agent ids whose installed skill cliVersion differs from the current
 * CLI version. Kept for a future dedicated `update` command; `status` uses
 * the richer `getStaleSkillRecords()` instead.
 */
export async function getStaleAgents(): Promise<string[]> {
  const stale = await getStaleSkillRecords();
  return stale.map((e) => e.agentId);
}

export { REGISTER_PATH };

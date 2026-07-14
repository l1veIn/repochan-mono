import { promises as fs } from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Append `+g<hash>` (or `+g<hash>-dirty`) from git so every build is identifiable. */
function getGitSuffix(): string {
  try {
    const short = execSync("git rev-parse --short HEAD", { encoding: "utf8", timeout: 2000 }).trim();
    const dirty = execSync("git status --porcelain", { encoding: "utf8", timeout: 2000 }).trim().length > 0;
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
  /** Schema version of this file, for future migrations. */
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
    const pkgPath = require.resolve("../../package.json");
    const pkg = JSON.parse(require("fs").readFileSync(pkgPath, "utf8"));
    return (pkg.version ?? "0.0.0") + getGitSuffix();
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

export async function loadRegister(): Promise<Register> {
  try {
    const raw = await fs.readFile(REGISTER_PATH, "utf8");
    const data = JSON.parse(raw);
    // Basic shape guard — if the file is malformed, start fresh.
    if (typeof data !== "object" || data === null) return emptyRegister();
    return {
      version: data.version ?? SCHEMA_VERSION,
      cliVersion: data.cliVersion ?? cliVersion(),
      updatedAt: data.updatedAt ?? new Date().toISOString(),
      skills: data.skills ?? {},
      projects: data.projects ?? [],
    };
  } catch {
    return emptyRegister();
  }
}

export async function saveRegister(reg: Register): Promise<void> {
  reg.updatedAt = new Date().toISOString();
  reg.cliVersion = cliVersion();
  await fs.mkdir(REGISTER_DIR, { recursive: true });
  const tmp = `${REGISTER_PATH}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(reg, null, 2) + "\n", "utf8");
  await fs.rename(tmp, REGISTER_PATH);
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

export async function recordSkillRemove(agentId: string): Promise<void> {
  const reg = await loadRegister();
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

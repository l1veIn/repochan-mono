import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import {
  validateStarterManifest,
  type StarterManifest,
} from "@repochan/core";

const require = createRequire(import.meta.url);
export const STARTER_MANIFEST_PATH = path.join("repochan", "starter.json");
export const STARTERS_DIR_ENV = "REPOCHAN_STARTERS_DIR";
export const STARTERS_CACHE_VERSION_FILE = "VERSION";

export type StarterSourceKind = "dir" | "cache" | "bundled";

export type StarterSource = {
  kind: StarterSourceKind;
  dir: string;
  /** Synced @repochan/starters version (cache source only, when recorded). */
  version?: string;
  /** How a "dir" source was selected. */
  via?: "flag" | "env";
};

export type StarterMeta = StarterManifest & { dir: string; source: StarterSourceKind };

export type ResolveStarterSourceOptions = {
  /** Explicit directory (--from). Highest priority. */
  from?: string;
  /** Environment bag; defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Home directory for the user-level cache; defaults to os.homedir(). */
  homeDir?: string;
  /**
   * Bundled @repochan/starters package directory. `undefined` probes node
   * resolution (present only in dev / older installs); `null` simulates a
   * published install where the package is absent.
   */
  bundledDir?: string | null;
};

/** User-level on-demand starters cache: <home>/.repochan/starters/. */
export function getStartersCacheDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".repochan", "starters");
}

export async function readCachedStartersVersion(cacheDir: string): Promise<string | null> {
  try {
    const version = (await fs.readFile(path.join(cacheDir, STARTERS_CACHE_VERSION_FILE), "utf8")).trim();
    return version || null;
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Bundled starters ship only as a dev/compat path: the published CLI no longer
 * depends on @repochan/starters, so probe node resolution softly instead of
 * require.resolve-hard-failing.
 */
export async function getBuiltinStartersDir(): Promise<string | null> {
  try {
    return path.dirname(require.resolve("@repochan/starters/package.json"));
  } catch {
    return null;
  }
}

/**
 * Starter source resolution order:
 *   1. explicit --from <dir>
 *   2. REPOCHAN_STARTERS_DIR environment variable
 *   3. user-level cache ~/.repochan/starters/ (written by `starter sync`)
 *   4. bundled @repochan/starters package (dev/compat only, when installed)
 * Returns null when no source is available (fresh global install before sync).
 */
export async function resolveStarterSource(options: ResolveStarterSourceOptions = {}): Promise<StarterSource | null> {
  const env = options.env ?? process.env;
  if (options.from) return { kind: "dir", dir: path.resolve(options.from), via: "flag" };
  const envDir = env[STARTERS_DIR_ENV]?.trim();
  if (envDir) return { kind: "dir", dir: path.resolve(envDir), via: "env" };
  const cacheDir = getStartersCacheDir(options.homeDir);
  if ((await fs.stat(cacheDir).catch(() => undefined))?.isDirectory()) {
    const version = await readCachedStartersVersion(cacheDir);
    return { kind: "cache", dir: cacheDir, ...(version ? { version } : {}) };
  }
  const bundledDir = options.bundledDir === undefined ? await getBuiltinStartersDir() : options.bundledDir;
  if (bundledDir) return { kind: "bundled", dir: bundledDir };
  return null;
}

export async function readStarterManifest(starterDir: string): Promise<StarterMeta | null> {
  const manifestPath = path.join(starterDir, STARTER_MANIFEST_PATH);
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid starter manifest JSON at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return { ...validateStarterManifest(parsed), dir: starterDir, source: "dir" };
  } catch (error) {
    throw new Error(`Invalid starter manifest at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function readStarterInstance(siteDir: string): Promise<StarterMeta> {
  const starter = await readStarterManifest(siteDir);
  if (!starter) throw new Error(`Missing starter manifest: ${path.join(siteDir, STARTER_MANIFEST_PATH)}`);
  return starter;
}

async function listStartersFromRoot(root: string, source: StarterSourceKind): Promise<StarterMeta[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const results: StarterMeta[] = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const manifest = await readStarterManifest(path.join(root, entry.name));
    if (manifest) results.push({ ...manifest, source });
  }
  return results;
}

/** List starters from an already-resolved source. */
export async function listStartersFromSource(source: StarterSource): Promise<StarterMeta[]> {
  return listStartersFromRoot(source.dir, source.kind);
}

/** List starters from the resolved source; empty when no source is available. */
export async function listStarters(options: ResolveStarterSourceOptions = {}): Promise<StarterMeta[]> {
  const source = await resolveStarterSource(options);
  if (!source) return [];
  return listStartersFromSource(source);
}

export async function getDefaultStarterId(options: ResolveStarterSourceOptions = {}): Promise<string> {
  const starters = await listStarters(options);
  const marked = starters.filter((starter) => starter.default);
  if (marked.length > 1) throw new Error(`Multiple default starters: ${marked.map((starter) => starter.id).join(", ")}`);
  if (marked[0]) return marked[0].id;
  if (starters.length === 0) throw new Error("No starters available: run `repochan starter sync` first.");
  return starters[0].id;
}

export async function getStarter(id: string, options: ResolveStarterSourceOptions = {}): Promise<StarterMeta> {
  const starters = await listStarters(options);
  const match = starters.find((starter) => starter.id === id);
  if (!match) throw new Error(`Unknown starter '${id}'. Available: ${starters.map((starter) => starter.id).join(", ") || "(none)"}`);
  return match;
}

export async function getStarterDir(id: string, options: ResolveStarterSourceOptions = {}): Promise<string> {
  return (await getStarter(id, options)).dir;
}

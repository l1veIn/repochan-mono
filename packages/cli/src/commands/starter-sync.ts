import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { emitResult, type OutputOptions } from "../lib/output.js";
import {
  getStartersCacheDir,
  readCachedStartersVersion,
  STARTERS_CACHE_VERSION_FILE,
} from "../lib/starter-loader.js";

const execFileAsync = promisify(execFile);

export const STARTERS_PACKAGE = "@repochan/starters";
const DEFAULT_REGISTRY = "https://registry.npmjs.org";

export type StarterSyncOptions = OutputOptions & {
  force?: boolean;
  /** npm dist-tag to sync. Defaults to `latest`; release staging uses `next`. */
  channel?: string;
};

/**
 * Test seam / embedder seam: production defaults resolve `latest` and download
 * the tarball from npm; tests inject a local fixture instead of a registry.
 */
export type StarterSyncDeps = {
  homeDir?: string;
  /** Resolve the @repochan/starters version for the requested npm dist-tag. */
  resolveLatest?: (channel: string) => Promise<string>;
  /** Download the package tarball for `version` into `destDir`; returns the tarball path. */
  download?: (version: string, destDir: string) => Promise<string>;
};

function isCommandMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

function syncFailure(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Failed to sync ${STARTERS_PACKAGE}: ${detail}\nCheck your network connection and npm registry configuration. Your existing starters cache (if any) was left untouched.`,
  );
}

// Download strategy: `npm view` / `npm pack` subprocesses are the primary path
// because they honor the user's own npm registry configuration (corporate
// mirrors, auth). A plain-https registry fetch is the fallback for minimal
// environments without an npm binary on PATH. Both avoid new dependencies.

export type NpmInvocation = {
  command: string;
  args: string[];
};

/**
 * Windows exposes npm as a .cmd shim, which child_process.execFile cannot
 * execute directly. Route it through ComSpec there; keep direct execution on
 * POSIX so npm still inherits the user's registry/auth configuration.
 */
export function resolveNpmInvocation(
  args: string[],
  platform: NodeJS.Platform = process.platform,
  comSpec: string | undefined = process.env.ComSpec,
): NpmInvocation {
  if (platform === "win32") {
    return {
      command: comSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npm", ...args],
    };
  }
  return { command: "npm", args: [...args] };
}

async function execNpm(args: string[]) {
  if (process.platform === "win32") {
    try {
      await execFileAsync("where.exe", ["npm.cmd"]);
    } catch (error) {
      if ((error as { code?: string | number }).code === 1) {
        const missing = new Error("npm was not found on PATH.") as NodeJS.ErrnoException;
        missing.code = "ENOENT";
        throw missing;
      }
      throw error;
    }
  }
  const invocation = resolveNpmInvocation(args);
  return execFileAsync(invocation.command, invocation.args);
}

function normalizeChannel(value: string | undefined): string {
  const channel = value ?? "latest";
  if (!/^[a-z][a-z0-9._-]{0,63}$/i.test(channel)) {
    throw new Error("starter sync --channel must be a simple npm dist-tag such as latest, next, or beta.");
  }
  return channel;
}

async function defaultResolveLatest(channel: string): Promise<string> {
  try {
    const { stdout } = await execNpm(["view", `${STARTERS_PACKAGE}@${channel}`, "version"]);
    const version = stdout.trim().split(/\r?\n/).pop()?.trim();
    if (!version) throw new Error("npm returned an empty version.");
    return version;
  } catch (error) {
    if (isCommandMissing(error)) return httpsResolveLatest(channel);
    throw syncFailure(error);
  }
}

async function defaultDownload(version: string, destDir: string): Promise<string> {
  try {
    await execNpm(["pack", `${STARTERS_PACKAGE}@${version}`, "--pack-destination", destDir, "--ignore-scripts"]);
  } catch (error) {
    if (isCommandMissing(error)) return httpsDownload(version, destDir);
    throw syncFailure(error);
  }
  const tarball = (await fs.readdir(destDir)).find((name) => name.endsWith(".tgz"));
  if (!tarball) throw syncFailure(new Error(`npm pack did not produce a tarball in ${destDir}.`));
  return path.join(destDir, tarball);
}

function fallbackRegistry(): string {
  return (process.env.npm_config_registry ?? DEFAULT_REGISTRY).replace(/\/+$/, "");
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) throw syncFailure(new Error(`GET ${url} → HTTP ${response.status}`));
  return response.json();
}

export function resolveStarterChannelFromPackument(packument: any, channel: string): string {
  const version = packument?.["dist-tags"]?.[channel];
  if (typeof version !== "string" || !version) {
    throw syncFailure(new Error(`registry packument has no dist-tags.${channel}.`));
  }
  return version;
}

async function httpsResolveLatest(channel: string): Promise<string> {
  const packument = await fetchJson(`${fallbackRegistry()}/${STARTERS_PACKAGE.replace("/", "%2F")}`);
  return resolveStarterChannelFromPackument(packument, channel);
}

async function httpsDownload(version: string, destDir: string): Promise<string> {
  const packument = await fetchJson(`${fallbackRegistry()}/${STARTERS_PACKAGE.replace("/", "%2F")}`);
  const tarballUrl = packument?.versions?.[version]?.dist?.tarball;
  if (typeof tarballUrl !== "string" || !tarballUrl) {
    throw syncFailure(new Error(`registry packument has no tarball URL for ${STARTERS_PACKAGE}@${version}.`));
  }
  const response = await fetch(tarballUrl);
  if (!response.ok) throw syncFailure(new Error(`GET ${tarballUrl} → HTTP ${response.status}`));
  const destination = path.join(destDir, `${STARTERS_PACKAGE.replace("@", "").replace("/", "-")}-${version}.tgz`);
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
  return destination;
}

/**
 * Extract a .tgz with the system `tar` (bundled with macOS, Linux, and
 * Windows 10+ bsdtar) so the CLI needs no npm dependency for archive handling.
 */
async function extractTarball(tarball: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  try {
    await execFileAsync("tar", ["-xzf", tarball, "-C", destination]);
  } catch (error) {
    throw syncFailure(new Error(`tar extraction failed for ${tarball}: ${error instanceof Error ? error.message : String(error)}`));
  }
}

/** Atomically replace the cache: staging dir → rename, with backup rollback. */
async function publishCache(staging: string, cacheDir: string): Promise<void> {
  const backup = `${cacheDir}.backup-${process.pid}`;
  await fs.rm(backup, { recursive: true, force: true });
  const hadPrevious = (await fs.stat(cacheDir).catch(() => undefined))?.isDirectory() === true;
  try {
    if (hadPrevious) await fs.rename(cacheDir, backup);
    await fs.mkdir(path.dirname(cacheDir), { recursive: true });
    await fs.rename(staging, cacheDir);
    await fs.rm(backup, { recursive: true, force: true });
  } catch (error) {
    await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => undefined);
    if (hadPrevious) await fs.rename(backup, cacheDir).catch(() => undefined);
    throw error;
  }
}

export async function runStarterSync(_cwd: string, options: StarterSyncOptions, deps: StarterSyncDeps = {}) {
  const cacheDir = getStartersCacheDir(deps.homeDir);
  const channel = normalizeChannel(options.channel);
  const resolveLatest = deps.resolveLatest ?? defaultResolveLatest;
  const download = deps.download ?? defaultDownload;

  const version = await resolveLatest(channel);
  const cached = await readCachedStartersVersion(cacheDir);
  if (!options.force && cached === version) {
    return emitResult(options, `Starters already up to date (cached@${version}).`, {
      ok: true,
      package: STARTERS_PACKAGE,
      channel,
      version,
      cacheDir,
      updated: false,
    });
  }

  const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-starters-sync-"));
  try {
    const tarball = await download(version, workRoot);
    const extracted = path.join(workRoot, "extracted");
    await extractTarball(tarball, extracted);
    const packageRoot = path.join(extracted, "package");
    if (!(await fs.stat(packageRoot).catch(() => undefined))?.isDirectory()) {
      throw syncFailure(new Error(`tarball ${path.basename(tarball)} has no package/ root.`));
    }
    // Flatten the package contents: ~/.repochan/starters/<starter-id>/...
    const staging = path.join(workRoot, "staging");
    await fs.cp(packageRoot, staging, { recursive: true });
    await fs.writeFile(path.join(staging, STARTERS_CACHE_VERSION_FILE), `${version}\n`);
    await publishCache(staging, cacheDir);
  } finally {
    await fs.rm(workRoot, { recursive: true, force: true });
  }

  return emitResult(options, `Synced ${STARTERS_PACKAGE}@${version} → ${cacheDir}`, {
    ok: true,
    package: STARTERS_PACKAGE,
    channel,
    version,
    cacheDir,
    updated: true,
  });
}

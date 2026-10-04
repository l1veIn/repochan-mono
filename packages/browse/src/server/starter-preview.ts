import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import type http from "node:http";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createStaticFileServer, listenStaticServer } from "./static.js";

export type StarterPreviewProgress = (message: string) => void;
export type StarterPreviewOptions = {
  id: string;
  /** Source Starter directory; installation/build never writes here. */
  dir: string;
  port?: number;
  /** Force a fresh working copy, install, and build. */
  rebuild?: boolean;
  onProgress?: StarterPreviewProgress;
  stdio?: "inherit" | "pipe";
};
export type StarterPreviewResult = {
  id: string;
  url: string;
  port: number;
  server: http.Server;
  /** A matching cached or concurrently preparing preview was reused. */
  reused: boolean;
};
type RegistryEntry = {
  id: string;
  fingerprint: string;
  cancelled: boolean;
  children: Set<ChildProcess>;
  workspace?: string;
  result?: StarterPreviewResult;
  ready?: Promise<StarterPreviewResult>;
};
const registry = new Map<string, RegistryEntry>();
let closeEpoch = 0;
let closing: Promise<void> | undefined;
const ignoredDirectories = new Set(["node_modules", "dist", ".git", ".astro"]);

export type NpmInvocation = { command: string; args: string[] };

/** Windows npm is a .cmd shim, so execute it through ComSpec. */
export function resolveNpmInvocation(
  args: string[],
  platform: NodeJS.Platform = process.platform,
  comSpec: string | undefined = process.env.ComSpec,
): NpmInvocation {
  return platform === "win32"
    ? { command: comSpec || "cmd.exe", args: ["/d", "/s", "/c", "npm", ...args] }
    : { command: "npm", args: [...args] };
}

async function pathExists(file: string): Promise<boolean> {
  return (await fs.stat(file).catch(() => undefined)) !== undefined;
}

/** Hash the same inputs that are copied; generated caches never qualify a build. */
async function sourceFingerprint(dir: string): Promise<string> {
  const hash = createHash("sha256");
  async function visit(current: string, relative: string, ancestors: Set<string>): Promise<void> {
    const stat = await fs.stat(current);
    if (stat.isDirectory()) {
      const real = await fs.realpath(current);
      if (ancestors.has(real)) throw new Error(`Circular directory in Starter source: ${current}`);
      const next = new Set([...ancestors, real]);
      hash.update(JSON.stringify([relative, "directory"]));
      const entries = await fs.readdir(current);
      for (const name of entries.sort()) {
        const child = path.join(current, name);
        if (ignoredDirectories.has(name) && (await fs.stat(child)).isDirectory()) continue;
        await visit(child, path.join(relative, name), next);
      }
    } else if (stat.isFile()) {
      const bytes = await fs.readFile(current);
      hash.update(JSON.stringify([relative, bytes.length, stat.mode & 0o777]));
      hash.update(bytes);
    } else {
      throw new Error(`Unsupported file in Starter source: ${current}`);
    }
  }
  await visit(dir, "", new Set());
  return hash.digest("hex");
}

function assertActive(entry: RegistryEntry): void {
  if (entry.cancelled) throw new Error(`Starter preview cancelled (${entry.id}).`);
}

const childShutdowns = new WeakMap<ChildProcess, Promise<void>>();
function terminateChild(child: ChildProcess): Promise<void> {
  const pending = childShutdowns.get(child);
  if (pending) return pending;
  const shutdown = (async () => {
    if (!child.pid) return;
    if (process.platform === "win32") {
      // Windows has no POSIX process groups; taskkill terminates npm's subtree.
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        killer.once("error", () => { child.kill(); resolve(); });
        killer.once("close", () => resolve());
      });
      return;
    }
    const alive = () => {
      try { process.kill(-child.pid!, 0); return true; }
      catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
    };
    const signal = (kind: NodeJS.Signals) => {
      try { process.kill(-child.pid!, kind); } catch { /* already exited */ }
    };
    if (!alive()) return;
    signal("SIGTERM");
    const deadline = Date.now() + 1000;
    while (alive() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
    // npm exiting does not prove that its descendants exited (especially with inherit).
    if (alive()) signal("SIGKILL");
  })();
  childShutdowns.set(child, shutdown);
  return shutdown;
}

async function cleanup(entry: RegistryEntry): Promise<void> {
  if (entry.result) {
    const server = entry.result.server;
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    // A partial HTTP request can otherwise keep close() pending indefinitely.
    server.closeAllConnections();
    await closed;
  }
  if (entry.workspace) await fs.rm(entry.workspace, { recursive: true, force: true });
}

async function stopEntry(entry: RegistryEntry): Promise<void> {
  entry.cancelled = true;
  await Promise.all([...entry.children].map(terminateChild));
  await entry.ready?.catch(() => undefined);
  await cleanup(entry);
}

async function runStep(args: string[], label: string, options: StarterPreviewOptions, entry: RegistryEntry): Promise<void> {
  assertActive(entry);
  options.onProgress?.(`${label}…`);
  assertActive(entry);
  const invocation = resolveNpmInvocation(args);
  const child = spawn(invocation.command, invocation.args, {
    cwd: entry.workspace,
    stdio: options.stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "true" },
    detached: process.platform !== "win32",
  });
  entry.children.add(child);
  let outputTail = "";
  let spawnError: Error | undefined;
  const collect = (chunk: Buffer) => { outputTail = (outputTail + chunk.toString()).slice(-4000); };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  const exitCode = await new Promise<number | null>((resolve) => {
    child.once("error", (error) => { spawnError = error; });
    // Descendants can retain inherited stdout/stderr after npm exits. Reap at
    // exit so those pipes reach EOF; waiting for close first can deadlock.
    child.once("exit", () => { void terminateChild(child); });
    child.once("close", resolve);
  });
  // Reap any descendants left behind even when npm itself exits successfully.
  await terminateChild(child);
  entry.children.delete(child);
  assertActive(entry);
  if (exitCode !== 0 || spawnError) {
    const detail = (spawnError?.message || outputTail.trim()).split("\n").slice(-12).join("\n");
    throw new Error(`${label} failed (exit ${spawnError ? "spawn error" : exitCode}).${detail ? `\n${detail}` : ""}`);
  }
}

async function prepare(
  options: StarterPreviewOptions,
  source: string,
  key: string,
  entry: RegistryEntry,
  previousCleanup?: Promise<void>,
): Promise<StarterPreviewResult> {
  try {
    await previousCleanup;
    assertActive(entry);
    entry.workspace = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-starter-preview-"));
    await fs.cp(source, entry.workspace, {
      recursive: true,
      dereference: true,
      filter: async (file) => file === source || !(ignoredDirectories.has(path.basename(file)) && (await fs.stat(file)).isDirectory()),
    });
    assertActive(entry);
    if (await sourceFingerprint(entry.workspace) !== entry.fingerprint) {
      throw new Error(`Starter source changed while preparing preview (${options.id}); retry the preview.`);
    }
    await runStep(["install", "--no-audit", "--no-fund"], `npm install (${options.id})`, options, entry);
    await runStep(["run", "build"], `npm run build (${options.id})`, options, entry);
    const distDir = path.join(entry.workspace, "dist");
    if (!(await pathExists(path.join(distDir, "index.html")))) {
      throw new Error(`Starter ${options.id} build completed but dist/index.html is missing.`);
    }
    assertActive(entry);
    const server = createStaticFileServer({ rootDir: distDir });
    // Register before listening so any listen failure/shutdown closes this server.
    entry.result = { id: options.id, url: "", port: 0, server, reused: false };
    let port: number;
    try {
      port = await listenStaticServer(server, options.port ?? 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "EADDRINUSE" || !options.port) throw error;
      port = await listenStaticServer(server, 0);
    }
    assertActive(entry);
    entry.result = { id: options.id, url: `http://127.0.0.1:${port}/`, port, server, reused: false };
    return entry.result;
  } catch (error) {
    if (registry.get(key) === entry) registry.delete(key);
    await cleanup(entry);
    throw error;
  }
}

/** Build an isolated snapshot; reuse only an identical source and content. */
export async function previewStarter(options: StarterPreviewOptions): Promise<StarterPreviewResult> {
  const epoch = closeEpoch;
  const source = await fs.realpath(path.resolve(options.dir));
  if (!(await pathExists(path.join(source, "repochan", "starter.json")))) {
    throw new Error(`Not a starter directory (missing repochan/starter.json): ${source}`);
  }
  const fingerprint = await sourceFingerprint(source);
  if (epoch !== closeEpoch) throw new Error(`Starter preview cancelled (${options.id}).`);
  const key = JSON.stringify([options.id, source]);
  const existing = registry.get(key);
  if (existing && !existing.cancelled && existing.fingerprint === fingerprint &&
      (!existing.result || existing.result.port === 0 || (existing.result.server.listening && !options.rebuild))) {
    const result = await existing.ready!;
    options.onProgress?.(`preview cache hit (${options.id})`);
    return { ...result, reused: true };
  }
  const previousCleanup = existing ? stopEntry(existing) : undefined;
  const entry: RegistryEntry = { id: options.id, fingerprint, cancelled: false, children: new Set() };
  registry.set(key, entry);
  entry.ready = prepare(options, source, key, entry, previousCleanup);
  return entry.ready;
}

/** Cancel preparations, close servers, and remove every temporary working copy. */
export async function closeStarterPreviews(): Promise<void> {
  closeEpoch += 1;
  const entries = [...registry.values()];
  registry.clear();
  const pending = Promise.all([closing, ...entries.map(stopEntry)]).then(() => undefined);
  closing = pending;
  try { await pending; }
  finally { if (closing === pending) closing = undefined; }
}

export function listStarterPreviews(): Array<{ id: string; port: number }> {
  return [...registry.values()].flatMap((entry) => entry.result?.server.listening
    ? [{ id: entry.id, port: entry.result.port }] : []);
}

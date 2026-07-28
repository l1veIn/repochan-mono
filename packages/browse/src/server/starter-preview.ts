import { spawn } from "node:child_process";
import type http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createStaticFileServer, listenStaticServer } from "./static.js";

export type StarterPreviewProgress = (message: string) => void;

export type StarterPreviewOptions = {
  /** Starter id (for logging / registry keying). */
  id: string;
  /** Absolute starter source directory (contains repochan/starter.json). */
  dir: string;
  /** Port to bind; 0/undefined picks a free port. */
  port?: number;
  /** Force re-install/rebuild even when dist exists. */
  rebuild?: boolean;
  /** Progress log sink (CLI prints it; the browse action discards or logs). */
  onProgress?: StarterPreviewProgress;
  /** stdio for install/build children: "inherit" (CLI long task) or "pipe" (server). */
  stdio?: "inherit" | "pipe";
};

export type StarterPreviewResult = {
  id: string;
  url: string;
  port: number;
  server: http.Server;
  /** True when an existing dist was served without re-running install/build. */
  reused: boolean;
};

type RegistryEntry = { server: http.Server; port: number; children: Set<import("node:child_process").ChildProcess> };
const registry = new Map<string, RegistryEntry>();

export type NpmInvocation = {
  command: string;
  args: string[];
};

/**
 * npm is exposed through a .cmd shim on Windows, which Node cannot spawn
 * directly. Route it through ComSpec there and execute npm directly elsewhere.
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

async function pathExists(file: string): Promise<boolean> {
  return (await fs.stat(file).catch(() => undefined)) !== undefined;
}

async function runStep(
  args: string[],
  cwd: string,
  label: string,
  options: StarterPreviewOptions,
  children: Set<import("node:child_process").ChildProcess>,
): Promise<void> {
  options.onProgress?.(`${label}…`);
  const invocation = resolveNpmInvocation(args);
  const child = spawn(invocation.command, invocation.args, {
    cwd,
    stdio: options.stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "true" },
  });
  children.add(child);
  let stderrTail = "";
  if (child.stderr) {
    child.stderr.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000);
    });
  }
  const exitCode = await new Promise<number | null>((resolve) => {
    child.once("error", (error) => {
      stderrTail += `\n${error.message}`;
      resolve(null);
    });
    child.once("close", (code) => resolve(code));
  });
  children.delete(child);
  if (exitCode !== 0) {
    const detail = stderrTail.trim() ? `\n${stderrTail.trim().split("\n").slice(-12).join("\n")}` : "";
    throw new Error(`${label} failed (exit ${exitCode ?? "spawn error"}).${detail}`);
  }
}

/**
 * Prepare (install → build, unless a fresh dist already exists) and serve a
 * starter's astro dist on 127.0.0.1. The returned server runs in-process; it
 * is registered so callers (browse server / CLI) can shut everything down via
 * closeStarterPreviews(). Repeated previews of the same starter reuse the
 * already-listening server.
 */
export async function previewStarter(options: StarterPreviewOptions): Promise<StarterPreviewResult> {
  const dir = path.resolve(options.dir);
  const existing = registry.get(options.id);
  if (existing && existing.server.listening && !options.rebuild) {
    return { id: options.id, url: `http://127.0.0.1:${existing.port}/`, port: existing.port, server: existing.server, reused: true };
  }

  const manifest = path.join(dir, "repochan", "starter.json");
  if (!(await pathExists(manifest))) {
    throw new Error(`Not a starter directory (missing repochan/starter.json): ${dir}`);
  }

  const distDir = path.join(dir, "dist");
  const distReady = !options.rebuild && (await pathExists(path.join(distDir, "index.html")));
  const children = new Set<import("node:child_process").ChildProcess>();

  if (!distReady) {
    if (!(await pathExists(path.join(dir, "node_modules")))) {
      await runStep(["install", "--no-audit", "--no-fund"], dir, `npm install (${options.id})`, options, children);
    }
    await runStep(["run", "build"], dir, `npm run build (${options.id})`, options, children);
    if (!(await pathExists(path.join(distDir, "index.html")))) {
      throw new Error(`Starter ${options.id} build completed but dist/index.html is missing.`);
    }
  } else {
    options.onProgress?.(`dist cache hit (${options.id}) — serving existing build`);
  }

  const server = createStaticFileServer({ rootDir: distDir });
  let port: number;
  try {
    port = await listenStaticServer(server, options.port ?? 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "EADDRINUSE" && options.port) {
      port = await listenStaticServer(server, 0);
    } else {
      throw error;
    }
  }
  registry.set(options.id, { server, port, children });
  return { id: options.id, url: `http://127.0.0.1:${port}/`, port, server, reused: distReady };
}

/** Close every preview server and kill in-flight install/build children. */
export async function closeStarterPreviews(): Promise<void> {
  for (const entry of registry.values()) {
    for (const child of entry.children) child.kill("SIGTERM");
    await new Promise<void>((resolve) => entry.server.close(() => resolve()));
  }
  registry.clear();
}

/** Test/introspection seam: which starters currently have preview servers. */
export function listStarterPreviews(): Array<{ id: string; port: number }> {
  return [...registry.entries()].map(([id, entry]) => ({ id, port: entry.port }));
}

import { spawn } from "node:child_process";
import path from "node:path";
import { exists, protocolRoot } from "@repochan/core";
import {
  createBrowseServer,
  closeStarterPreviews,
  listenBrowseServer,
  type BrowseStarterMeta,
  type BrowseStartersInfo,
} from "@repochan/browse";
import { listStartersFromSource, resolveStarterSource } from "../lib/starter-loader.js";
import { runStarterSync } from "./starter-sync.js";
import { printJson, UsageError } from "../lib/output.js";

const DEFAULT_PORT = 4173;

export function openBrowser(url: string) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", () => { /* Best effort: the printed URL remains usable. */ });
    child.unref();
  } catch {
    // Best-effort: the URL is printed either way.
  }
}

function toStarterMeta(starter: {
  id: string;
  name?: string;
  description?: string;
  style?: string;
  tags?: string[];
  default?: boolean;
  dir: string;
  previews?: { desktop?: string; mobile?: string };
}): BrowseStarterMeta {
  return {
    id: starter.id,
    name: starter.name,
    description: starter.description,
    style: starter.style,
    tags: starter.tags,
    ...(starter.default ? { default: true } : {}),
    dir: starter.dir,
    previews: starter.previews,
  };
}

/** Resolved on every call so a starter-sync action mid-session is picked up without restarting browse. */
async function resolveStartersInfo(): Promise<BrowseStartersInfo> {
  try {
    const source = await resolveStarterSource();
    if (!source) return { source: null, starters: [] };
    const starters = await listStartersFromSource(source).catch(() => []);
    return {
      source: { kind: source.kind, dir: source.dir, version: source.version ?? null, ...(source.via ? { via: source.via } : {}) },
      starters: starters.map(toStarterMeta),
    };
  } catch {
    return { source: null, starters: [] };
  }
}

export async function runBrowse(projectRoot: string, opts: { port?: string; open?: boolean; json?: boolean }) {
  const root = path.resolve(projectRoot);
  if (!(await exists(protocolRoot(root)))) {
    throw new UsageError(
      `No .repochan/ protocol directory in ${root}.`,
      "Run `repochan init` first, then populate it via the analysis/persona skills (or `repochan setup`).",
    );
  }

  let port = DEFAULT_PORT;
  if (opts.port !== undefined) {
    const parsed = Number(opts.port);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new UsageError(`Invalid --port '${opts.port}'.`, "Use an integer between 1 and 65535.");
    }
    port = parsed;
  }

  const server = createBrowseServer({
    projectRoot: root,
    getStarters: resolveStartersInfo,
    syncStarters: async () => {
      const startedAt = Date.now();
      const result = (await runStarterSync(root, {})) as { version?: string; updated?: boolean };
      return { version: result?.version ?? null, updated: result?.updated ?? null, durationMs: Date.now() - startedAt };
    },
  });
  const closeViewer = async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") reject(error);
        else resolve();
      });
      // Incomplete headers can keep close() pending indefinitely. Stop accepting
      // first, then terminate every open HTTP connection, including these sockets.
      server.closeAllConnections();
    });
    await closeStarterPreviews();
  };
  let stopping = false;
  let shutdownTask: Promise<void> | undefined;
  let signalReceived!: () => void;
  const stopped = new Promise<void>((resolve) => { signalReceived = resolve; });
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    shutdownTask = closeViewer();
    void shutdownTask.catch(() => undefined);
    signalReceived();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  try {
    let boundPort: number;
    try {
      boundPort = await listenBrowseServer(server, port);
    } catch (error) {
      // Explicit --port must fail loudly; the default may fall back to a free port.
      if ((error as NodeJS.ErrnoException)?.code === "EADDRINUSE" && opts.port === undefined && !stopping) {
        boundPort = await listenBrowseServer(server, 0);
      } else if (stopping) return;
      else throw error;
    }
    if (stopping) return;
    const initial = await resolveStartersInfo();
    if (stopping) return;
    const url = `http://127.0.0.1:${boundPort}/`;
    if (opts.json) {
      printJson({ ok: true, url, port: boundPort, projectRoot: root, starters: initial.source?.kind ?? null });
    } else {
      console.log(`RepoChan browse — ${root}`);
      console.log(`  viewer:   ${url}`);
      console.log(`  starters: ${initial.source ? `${initial.source.kind} (${initial.starters.length})` : "none (run `repochan starter sync`)"}`);
      console.log("  press Ctrl+C to stop");
    }
    if (opts.open !== false) openBrowser(url);
    await stopped;
  } finally {
    try {
      try { await shutdownTask; }
      finally { await closeViewer(); }
    } finally {
      process.removeListener("SIGINT", shutdown);
      process.removeListener("SIGTERM", shutdown);
    }
  }
}

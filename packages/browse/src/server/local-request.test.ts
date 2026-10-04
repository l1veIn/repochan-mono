import http from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const previews = vi.hoisted(() => ({
  previewStarter: vi.fn(async () => ({ url: "http://127.0.0.1:12345/", port: 12345, reused: false })),
  closeStarterPreviews: vi.fn(async () => {}),
  listStarterPreviews: vi.fn(() => []),
}));
vi.mock("./starter-preview.js", () => previews);
import { createBrowseServer, listenBrowseServer } from "./index.js";
import { createStaticFileServer, listenStaticServer } from "./static.js";

type Reply = { status: number; body: string };
function request(port: number, urlPath: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: urlPath, method: options.method ?? "GET", headers: options.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(options.body);
  });
}

describe("local HTTP request boundary", () => {
  let root: string;
  let browse: http.Server;
  let staticServer: http.Server;
  let port: number;
  let staticPort: number;
  const syncStarters = vi.fn(async () => ({ updated: true }));
  const getStarters = vi.fn(async () => ({ source: null, starters: [{ id: "tiny", dir: root }] }));

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-local-request-test-"));
    await fs.writeFile(path.join(root, "index.html"), "<!doctype html><h1>owned static fixture</h1>");
    browse = createBrowseServer({ projectRoot: root, syncStarters, getStarters });
    staticServer = createStaticFileServer({ rootDir: root });
    port = await listenBrowseServer(browse, 0);
    staticPort = await listenStaticServer(staticServer, 0);
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => {
    await Promise.all([browse, staticServer].map((server) => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    })));
    await fs.rm(root, { recursive: true, force: true });
  });

  it("rejects foreign Host before reads, body parsing or action callbacks", async () => {
    for (const host of ["attacker.example", "localhost.attacker.example", "127.0.0.1@attacker.example"]) {
      expect((await request(port, "/api/health", { headers: { Host: host } })).status).toBe(403);
      for (const action of ["starter-sync", "starter-preview"]) {
        const reply = await request(port, `/api/actions/${action}`, {
          method: "POST", headers: { Host: host, "Content-Type": "application/json" }, body: "{invalid JSON",
        });
        expect(reply.status).toBe(403);
        expect(reply.body).toContain("local Host required");
      }
    }
    expect(getStarters).not.toHaveBeenCalled();
    expect(syncStarters).not.toHaveBeenCalled();
    expect(previews.previewStarter).not.toHaveBeenCalled();
  });

  it("rejects cross-origin simple POST before parsing or invoking actions", async () => {
    for (const origin of ["https://attacker.example", "null", `http://localhost:${port}`]) {
      for (const action of ["starter-sync", "starter-preview"]) {
        const reply = await request(port, `/api/actions/${action}`, {
          method: "POST", headers: { Origin: origin, "Content-Type": "text/plain" }, body: "{invalid JSON",
        });
        expect(reply.status).toBe(403);
        expect(reply.body).toContain("same-origin writes required");
      }
    }
    expect(getStarters).not.toHaveBeenCalled();
    expect(syncStarters).not.toHaveBeenCalled();
    expect(previews.previewStarter).not.toHaveBeenCalled();
  });

  it("keeps same-origin and Origin-free HTTP actions usable", async () => {
    for (const headers of [{ Origin: `http://127.0.0.1:${port}` }, {}]) {
      const sync = await request(port, "/api/actions/starter-sync", { method: "POST", headers });
      expect(sync.status).toBe(200);
      const preview = await request(port, "/api/actions/starter-preview", {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ id: "tiny" }),
      });
      expect(preview.status).toBe(200);
      expect(JSON.parse(preview.body)).toMatchObject({ ok: true, id: "tiny" });
    }
    expect(syncStarters).toHaveBeenCalledTimes(2);
    expect(previews.previewStarter).toHaveBeenCalledTimes(2);
    expect(previews.previewStarter).toHaveBeenCalledWith({ id: "tiny", dir: root, rebuild: false, stdio: "pipe" });
  });

  it("guards static previews while accepting the supported local Hosts", async () => {
    for (const host of ["attacker.example", "localhost.attacker.example", "localhost/ignored", "127.1", "2130706433"]) {
      const reply = await request(staticPort, "/", { headers: { Host: host } });
      expect(reply.status).toBe(403);
      expect(reply.body).not.toContain("owned static fixture");
    }
    for (const host of [`127.0.0.1:${staticPort}`, `localhost:${staticPort}`, `[::1]:${staticPort}`]) {
      const reply = await request(staticPort, "/", { headers: { Host: host } });
      expect(reply.status).toBe(200);
      expect(reply.body).toContain("owned static fixture");
    }
  });
});

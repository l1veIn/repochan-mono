import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBrowseServer, listenBrowseServer, webDistDir, closeStarterPreviews } from "./index.js";
import type http from "node:http";

/** Minimal 1x1 PNG. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const TS = "2026-07-21T00:00:00.000Z";

function orderArtifact(overrides: Record<string, unknown>) {
  return {
    schemaVersion: "repochan.asset-order.v1",
    requestType: "new_asset",
    status: "approved",
    candidateVersions: [],
    priority: "normal",
    references: [],
    brief: { intent: "test order", mustInclude: [], avoid: [], creativeFreedom: [] },
    deliverables: [{ name: "out.png", format: "png" }],
    acceptanceCriteria: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

describe("browse server API contract", () => {
  let projectRoot: string;
  let starterDir: string;
  let startersState: import("./index.js").BrowseStartersInfo;
  let syncCalls = 0;
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-browse-test-"));
    const proto = path.join(projectRoot, ".repochan");

    await writeJson(path.join(proto, "analysis", "current.json"), { summary: "fixture analysis", generatedAt: TS });
    await writeJson(path.join(proto, "persona", "current.json"), { name: "Fixture", nameZh: "夹具", generatedAt: TS });
    await writeJson(path.join(proto, "persona", "versions", "v0.json"), { name: "Fixture", generatedAt: TS });
    await writeJson(path.join(proto, "persona", "candidates", "alt.json"), { name: "Alt", generatedAt: TS });

    const foundationDir = path.join(proto, "orders", "ord-foundation-001");
    await writeJson(path.join(foundationDir, "order.json"), orderArtifact({
      orderId: "ord-foundation-001",
      assetType: "foundation_sheet",
      status: "delivered",
      currentVersion: "v1",
    }));
    await fs.mkdir(path.join(foundationDir, "versions", "v1"), { recursive: true });
    await writeJson(path.join(foundationDir, "versions", "v1", "meta.json"), {
      versionId: "v1",
      createdAt: TS,
      tool: "fixture",
      files: ["img.png"],
    });
    await fs.writeFile(path.join(foundationDir, "versions", "v1", "img.png"), PNG_BYTES);

    const iconDir = path.join(proto, "orders", "ord-icon-001");
    await writeJson(path.join(iconDir, "order.json"), orderArtifact({
      orderId: "ord-icon-001",
      assetType: "icon",
      references: [{ type: "order", orderId: "ord-foundation-001", role: "style" }],
    }));
    await writeJson(path.join(iconDir, "derived.json"), {
      schemaVersion: "repochan.order-derived.v1",
      orderId: "ord-icon-001",
      entries: [{
        slot: "icon",
        starter: "fixture-starter",
        resultVersion: "v1",
        appliedAt: TS,
        archiveDir: "derived/ts--icon",
        steps: [{
          op: "compress",
          out: "public/assets/icon.webp",
          artifacts: [{ out: "public/assets/icon.webp", stored: "derived/ts--icon/public/assets/icon.webp" }],
        }],
      }],
    });
    const artifactFile = path.join(iconDir, "derived", "ts--icon", "public", "assets", "icon.webp");
    await fs.mkdir(path.dirname(artifactFile), { recursive: true });
    await fs.writeFile(artifactFile, PNG_BYTES);

    await fs.writeFile(path.join(proto, "notes.exe"), "nope");

    // Fixture starter with a mock build (node script writes dist) — no astro needed.
    starterDir = path.join(projectRoot, "fixture-starters", "tiny");
    await fs.mkdir(path.join(starterDir, "node_modules"), { recursive: true }); // skip npm install
    await fs.mkdir(path.join(starterDir, "repochan", "previews"), { recursive: true });
    await fs.writeFile(path.join(starterDir, "repochan", "starter.json"), JSON.stringify({ id: "tiny" }));
    await fs.writeFile(path.join(starterDir, "repochan", "previews", "desktop.webp"), PNG_BYTES);
    await fs.writeFile(path.join(starterDir, "package.json"), JSON.stringify({
      name: "tiny-starter",
      type: "module",
      scripts: { build: "node build.js" },
    }));
    await fs.writeFile(path.join(starterDir, "build.js"), `
import { promises as fs } from "node:fs";
await fs.mkdir("dist", { recursive: true });
await fs.writeFile("dist/index.html", "<!doctype html><title>tiny</title><h1>tiny starter</h1>");
const countFile = "build-count.txt";
const count = Number(await fs.readFile(countFile, "utf8").catch(() => "0")) + 1;
await fs.writeFile(countFile, String(count));
`);

    startersState = {
      source: { kind: "dir", dir: path.join(projectRoot, "fixture-starters"), via: "flag" },
      starters: [{
        id: "tiny",
        name: "Tiny",
        dir: starterDir,
        tags: ["test"],
        previews: { desktop: "repochan/previews/desktop.webp" },
      }],
    };

    server = createBrowseServer({
      projectRoot,
      getStarters: async () => startersState,
      syncStarters: async () => {
        syncCalls += 1;
        startersState = {
          source: { kind: "cache", dir: "/tmp/starters-cache", version: "9.9.9" },
          starters: startersState.starters,
        };
        return { version: "9.9.9", updated: true, durationMs: 5 };
      },
    });
    const port = await listenBrowseServer(server, 0);
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeStarterPreviews();
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  const get = async (urlPath: string) => fetch(`${base}${urlPath}`);
  const getJson = async (urlPath: string) => (await get(urlPath)).json() as Promise<any>;

  it("GET /api/health reports protocol + starters source", async () => {
    const body = await getJson("/api/health");
    expect(body.ok).toBe(true);
    expect(body.projectRoot).toBe(projectRoot);
    expect(body.protocol).toMatchObject({ exists: true, analysis: true, persona: true, orderCount: 2 });
    expect(body.starters.source).toMatchObject({ kind: "dir" });
    expect(body.starters.starters).toHaveLength(1);
  });

  it("GET /api/tree returns top-level index", async () => {
    const body = await getJson("/api/tree");
    expect(body.analysis.exists).toBe(true);
    expect(body.persona.versions).toContain("v0.json");
    expect(body.orders.map((o: any) => o.orderId).sort()).toEqual(["ord-foundation-001", "ord-icon-001"]);
  });

  it("GET /api/persona returns current + versions + candidates", async () => {
    const body = await getJson("/api/persona");
    expect(body.current.name).toBe("Fixture");
    expect(body.versions).toHaveLength(1);
    expect(body.candidates).toEqual([expect.objectContaining({ slug: "alt", name: "Alt" })]);
  });

  it("GET /api/orders lists summaries with cover from current version", async () => {
    const body = await getJson("/api/orders");
    const foundation = body.orders.find((o: any) => o.orderId === "ord-foundation-001");
    expect(foundation.cover).toBe("orders/ord-foundation-001/versions/v1/img.png");
    expect(foundation.status).toBe("delivered");
    const icon = body.orders.find((o: any) => o.orderId === "ord-icon-001");
    expect(icon.cover).toBeNull();
  });

  it("GET /api/orders/:id returns order + versions + resolved references", async () => {
    const body = await getJson("/api/orders/ord-icon-001");
    expect(body.order.orderId).toBe("ord-icon-001");
    expect(body.references).toHaveLength(1);
    expect(body.references[0]).toMatchObject({ type: "order", role: "style", orderId: "ord-foundation-001", versionId: "v1", error: null });
    expect(body.references[0].files[0].path).toBe("orders/ord-foundation-001/versions/v1/img.png");
    expect(body.derivedAvailable).toBe(true);

    const foundation = await getJson("/api/orders/ord-foundation-001");
    expect(foundation.currentVersion).toBe("v1");
    expect(foundation.versions[0].files[0]).toMatchObject({ name: "img.png", image: true });
  });

  it("GET /api/orders/:id rejects invalid ids with 400", async () => {
    const res = await get("/api/orders/not-an-order");
    expect(res.status).toBe(400);
  });

  it("GET /api/orders/:id/derived returns audit timeline; 404 when absent", async () => {
    const body = await getJson("/api/orders/ord-icon-001/derived");
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ slot: "icon", starter: "fixture-starter", artifactCount: 1 });
    expect(body.entries[0].artifacts[0].path).toBe("orders/ord-icon-001/derived/ts--icon/public/assets/icon.webp");

    const missing = await get("/api/orders/ord-foundation-001/derived");
    expect(missing.status).toBe(404);
  });

  it("GET /api/graph derives nodes and reference/foundation edges", async () => {
    const body = await getJson("/api/graph");
    const nodeIds = body.nodes.map((n: any) => n.id);
    expect(nodeIds).toEqual(expect.arrayContaining(["persona:current", "analysis:current", "order:ord-foundation-001", "order:ord-icon-001", "derived:ord-icon-001"]));
    const foundation = body.nodes.find((n: any) => n.id === "order:ord-foundation-001");
    expect(foundation.foundation).toBe(true);
    expect(foundation.thumb).toBe("orders/ord-foundation-001/versions/v1/img.png");
    const anchorEdge = body.edges.find((e: any) => e.from === "order:ord-icon-001" && e.to === "order:ord-foundation-001");
    expect(anchorEdge).toMatchObject({ kind: "foundation-anchor", role: "style" });
    const derivedEdge = body.edges.find((e: any) => e.kind === "derived-from");
    expect(derivedEdge).toMatchObject({ from: "derived:ord-icon-001", to: "order:ord-icon-001" });
  });

  it("GET /api/file serves protocol files with content type", async () => {
    const res = await get(`/api/file?path=${encodeURIComponent("orders/ord-foundation-001/versions/v1/img.png")}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.equals(PNG_BYTES)).toBe(true);
  });

  it("GET /api/file rejects traversal, escapes, symlinks-adjacent tricks, and non-servable extensions", async () => {
    for (const p of ["../../etc/passwd", "../outside.json", "/etc/passwd", "orders/../../secret"]) {
      const res = await get(`/api/file?path=${encodeURIComponent(p)}`);
      expect([403, 404]).toContain(res.status);
    }
    const outside = await get(`/api/file?path=${encodeURIComponent("../../../etc/passwd")}`);
    expect(outside.status).toBe(403);
    const ext = await get(`/api/file?path=${encodeURIComponent("notes.exe")}`);
    expect(ext.status).toBe(403);
    const missing = await get(`/api/file?path=${encodeURIComponent("orders/ord-icon-001/nope.png")}`);
    expect(missing.status).toBe(404);
  });

  it("GET / serves the SPA when built, 404 otherwise", async () => {
    const res = await get("/");
    const built = await fs.stat(path.join(webDistDir(), "index.html")).then((s) => s.isFile()).catch(() => false);
    expect(res.status).toBe(built ? 200 : 404);
  });

  it("GET /api/starters returns injected starter metadata", async () => {
    const body = await getJson("/api/starters");
    expect(body.source).toMatchObject({ kind: "dir" });
    expect(body.starters[0]).toMatchObject({ id: "tiny", name: "Tiny", dir: starterDir });
    expect(body.starters[0].previews.desktop).toBe("repochan/previews/desktop.webp");
  });

  it("GET /api/starters/:id/file serves starter files inside the sandbox only", async () => {
    const ok = await get(`/api/starters/tiny/file?path=${encodeURIComponent("repochan/previews/desktop.webp")}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");

    for (const p of ["../escape.png", "../../etc/passwd", "/etc/passwd"]) {
      const res = await get(`/api/starters/tiny/file?path=${encodeURIComponent(p)}`);
      expect([403, 404]).toContain(res.status);
    }
    const outside = await get(`/api/starters/tiny/file?path=${encodeURIComponent("../../../etc/passwd")}`);
    expect(outside.status).toBe(403);
    const unknown = await get(`/api/starters/nope/file?path=${encodeURIComponent("repochan/previews/desktop.webp")}`);
    expect(unknown.status).toBe(404);
  });

  it("POST /api/actions/starter-sync delegates to the injected sync and refreshes the list", async () => {
    const res = await fetch(`${base}/api/actions/starter-sync`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result).toMatchObject({ version: "9.9.9", updated: true });
    expect(syncCalls).toBe(1);
    expect(body.starters.source).toMatchObject({ kind: "cache", version: "9.9.9" });

    const wrongMethod = await get("/api/actions/starter-sync");
    expect(wrongMethod.status).toBe(405);
  });

  it("POST /api/actions/starter-preview builds, serves, then hits the dist cache", async () => {
    const post = (body: unknown) =>
      fetch(`${base}/api/actions/starter-preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());

    const first = await post({ id: "tiny" });
    expect(first).toMatchObject({ ok: true, id: "tiny", reused: false });
    expect(first.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);

    const page = await fetch(first.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("tiny starter");

    const second = await post({ id: "tiny" });
    expect(second).toMatchObject({ ok: true, reused: true, url: first.url, port: first.port });

    const buildCount = await fs.readFile(path.join(starterDir, "build-count.txt"), "utf8");
    expect(buildCount).toBe("1");

    const missing = await post({ id: "nope" });
    expect(missing.error).toMatch(/unknown starter/);
  });

  it("POST /api/actions/starter-preview surfaces build failures", async () => {
    // Break the fixture build, force a rebuild, expect a transparent error.
    await fs.rename(path.join(starterDir, "dist"), path.join(starterDir, "dist-keep"));
    await fs.rm(path.join(starterDir, "dist"), { recursive: true, force: true });
    await fs.writeFile(path.join(starterDir, "build.js"), `process.exit(3);\n`);
    // Drop the registry's cached server so the rebuild path actually runs.
    await closeStarterPreviews();

    const res = await fetch(`${base}/api/actions/starter-preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "tiny", rebuild: true }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/build.*failed|failed.*exit 3/i);
  });
});

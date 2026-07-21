import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBrowseServer, listenBrowseServer, webDistDir } from "./index.js";
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

    server = createBrowseServer({
      projectRoot,
      starters: { source: { kind: "cache", dir: "/tmp/starters", version: "0.1.0" }, starters: [{ id: "landing-museum" }] },
    });
    const port = await listenBrowseServer(server, 0);
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  const get = async (urlPath: string) => fetch(`${base}${urlPath}`);
  const getJson = async (urlPath: string) => (await get(urlPath)).json() as Promise<any>;

  it("GET /api/health reports protocol + starters source", async () => {
    const body = await getJson("/api/health");
    expect(body.ok).toBe(true);
    expect(body.projectRoot).toBe(projectRoot);
    expect(body.protocol).toMatchObject({ exists: true, analysis: true, persona: true, orderCount: 2 });
    expect(body.starters.source).toMatchObject({ kind: "cache", version: "0.1.0" });
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
});

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addOrderRevision, reviewJsonPath } from "@repochan/core";
import { createBrowseServer, listenBrowseServer } from "./index.js";

const TS = "2026-10-04T00:00:00.000Z";
const orderId = "ord-review-fixture";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data));
}

function review(versionId: string) {
  return {
    schemaVersion: "repochan.review.v1", orderId, versionId, verdict: versionId === "v1" ? "revise" : "pass",
    notes: `feedback:${versionId}`, reviewerRole: "user", generatedAt: TS, provenance: { tool: "test" },
    criteriaResults: [{ criterion: "character continuity", passed: versionId !== "v1", note: `criterion:${versionId}` }],
  };
}

describe("order detail version reviews", () => {
  let root: string;
  let server: http.Server;
  let base: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-review-view-"));
    const dir = path.join(root, ".repochan", "orders", orderId);
    await writeJson(path.join(dir, "order.json"), {
      schemaVersion: "repochan.asset-order.v1", orderId, requestType: "new_asset", assetType: "foundation_sheet",
      status: "delivered", currentVersion: "v2", candidateVersions: ["candidate-1"], priority: "normal", references: [],
      brief: { intent: "fixture", mustInclude: [], avoid: [], creativeFreedom: [] }, deliverables: [], acceptanceCriteria: [],
      createdAt: TS, updatedAt: TS,
    });
    for (const versionId of ["v1", "v2", "candidate-1"]) {
      const versionDir = path.join(dir, "versions", versionId);
      await writeJson(path.join(versionDir, "meta.json"), { versionId, createdAt: TS, files: ["img.png"] });
      await fs.writeFile(path.join(versionDir, "img.png"), PNG);
    }
    await writeJson(reviewJsonPath(root, orderId, "v1"), review("v1"));
    await writeJson(reviewJsonPath(root, orderId, "candidate-1"), review("candidate-1"));
    server = createBrowseServer({ projectRoot: root });
    base = `http://127.0.0.1:${await listenBrowseServer(server, 0)}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });

  const detail = async () => {
    const response = await fetch(`${base}/api/orders/${orderId}`);
    expect(response.status).toBe(200);
    return response.json() as Promise<any>;
  };

  it("binds reviews to their exact historical and candidate versions and leaves current unreviewed", async () => {
    const body = await detail();
    expect(body.currentVersion).toBe("v2");
    expect(body.candidateVersions).toEqual(["candidate-1"]);
    expect(body.versions.find((v: any) => v.versionId === "v1")).toMatchObject({ review: review("v1"), reviewError: null });
    expect(body.versions.find((v: any) => v.versionId === "candidate-1")).toMatchObject({ review: review("candidate-1"), reviewError: null });
    expect(body.versions.find((v: any) => v.versionId === "v2")).toMatchObject({ review: null, reviewError: null });
    await expect(fs.stat(reviewJsonPath(root, orderId, "v2"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("exposes a Core order revision request even when the current version has no Review", async () => {
    await addOrderRevision(root, orderId, "Reduce the cover saturation");
    const body = await detail();
    expect(body.order.status).toBe("needs_revision");
    expect(body.order.revisions).toEqual([{
      requestedAt: expect.any(String), request: "Reduce the cover saturation", status: "draft",
    }]);
    const current = body.versions.find((v: any) => v.versionId === "v2");
    expect(current).toMatchObject({ review: null, reviewError: null });
    expect((await fetch(`${base}/api/file?path=${encodeURIComponent(current.files[0].path)}`)).status).toBe(200);
  });

  it.each([
    ["invalid JSON", "{"],
    ["invalid schema", JSON.stringify({ ...review("v1"), verdict: "unknown" })],
    ["wrong version", JSON.stringify(review("v2"))],
    ["wrong order", JSON.stringify({ ...review("v1"), orderId: "ord-another" })],
  ])("shows a review error for %s without dropping the result or other reviews", async (_label, bytes) => {
    await fs.writeFile(reviewJsonPath(root, orderId, "v1"), bytes);
    const body = await detail();
    const historical = body.versions.find((v: any) => v.versionId === "v1");
    expect(historical.review).toBeNull();
    expect(historical.reviewError).toEqual(expect.any(String));
    expect(historical.reviewError.length).toBeGreaterThan(0);
    expect(body.versions.find((v: any) => v.versionId === "candidate-1").review.notes).toBe("feedback:candidate-1");
    const image = await fetch(`${base}/api/file?path=${encodeURIComponent(historical.files[0].path)}`);
    expect(image.status).toBe(200);
    expect(Buffer.from(await image.arrayBuffer())).toEqual(PNG);
    expect(await fs.readFile(reviewJsonPath(root, orderId, "v1"), "utf8")).toBe(bytes);
  });

  it("rejects a symlinked review directory and keeps all images viewable", async () => {
    const outside = path.join(root, "outside-reviews");
    await writeJson(path.join(outside, "v2.json"), { ...review("v2"), notes: "must not be read" });
    const reviewsDir = path.dirname(reviewJsonPath(root, orderId, "v1"));
    await fs.rm(reviewsDir, { recursive: true });
    await fs.symlink(outside, reviewsDir, process.platform === "win32" ? "junction" : "dir");
    const body = await detail();
    for (const version of body.versions) {
      expect(version.review).toBeNull();
      expect(version.reviewError).toMatch(/symbolic link/i);
      expect(version.files).toHaveLength(1);
    }
  });
});

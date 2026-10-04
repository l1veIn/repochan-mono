import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runOrderGetResult } from "./order.js";

const roots: string[] = [];
const timestamp = "2026-01-01T00:00:00.000Z";

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function resultFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "repochan-result-paths-"));
  roots.push(root);
  const orderId = "ord-result-paths";
  const dir = path.join(root, ".repochan", "orders", orderId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "order.json"), JSON.stringify({
    schemaVersion: "repochan.asset-order.v1", orderId, requestType: "new_asset", assetType: "foundation_sheet",
    status: "delivered", currentVersion: "v2", candidateVersions: ["candidate-1"], priority: "normal", references: [],
    brief: { intent: "fixture", mustInclude: [], avoid: [], creativeFreedom: [] }, deliverables: [], acceptanceCriteria: [],
    createdAt: timestamp, updatedAt: timestamp,
  }));
  for (const versionId of ["v1", "v2", "candidate-1"]) {
    const versionDir = path.join(dir, "versions", versionId);
    await mkdir(versionDir, { recursive: true });
    await writeFile(path.join(versionDir, "same.png"), `result:${versionId}`);
    await writeFile(path.join(versionDir, "meta.json"), JSON.stringify({
      versionId, createdAt: timestamp, files: ["same.png"], notes: `notes:${versionId}`,
    }));
  }
  // A basename at the project root must never be mistaken for a published result.
  await writeFile(path.join(root, "same.png"), "project-root collision");
  return { root, dir, orderId };
}

describe("order get-result usable paths", () => {
  it("returns readable absolute paths for the current version without rewriting metadata", async () => {
    const { root, dir, orderId } = await resultFixture();
    const metaPath = path.join(dir, "versions", "v2", "meta.json");
    const before = await readFile(metaPath);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runOrderGetResult(root, orderId, undefined, { json: true });
    const body = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(body).toMatchObject({ orderId, version: { versionId: "v2", files: ["same.png"] } });
    expect(body.files).toEqual([path.join(dir, "versions", "v2", "same.png")]);
    expect(path.isAbsolute(body.files[0])).toBe(true);
    expect(await readFile(body.files[0], "utf8")).toBe("result:v2");
    expect(await readFile(metaPath)).toEqual(before);
  });

  it("uses the selected historical version with a relative project root and colliding filenames", async () => {
    const { root, dir, orderId } = await resultFixture();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runOrderGetResult(path.relative(process.cwd(), root), orderId, "v1", { json: true });
    const body = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(body.version.versionId).toBe("v1");
    expect(body.version.files).toEqual(["same.png"]);
    expect(body.files).toEqual([path.join(dir, "versions", "v1", "same.png")]);
    expect(await readFile(body.files[0], "utf8")).toBe("result:v1");
  });

  it("also returns the selected candidate paths in human-readable output", async () => {
    const { root, dir, orderId } = await resultFixture();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runOrderGetResult(root, orderId, "candidate-1", {});
    const body = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(body.version.versionId).toBe("candidate-1");
    expect(body.files).toEqual([path.join(dir, "versions", "candidate-1", "same.png")]);
    expect(await readFile(body.files[0], "utf8")).toBe("result:candidate-1");
  });
});

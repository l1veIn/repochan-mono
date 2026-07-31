import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  addOrderRevision,
  createOrderCandidate,
  createOrderResult,
  createOrders,
  createReview,
  listOrderResults,
  promoteCandidate,
  readOrder,
  setOrderStatus,
} from "../src/entities/index.js";
import { initProtocol } from "../src/protocol/index.js";
import { seedUpstream } from "../test-support/fixtures.js";
import { symlinkDir } from "../test-support/symlink.js";

describe("candidate lifecycle pointers", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-candidate-"));
    await initProtocol(projectRoot);
    await seedUpstream(projectRoot);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  async function seed(orderId: string) {
    await createOrders(projectRoot, { order: {
      orderId,
      requestType: "new_asset",
      assetType: "hero_illustration",
      brief: { intent: "test", mustInclude: [], avoid: [], creativeFreedom: [] },
      deliverables: [],
      acceptanceCriteria: [],
    } });
    await setOrderStatus(projectRoot, orderId, "approved");
  }

  async function source(orderId: string, versionId: string) {
    const file = path.join(projectRoot, `${orderId}-${versionId}.png`);
    await fs.writeFile(file, `${versionId} bytes`);
    return file;
  }

  async function candidate(orderId: string, versionId: string) {
    return createOrderCandidate(projectRoot, {
      orderId,
      versionId,
      files: [await source(orderId, versionId)],
      tool: "manual",
    });
  }

  it("records candidate identity only on order lifecycle state", async () => {
    await seed("ord-candidate-one");
    const created = await candidate("ord-candidate-one", "c1");
    expect(created.version).not.toHaveProperty("role");
    expect(created.order).toMatchObject({ status: "approved", candidateVersions: ["c1"] });
    expect(created.order.currentVersion).toBeUndefined();

    const stored = JSON.parse(await fs.readFile(path.join(projectRoot, ".repochan/orders/ord-candidate-one/versions/c1/meta.json"), "utf8"));
    expect(stored).not.toHaveProperty("role");
    const listed = await listOrderResults(projectRoot, "ord-candidate-one");
    expect(listed).toMatchObject({ currentVersion: undefined, candidateVersions: ["c1"] });
    expect(listed.results.map((result) => result.versionId)).toEqual(["c1"]);
  });

  it("promotes by changing order pointers without mutating any result metadata", async () => {
    await seed("ord-candidate-promote");
    await createOrderResult(projectRoot, {
      orderId: "ord-candidate-promote", versionId: "v1", files: [await source("ord-candidate-promote", "v1")], tool: "manual",
    });
    await candidate("ord-candidate-promote", "c1");
    await candidate("ord-candidate-promote", "c2");
    const v1Meta = path.join(projectRoot, ".repochan/orders/ord-candidate-promote/versions/v1/meta.json");
    const c1Meta = path.join(projectRoot, ".repochan/orders/ord-candidate-promote/versions/c1/meta.json");
    const before = await Promise.all([v1Meta, c1Meta].map((file) => fs.readFile(file)));

    const promoted = await promoteCandidate(projectRoot, "ord-candidate-promote", "c1");
    expect(promoted.previousCurrentVersion).toBe("v1");
    expect(promoted.promotedVersion).not.toHaveProperty("role");
    expect(promoted.order).toMatchObject({ currentVersion: "c1", candidateVersions: ["c2"], status: "delivered" });
    expect(await Promise.all([v1Meta, c1Meta].map((file) => fs.readFile(file)))).toEqual(before);
    expect((await listOrderResults(projectRoot, "ord-candidate-promote")).results.map((result) => result.versionId).sort()).toEqual(["c1", "c2", "v1"]);
  });

  it("refuses non-candidates, missing evidence, symlinks, and current creation over a candidate id", async () => {
    await seed("ord-candidate-guards");
    await candidate("ord-candidate-guards", "c1");
    await expect(promoteCandidate(projectRoot, "ord-candidate-guards", "ghost")).rejects.toThrow(/not a candidate/);

    const candidateFile = path.join(projectRoot, ".repochan/orders/ord-candidate-guards/versions/c1/ord-candidate-guards-c1.png");
    await fs.rm(candidateFile);
    await expect(promoteCandidate(projectRoot, "ord-candidate-guards", "c1")).rejects.toThrow(/Cannot promote candidate.*missing/);
    expect((await readOrder(projectRoot, "ord-candidate-guards")).candidateVersions).toEqual(["c1"]);

    await fs.writeFile(candidateFile, "restored");
    await expect(createOrderResult(projectRoot, {
      orderId: "ord-candidate-guards", versionId: "c1", files: [await source("ord-candidate-guards", "other")], tool: "manual",
    })).rejects.toThrow(/candidate.*promotion/);
    const versionDir = path.dirname(candidateFile);
    const outside = path.join(projectRoot, "outside");
    await fs.mkdir(outside);
    await fs.rm(versionDir, { recursive: true });
    await symlinkDir(outside, versionDir);
    await expect(promoteCandidate(projectRoot, "ord-candidate-guards", "c1")).rejects.toThrow(/refuses symlink path/);

  });

  it("rolls back order bytes when promotion publication fails", async () => {
    await seed("ord-candidate-rollback");
    await candidate("ord-candidate-rollback", "c1");
    const orderFile = path.join(projectRoot, ".repochan/orders/ord-candidate-rollback/order.json");
    const before = await fs.readFile(orderFile);
    const originalRename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (String(from).includes(".promotion-txn-") && path.basename(String(from)) === "order.json" && path.resolve(String(to)) === path.resolve(orderFile)) {
        throw new Error("simulated promotion failure");
      }
      return originalRename(from, to);
    });
    await expect(promoteCandidate(projectRoot, "ord-candidate-rollback", "c1")).rejects.toThrow(/simulated promotion failure/);
    expect(await fs.readFile(orderFile)).toEqual(before);
  });

  it("requires promotion even when a candidate directory is damaged", async () => {
    await seed("ord-candidate-only-promote");
    await candidate("ord-candidate-only-promote", "c1");
    await fs.rm(path.join(projectRoot, ".repochan/orders/ord-candidate-only-promote/versions/c1"), { recursive: true });
    await expect(createOrderResult(projectRoot, {
      orderId: "ord-candidate-only-promote", versionId: "c1", files: [await source("ord-candidate-only-promote", "replacement")], tool: "manual",
    })).rejects.toThrow(/candidate.*only through candidate promotion/);
    expect((await readOrder(projectRoot, "ord-candidate-only-promote")).candidateVersions).toEqual(["c1"]);
  });

  it("keeps a published version id immutable across an approved revision", async () => {
    await seed("ord-immutable-version");
    await createOrderResult(projectRoot, {
      orderId: "ord-immutable-version", versionId: "v1", files: [await source("ord-immutable-version", "v1")], tool: "manual",
    });
    await addOrderRevision(projectRoot, "ord-immutable-version", "new revision");
    await setOrderStatus(projectRoot, "ord-immutable-version", "approved");
    await expect(createOrderResult(projectRoot, {
      orderId: "ord-immutable-version", versionId: "v1", files: [await source("ord-immutable-version", "replacement")], tool: "manual",
    })).rejects.toThrow(/already exists.*immutable/);
  });

  it("preserves a concurrent lifecycle mutation instead of publishing stale promotion state", async () => {
    await seed("ord-candidate-cas");
    await candidate("ord-candidate-cas", "c1");
    const originalWrite = fs.writeFile.bind(fs);
    let resume!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    const staged = new Promise<void>((resolve) => { started = resolve; });
    let paused = false;
    vi.spyOn(fs, "writeFile").mockImplementation(async (file, data, options) => {
      if (!paused && String(file).includes(".promotion-txn-") && path.basename(String(file)) === "order.json") {
        paused = true;
        started();
        await gate;
      }
      return originalWrite(file, data, options as never);
    });
    const promotion = promoteCandidate(projectRoot, "ord-candidate-cas", "c1");
    await staged;
    await addOrderRevision(projectRoot, "ord-candidate-cas", "newer mutation");
    resume();
    await expect(promotion).rejects.toThrow(/conflict.*newer order mutation was preserved/);
    expect(await readOrder(projectRoot, "ord-candidate-cas")).toMatchObject({ status: "needs_revision", candidateVersions: ["c1"] });
  });

  it("allows review of a complete candidate through the strict result reader", async () => {
    await seed("ord-candidate-review");
    await candidate("ord-candidate-review", "c1");
    const reviewed = await createReview(projectRoot, { orderId: "ord-candidate-review", versionId: "c1", verdict: "pass" });
    expect(reviewed.review).toMatchObject({ versionId: "c1", verdict: "pass" });
  });
});

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrders, initProtocol } from "@repochan/core";
import {
  runOrderCreate,
  runOrderAddRevision,
  runOrderRecoveryAbort,
  runOrderRecoveryList,
  runOrderRecoveryRecover,
  runOrderResolveReferences,
} from "./order.js";
import { PROTOCOL_SUBCOMMANDS } from "./entities.js";

const tempDirs: string[] = [];

function canonicalAnalysis() {
  return {
    schemaVersion: "repochan.analysis.v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    context: {
      basic: {},
      identity: { namingSeeds: { primary: ["fixture"], secondary: [], rationale: ["fixture"] } },
      file_structure: {}, inventory: {}, tech_stack: {}, pre_analysis: {}, git_profile: {},
      docs_narrative: {}, github_meta: {}, color_palette: {}, core_samples: {}, deterministic_tooling: {},
    },
    persona: null,
    error: null,
  };
}

function canonicalPersona() {
  return {
    name: "Fixture", rolePrompt: "fixture visual tags", artStyle: "cel-shaded anime",
    schemaVersion: "repochan.persona.v2", generatedAt: "2026-01-01T00:00:00.000Z",
    provenance: { tool: "test" },
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("order resolve-references", () => {
  it("passes the order references array to core and returns absolute image paths", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "repochan-order-refs-"));
    tempDirs.push(projectRoot);

    const sourceDir = path.join(projectRoot, ".repochan", "orders", "ord-source");
    const versionDir = path.join(sourceDir, "versions", "v1");
    const targetDir = path.join(projectRoot, ".repochan", "orders", "ord-target");
    await mkdir(versionDir, { recursive: true });
    await mkdir(targetDir, { recursive: true });
    await writeFile(
      path.join(sourceDir, "order.json"),
      JSON.stringify({
        schemaVersion: "repochan.asset-order.v1", orderId: "ord-source", requestType: "new_asset", status: "delivered",
        currentVersion: "v1", candidateVersions: [], assetType: "foundation_sheet", priority: "normal", references: [],
        brief: { intent: "source", mustInclude: [], avoid: [], creativeFreedom: [] }, deliverables: [], acceptanceCriteria: [],
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      "utf8",
    );
    await writeFile(path.join(versionDir, "reference.png"), "fake png", "utf8");
    await writeFile(path.join(versionDir, "meta.json"), JSON.stringify({ versionId: "v1", createdAt: "2026-01-01T00:00:00.000Z", files: ["reference.png"] }));
    await writeFile(
      path.join(targetDir, "order.json"),
      JSON.stringify({
        schemaVersion: "repochan.asset-order.v1", orderId: "ord-target", requestType: "new_asset", status: "approved",
        candidateVersions: [], assetType: "poster", priority: "normal",
        references: [{ type: "order", orderId: "ord-source", role: "character" }],
        brief: { intent: "target", mustInclude: [], avoid: [], creativeFreedom: [] }, deliverables: [], acceptanceCriteria: [],
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      "utf8",
    );

    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value) => output.push(String(value)));

    await runOrderResolveReferences(projectRoot, "ord-target", { json: true });

    expect(JSON.parse(output.join("\n"))).toEqual([
      {
        role: "character",
        orderId: "ord-source",
        versionId: "v1",
        files: [path.join(versionDir, "reference.png")],
      },
    ]);
  });
});

describe("order creation and recovery CLI", () => {
  it("exposes only read-only protocol subcommands", async () => {
    expect(PROTOCOL_SUBCOMMANDS).toEqual(["inspect", "read"]);
  });

  it("rejects unknown fields in write payloads instead of silently dropping them", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "repochan-order-unknown-"));
    tempDirs.push(projectRoot);
    const payload = path.join(projectRoot, "revision.json");
    await writeFile(payload, JSON.stringify({ revisionRequest: "redo", removedFlag: true }));
    await expect(runOrderAddRevision(projectRoot, "ord-unknown-field", payload, undefined, {}))
      .rejects.toThrow(/additional properties/);
  });

  it("rejects a delivered birth state without writing an order", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "repochan-order-create-"));
    tempDirs.push(projectRoot);
    await initProtocol(projectRoot);
    const protocolRoot = path.join(projectRoot, ".repochan");
    await writeFile(path.join(protocolRoot, "analysis", "current.json"), JSON.stringify(canonicalAnalysis()));
    await writeFile(path.join(protocolRoot, "persona", "current.json"), JSON.stringify(canonicalPersona()));
    const payload = path.join(projectRoot, "order.json");
    await writeFile(payload, JSON.stringify({
      order: {
        orderId: "ord-cli-born-delivered", requestType: "new_asset", assetType: "icon",
        brief: { intent: "icon", mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [], status: "delivered",
      },
    }));

    await expect(runOrderCreate(projectRoot, payload, { json: true })).rejects.toThrow(/order\.create/);
    await expect(import("node:fs/promises").then(({ stat }) => stat(path.join(protocolRoot, "orders", "ord-cli-born-delivered"))))
      .rejects.toThrow();
  });

  it("exposes recovery list through the CLI", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "repochan-order-recovery-"));
    tempDirs.push(projectRoot);
    await initProtocol(projectRoot);
    await mkdir(path.join(projectRoot, ".repochan", "orders", "ord-cli-recovery"), { recursive: true });
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value) => output.push(String(value)));

    await runOrderRecoveryList(projectRoot, "ord-cli-recovery", { json: true });
    expect(JSON.parse(output.join("\n"))).toEqual({ orderId: "ord-cli-recovery", recoveries: [] });
  });

  it("blocks recovery during an active prepared publish, then recovers it after the owner is stale", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "repochan-order-prepared-"));
    tempDirs.push(projectRoot);
    await initProtocol(projectRoot);
    const orderId = "ord-cli-prepared";
    const transactionId = ".result-txn-active";
    const orderDir = path.join(projectRoot, ".repochan", "orders", orderId);
    const transactionRoot = path.join(orderDir, transactionId);
    await mkdir(transactionRoot, { recursive: true });
    const orderBytes = Buffer.from(JSON.stringify({
      schemaVersion: "repochan.asset-order.v1", orderId, requestType: "new_asset", status: "draft",
      candidateVersions: [], assetType: "icon", priority: "normal", references: [],
      brief: { intent: "recover", mustInclude: [], avoid: [], creativeFreedom: [] }, deliverables: [], acceptanceCriteria: [],
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    await writeFile(path.join(orderDir, "order.json"), orderBytes);
    const nonce = "cli-prepared-nonce";
    const identities = path.join(orderDir, ".transactions");
    await mkdir(identities);
    await writeFile(path.join(identities, `${transactionId}.json`), JSON.stringify({
      schemaVersion: "repochan.order-transaction-identity.v1", transactionId, orderId,
      kind: "result_publish", nonce, versionId: "v1",
    }));
    await writeFile(path.join(transactionRoot, "recovery.json"), JSON.stringify({
      schemaVersion: "repochan.order-recovery.v1", transactionId, orderId,
      kind: "result_publish", nonce, versionId: "v1", state: "prepared", entries: [
        {
          destination: "order.json", backup: "previous-order.json", kind: "file", existedBefore: true,
          beforeSha256: createHash("sha256").update(orderBytes).digest("hex"),
        },
        { destination: "versions/v1", backup: "previous-version", kind: "directory", existedBefore: false },
      ],
    }));
    const lockDir = path.join(projectRoot, ".repochan", ".locks", "orders", orderId, "mutation.lock");
    await mkdir(lockDir, { recursive: true });
    await writeFile(path.join(lockDir, "owner.json"), JSON.stringify({
      schemaVersion: "repochan.order-mutation-lock.v1", pid: process.pid,
      hostname: os.hostname(), operation: "active publish", startedAt: new Date().toISOString(),
    }));

    await expect(runOrderRecoveryRecover(projectRoot, orderId, transactionId, { json: true }))
      .rejects.toThrow(/mutation conflict.*active publish/);
    await expect(runOrderRecoveryAbort(projectRoot, orderId, transactionId, { json: true }))
      .rejects.toThrow(/mutation conflict.*active publish/);
    expect(await import("node:fs/promises").then(({ stat }) => stat(transactionRoot))).toBeTruthy();

    await writeFile(path.join(lockDir, "owner.json"), JSON.stringify({
      schemaVersion: "repochan.order-mutation-lock.v1", pid: 99_999_999,
      hostname: os.hostname(), operation: "crashed publish", startedAt: new Date(0).toISOString(),
    }));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(runOrderRecoveryRecover(projectRoot, orderId, transactionId, { json: true }))
      .resolves.toBeUndefined();
    await expect(import("node:fs/promises").then(({ stat }) => stat(transactionRoot))).rejects.toThrow();
  });
});

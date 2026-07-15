import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrderResult, createOrders, initProtocol, readOrder, setOrderStatus } from "@repochan/core";
import {
  runOrderCreate,
  runOrderRecoveryAbort,
  runOrderRecoveryList,
  runOrderRecoveryRecover,
  runOrderResolveReferences,
  runOrderSlice,
} from "./order.js";
import { runProtocolWrite } from "./entities.js";

const tempDirs: string[] = [];

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
      JSON.stringify({ orderId: "ord-source", currentVersion: "v1" }),
      "utf8",
    );
    await writeFile(path.join(versionDir, "reference.png"), "fake png", "utf8");
    await writeFile(
      path.join(targetDir, "order.json"),
      JSON.stringify({
        orderId: "ord-target",
        references: [{ orderId: "ord-source", role: "character" }],
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
  it("blocks protocol write from bypassing Core-managed order state", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "repochan-protocol-order-write-"));
    tempDirs.push(projectRoot);
    await initProtocol(projectRoot);
    const payload = path.join(projectRoot, "payload.json");
    await writeFile(payload, JSON.stringify({ forged: true }));

    await expect(runProtocolWrite(projectRoot, "orders/ord-managed/order.json", payload, { overwrite: true }))
      .rejects.toThrow(/cannot modify Core-managed order state/);
    await expect(runProtocolWrite(projectRoot, "orders/ord-managed/versions/v1/meta.json", payload, { overwrite: true }))
      .rejects.toThrow(/cannot modify Core-managed order state/);
  });

  it("routes slice metadata through Core and keeps stored and embedded mirrors identical", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "repochan-order-slice-core-"));
    tempDirs.push(projectRoot);
    await initProtocol(projectRoot);
    const protocolRoot = path.join(projectRoot, ".repochan");
    await writeFile(path.join(protocolRoot, "analysis", "current.json"), JSON.stringify({ summary: "test" }));
    await writeFile(path.join(protocolRoot, "persona", "current.json"), JSON.stringify({ name: "test" }));
    await createOrders(projectRoot, { order: {
      orderId: "ord-cli-slice", requestType: "new_asset", assetType: "sticker_grid",
      brief: { intent: "slice", mustInclude: [], avoid: [], creativeFreedom: [] },
      deliverables: [], acceptanceCriteria: [],
    } });
    await setOrderStatus(projectRoot, "ord-cli-slice", "approved");
    const source = path.join(projectRoot, "grid.png");
    await writeFile(source, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1pNAAAAAElFTkSuQmCC", "base64"));
    await createOrderResult(projectRoot, {
      orderId: "ord-cli-slice", versionId: "v1", files: [source], tool: "manual-upload",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runOrderSlice(projectRoot, "ord-cli-slice", { rows: 1, cols: 1, version: "v1", json: true });
    const stored = JSON.parse(await readFile(path.join(protocolRoot, "orders/ord-cli-slice/versions/v1/meta.json"), "utf8"));
    const embedded = (await readOrder(projectRoot, "ord-cli-slice")).orderAsset.versions[0];
    expect(stored.tiles).toMatchObject({ rows: 1, cols: 1 });
    expect(embedded).toEqual(stored);
  });

  it("rejects a delivered birth state without writing an order", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "repochan-order-create-"));
    tempDirs.push(projectRoot);
    await initProtocol(projectRoot);
    const protocolRoot = path.join(projectRoot, ".repochan");
    await writeFile(path.join(protocolRoot, "analysis", "current.json"), JSON.stringify({ summary: "test" }));
    await writeFile(path.join(protocolRoot, "persona", "current.json"), JSON.stringify({ name: "test" }));
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
    const orderBytes = Buffer.from(JSON.stringify({ orderId, status: "draft" }));
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
    const lockDir = path.join(orderDir, ".order-mutation.lock");
    await mkdir(lockDir);
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

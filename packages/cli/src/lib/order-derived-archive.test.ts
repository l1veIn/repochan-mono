import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendOrderDerivedEntry, initProtocol, readOrderDerived } from "@repochan/core";
import { archiveOrderDerivedRun } from "./order-derived-archive.js";

vi.mock("@repochan/core", async () => import("../../../core/src/index.js"));
const temporaryDirectories: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("derived archive recovery ordering", () => {
  it("rejects a dangling archive when a new rollback snapshot is left between copy and append", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-derived-copy-race-"));
    temporaryDirectories.push(root);
    const orderId = "ord-derived-copy-race";
    const protocolRoot = path.join(root, ".repochan");
    const orderRoot = path.join(protocolRoot, "orders", orderId);
    const site = path.join(root, "site");
    const out = "hero.webp";
    await fs.mkdir(site);
    await fs.writeFile(path.join(site, out), "old derived bytes");
    const input = {
      cwd: root, orderId, slot: "hero", starter: "tiny", resultVersion: "v1", archiveLabel: "hero",
      steps: [{ op: "compress" as const, out, copies: [{ sourceBase: site, out }] }],
    };
    const previousArchive = await archiveOrderDerivedRun(input);
    const previousIndex = await readOrderDerived(root, orderId);
    await fs.writeFile(path.join(site, out), "new derived bytes");
    const copy = fs.copyFile;
    let transactionRoot: string | undefined;
    vi.spyOn(fs, "copyFile").mockImplementation(async (source, destination, mode) => {
      if (String(source) === path.join(site, out)) {
        const transactionId = "txn-00000000-0000-4000-8000-000000000010";
        transactionRoot = path.join(protocolRoot, ".transactions", transactionId);
        await fs.mkdir(path.join(transactionRoot, "backups"), { recursive: true });
        await fs.cp(orderRoot, path.join(transactionRoot, "backups/0"), { recursive: true });
        const intent = {
          schemaVersion: "repochan.protocol-transaction.v1", transactionId,
          owner: { pid: 999999999, hostname: os.hostname(), nonce: "copy-race-test", startedAt: new Date().toISOString() },
          targets: [`orders/${orderId}`],
        };
        await fs.writeFile(path.join(transactionRoot, "intent.json"), JSON.stringify(intent));
        await fs.writeFile(path.join(transactionRoot, "manifest.json"), JSON.stringify({ ...intent, state: "prepared", snapshots: [
          { target: intent.targets[0], existed: true, backup: "backups/0" },
        ] }));
      }
      await copy(source, destination, mode);
    });

    await expect(archiveOrderDerivedRun(input)).rejects.toThrow(/derived|archive|artifact/i);
    expect(transactionRoot).toBeDefined();
    expect(await readOrderDerived(root, orderId)).toEqual(previousIndex);
    expect(await fs.readFile(path.join(orderRoot, previousArchive, out), "utf8")).toBe("old derived bytes");
    await expect(fs.stat(transactionRoot!)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses a symlinked derived directory before writing outside the protocol", async (context) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-derived-symlink-"));
    temporaryDirectories.push(root);
    const orderId = "ord-derived-symlink";
    const orderRoot = path.join(root, ".repochan", "orders", orderId);
    const outside = path.join(root, "outside");
    const site = path.join(root, "site");
    const out = "hero.webp";
    await fs.mkdir(orderRoot, { recursive: true });
    await fs.mkdir(outside);
    await fs.mkdir(site);
    await fs.writeFile(path.join(site, out), "new derived bytes");
    try { await fs.symlink(outside, path.join(orderRoot, "derived"), process.platform === "win32" ? "junction" : "dir"); }
    catch (error) {
      if (process.platform === "win32" && ["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        context.skip();
        return;
      }
      throw error;
    }
    await expect(archiveOrderDerivedRun({
      cwd: root, orderId, slot: "hero", starter: "tiny", resultVersion: "v1", archiveLabel: "hero",
      steps: [{ op: "compress", out, copies: [{ sourceBase: site, out }] }],
    })).rejects.toThrow(/symlink/i);
    expect(await fs.readdir(outside)).toEqual([]);
    expect(await readOrderDerived(root, orderId)).toBeUndefined();
  });

  it("keeps both audit copies when the same slot is applied twice in one millisecond", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-derived-collision-"));
    temporaryDirectories.push(root);
    const orderId = "ord-derived-collision";
    const site = path.join(root, "site");
    const out = "public/assets/hero.webp";
    await fs.mkdir(path.dirname(path.join(site, out)), { recursive: true });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const input = {
      cwd: root, orderId, slot: "hero", starter: "tiny", resultVersion: "v1", archiveLabel: "hero",
      steps: [{ op: "compress" as const, out, copies: [{ sourceBase: site, out }] }],
    };
    await fs.writeFile(path.join(site, out), "first derived bytes");
    const first = await archiveOrderDerivedRun(input);
    await fs.writeFile(path.join(site, out), "second derived bytes");
    const second = await archiveOrderDerivedRun(input);
    expect(second).not.toBe(first);
    const orderRoot = path.join(root, ".repochan", "orders", orderId);
    expect(await fs.readFile(path.join(orderRoot, first, out), "utf8")).toBe("first derived bytes");
    expect(await fs.readFile(path.join(orderRoot, second, out), "utf8")).toBe("second derived bytes");
    expect((await readOrderDerived(root, orderId))!.entries.map((entry) => entry.archiveDir)).toEqual([first, second]);
  });

  it("recovers generic rollback snapshots before copying a new audit archive", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-derived-recovery-"));
    temporaryDirectories.push(root);
    const orderId = "ord-derived-recovery";
    const protocolRoot = path.join(root, ".repochan");
    const orderRoot = path.join(protocolRoot, "orders", orderId);
    await appendOrderDerivedEntry(root, orderId, {
      slot: "before", starter: "tiny", resultVersion: "v1", appliedAt: "2026-01-01T00:00:00.000Z",
      archiveDir: "derived/before", steps: [],
    });
    const transactionId = "txn-00000000-0000-4000-8000-000000000009";
    const transactionRoot = path.join(protocolRoot, ".transactions", transactionId);
    await fs.mkdir(path.join(transactionRoot, "backups"), { recursive: true });
    await fs.cp(orderRoot, path.join(transactionRoot, "backups/0"), { recursive: true });
    const intent = {
      schemaVersion: "repochan.protocol-transaction.v1", transactionId,
      owner: { pid: 999999999, hostname: os.hostname(), nonce: "derived-test", startedAt: new Date().toISOString() },
      targets: [`orders/${orderId}`],
    };
    await fs.writeFile(path.join(transactionRoot, "intent.json"), JSON.stringify(intent));
    await fs.writeFile(path.join(transactionRoot, "manifest.json"), JSON.stringify({ ...intent, state: "prepared", snapshots: [
      { target: intent.targets[0], existed: true, backup: "backups/0" },
    ] }));
    const site = path.join(root, "site");
    const out = "public/assets/hero.webp";
    await fs.mkdir(path.dirname(path.join(site, out)), { recursive: true });
    await fs.writeFile(path.join(site, out), "new derived bytes");

    const archiveDir = await archiveOrderDerivedRun({
      cwd: root, orderId, slot: "hero", starter: "tiny", resultVersion: "v1", archiveLabel: "hero",
      steps: [{ op: "compress", out, copies: [{ sourceBase: site, out }] }],
    });
    await initProtocol(root);
    expect(await fs.readFile(path.join(orderRoot, archiveDir, out), "utf8")).toBe("new derived bytes");
    const index = await readOrderDerived(root, orderId);
    expect(index!.entries.map((entry) => entry.slot)).toEqual(["before", "hero"]);
    expect(index!.entries[1].steps[0].artifacts[0].stored).toBe(`${archiveDir}/${out}`);
    await expect(fs.stat(transactionRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

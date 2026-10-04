import { mkdtemp, rm } from "node:fs/promises";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendOrderDerivedEntry, readOrderDerived, type OrderDerivedEntry } from "./index.js";
import { OrderDerivedIndexSchema } from "../schemas/index.js";
import { validateInput } from "../validate.js";
import { initProtocol } from "../protocol/index.js";
import { symlinkDir } from "../../test-support/symlink.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function sampleEntry(overrides: Partial<OrderDerivedEntry> = {}): OrderDerivedEntry {
  const archiveDir = overrides.archiveDir ?? "derived/2026-07-21T08-01-00-000Z--icon";
  return {
    slot: "icon",
    starter: "landing-neobrutal-zine",
    resultVersion: "v2026-07-21T08-00-00-000Z",
    appliedAt: "2026-07-21T08:01:00.000Z",
    archiveDir,
    steps: [
      {
        op: "compress",
        args: { format: "webp", quality: 90, maxWidth: 512 },
        out: "public/assets/icon.webp",
        keep: true,
        artifacts: [{ out: "public/assets/icon.webp", stored: `${archiveDir}/public/assets/icon.webp` }],
      },
      { op: "favicon", args: { sizes: [16, 32, 48] }, out: "public/favicon.ico", keep: false, artifacts: [] },
    ],
    ...overrides,
  };
}

async function materializeEntry(root: string, orderId: string, entry = sampleEntry()): Promise<void> {
  for (const step of entry.steps) {
    for (const artifact of step.artifacts) {
      const file = path.join(root, ".repochan", "orders", orderId, artifact.stored);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, "archived artifact bytes");
    }
  }
}

describe("order derived archive", () => {
  it("creates derived.json on first append and round-trips the entry", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-derived-"));
    tempDirs.push(root);
    expect(await readOrderDerived(root, "ord-icon-001")).toBeUndefined();

    await materializeEntry(root, "ord-icon-001");
    const index = await appendOrderDerivedEntry(root, "ord-icon-001", sampleEntry());
    expect(index.schemaVersion).toBe("repochan.order-derived.v1");
    expect(index.orderId).toBe("ord-icon-001");
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0].steps[1]).toMatchObject({ op: "favicon", keep: false, artifacts: [] });

    const stored = await readOrderDerived(root, "ord-icon-001");
    expect(stored).toEqual(index);
  });

  it("is append-only: re-applying the same slot+version adds another entry", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-derived-"));
    tempDirs.push(root);
    await materializeEntry(root, "ord-icon-001");
    await appendOrderDerivedEntry(root, "ord-icon-001", sampleEntry());
    const second = sampleEntry({
      appliedAt: "2026-07-21T09:02:00.000Z",
      archiveDir: "derived/2026-07-21T09-02-00-000Z--icon",
    });
    await materializeEntry(root, "ord-icon-001", second);
    const index = await appendOrderDerivedEntry(root, "ord-icon-001", second);
    expect(index.entries).toHaveLength(2);
    expect(index.entries[0].archiveDir).toBe("derived/2026-07-21T08-01-00-000Z--icon");
    expect(index.entries[1].archiveDir).toBe("derived/2026-07-21T09-02-00-000Z--icon");
  });

  it("rejects a concurrent append before reading stale history and preserves the retry", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-derived-"));
    tempDirs.push(root);
    await materializeEntry(root, "ord-icon-001");
    await appendOrderDerivedEntry(root, "ord-icon-001", sampleEntry());
    const file = path.join(root, ".repochan/orders/ord-icon-001/derived.json");
    const originalRead = fs.readFile.bind(fs);
    let started!: () => void;
    let resume!: () => void;
    const readStarted = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    let paused = false;
    vi.spyOn(fs, "readFile").mockImplementation(async (target, options) => {
      const bytes = await originalRead(target, options as never);
      if (!paused && String(target) === file) {
        paused = true;
        started();
        await gate;
      }
      return bytes;
    });
    const first = appendOrderDerivedEntry(root, "ord-icon-001", sampleEntry({ slot: "hero" }));
    await readStarted;
    try {
      await expect(appendOrderDerivedEntry(root, "ord-icon-001", sampleEntry({ slot: "background" }))).rejects.toThrow(/mutation conflict/);
    } finally {
      resume();
    }
    await first;
    vi.restoreAllMocks();
    const retried = await appendOrderDerivedEntry(root, "ord-icon-001", sampleEntry({ slot: "background" }));
    expect(retried.entries.map((entry) => entry.slot)).toEqual(["icon", "hero", "background"]);
  });

  it("recovers a prepared generic order transaction before appending audit history", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-derived-recovery-"));
    tempDirs.push(root);
    const orderId = "ord-icon-001";
    await materializeEntry(root, orderId);
    const before = await appendOrderDerivedEntry(root, orderId, sampleEntry());
    const order = path.join(root, ".repochan", "orders", orderId);
    const transactionId = "txn-00000000-0000-4000-8000-000000000009";
    const transaction = path.join(root, ".repochan", ".transactions", transactionId);
    await fs.mkdir(path.join(transaction, "backups"), { recursive: true });
    await fs.cp(order, path.join(transaction, "backups", "0"), { recursive: true });
    const intent = {
      schemaVersion: "repochan.protocol-transaction.v1",
      transactionId,
      owner: { pid: 999_999_999, hostname: os.hostname(), nonce: "pending-derived", startedAt: new Date().toISOString() },
      targets: [`orders/${orderId}`],
    };
    await fs.writeFile(path.join(transaction, "intent.json"), JSON.stringify(intent));
    await fs.writeFile(path.join(transaction, "manifest.json"), JSON.stringify({
      ...intent, state: "prepared", snapshots: [{ target: intent.targets[0], existed: true, backup: "backups/0" }],
    }));
    // This write belongs to the interrupted mutation and must be rolled back.
    await fs.writeFile(path.join(order, "derived.json"), JSON.stringify({
      ...before, entries: [...before.entries, sampleEntry({ slot: "uncommitted" })],
    }));

    const appended = await appendOrderDerivedEntry(root, orderId, sampleEntry({ slot: "hero" }));
    expect(appended.entries.map(({ slot }) => slot)).toEqual(["icon", "hero"]);
    await expect(fs.stat(transaction)).rejects.toMatchObject({ code: "ENOENT" });
    await initProtocol(root);
    expect(await readOrderDerived(root, orderId)).toEqual(appended);
  });

  it("rejects a generic recovery journal left after initialization but before acquiring the order lock", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-derived-lock-recovery-"));
    tempDirs.push(root);
    const orderId = "ord-icon-001";
    await materializeEntry(root, orderId);
    const before = await appendOrderDerivedEntry(root, orderId, sampleEntry());
    const lockRoot = path.join(root, ".repochan", ".locks", "orders", orderId);
    const order = path.join(root, ".repochan", "orders", orderId);
    const transactionId = "txn-00000000-0000-4000-8000-00000000000a";
    const transaction = path.join(root, ".repochan", ".transactions", transactionId);
    const mkdir = fs.mkdir.bind(fs);
    let inserted = false;
    vi.spyOn(fs, "mkdir").mockImplementation(async (target, options) => {
      const result = await mkdir(target, options as never);
      if (!inserted && String(target) === lockRoot) {
        inserted = true;
        await mkdir(path.join(transaction, "backups"), { recursive: true });
        await fs.cp(order, path.join(transaction, "backups", "0"), { recursive: true });
        const intent = {
          schemaVersion: "repochan.protocol-transaction.v1", transactionId,
          owner: { pid: 999_999_999, hostname: os.hostname(), nonce: "late-derived", startedAt: new Date().toISOString() },
          targets: [`orders/${orderId}`],
        };
        await fs.writeFile(path.join(transaction, "intent.json"), JSON.stringify(intent));
        await fs.writeFile(path.join(transaction, "manifest.json"), JSON.stringify({
          ...intent, state: "prepared", snapshots: [{ target: intent.targets[0], existed: true, backup: "backups/0" }],
        }));
      }
      return result;
    });

    await expect(appendOrderDerivedEntry(root, orderId, sampleEntry({ slot: "hero" })))
      .rejects.toThrow(/pending protocol transaction/);
    expect(inserted).toBe(true);
    expect(await readOrderDerived(root, orderId)).toEqual(before);
    vi.restoreAllMocks();
    const retried = await appendOrderDerivedEntry(root, orderId, sampleEntry({ slot: "hero" }));
    expect(retried.entries.map(({ slot }) => slot)).toEqual(["icon", "hero"]);
    await initProtocol(root);
    expect(await readOrderDerived(root, orderId)).toEqual(retried);
  });

  it("rejects a copy removed by generic recovery without changing recovered audit history", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-derived-copy-recovery-"));
    tempDirs.push(root);
    const orderId = "ord-icon-001";
    await materializeEntry(root, orderId);
    const before = await appendOrderDerivedEntry(root, orderId, sampleEntry());
    const order = path.join(root, ".repochan", "orders", orderId);
    const transactionId = "txn-00000000-0000-4000-8000-00000000000b";
    const transaction = path.join(root, ".repochan", ".transactions", transactionId);
    await fs.mkdir(path.join(transaction, "backups"), { recursive: true });
    await fs.cp(order, path.join(transaction, "backups", "0"), { recursive: true });
    const intent = {
      schemaVersion: "repochan.protocol-transaction.v1", transactionId,
      owner: { pid: 999_999_999, hostname: os.hostname(), nonce: "copied-derived", startedAt: new Date().toISOString() },
      targets: [`orders/${orderId}`],
    };
    await fs.writeFile(path.join(transaction, "intent.json"), JSON.stringify(intent));
    await fs.writeFile(path.join(transaction, "manifest.json"), JSON.stringify({
      ...intent, state: "prepared", snapshots: [{ target: intent.targets[0], existed: true, backup: "backups/0" }],
    }));
    const copied = sampleEntry({ slot: "hero", archiveDir: "derived/copied-after-snapshot--nonce" });
    await materializeEntry(root, orderId, copied);

    await expect(appendOrderDerivedEntry(root, orderId, copied)).rejects.toThrow(/Derived archive artifact/);
    expect(await readOrderDerived(root, orderId)).toEqual(before);
    expect(await fs.readFile(path.join(order, sampleEntry().steps[0].artifacts[0].stored), "utf8"))
      .toBe("archived artifact bytes");
    await expect(fs.stat(path.join(order, copied.steps[0].artifacts[0].stored))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(transaction)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["missing", "empty", "directory", "unreadable", "symlink"])("rejects a %s archive artifact and preserves prior history", async (fault) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-derived-artifact-"));
    tempDirs.push(root);
    const orderId = "ord-icon-001";
    await materializeEntry(root, orderId);
    const before = await appendOrderDerivedEntry(root, orderId, sampleEntry());
    const entry = sampleEntry({ archiveDir: "derived/new-run--nonce" });
    const file = path.join(root, ".repochan", "orders", orderId, entry.steps[0].artifacts[0].stored);
    await materializeEntry(root, orderId, entry);
    if (fault === "missing" || fault === "directory") await fs.unlink(file);
    if (fault === "empty") await fs.writeFile(file, "");
    if (fault === "directory") await fs.mkdir(file);
    if (fault === "unreadable") {
      const open = fs.open.bind(fs);
      vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
        if (String(target) === file) throw Object.assign(new Error("permission denied"), { code: "EACCES" });
        return open(target, flags, mode);
      });
    }
    if (fault === "symlink") {
      const outside = path.join(root, "outside");
      await fs.mkdir(outside);
      await fs.writeFile(path.join(outside, "icon.webp"), "non-empty external file");
      await fs.rm(path.dirname(file), { recursive: true });
      await symlinkDir(outside, path.dirname(file));
    }

    await expect(appendOrderDerivedEntry(root, orderId, entry)).rejects.toThrow(/Derived archive artifact/);
    expect(await readOrderDerived(root, orderId)).toEqual(before);
  });

  it.each([
    "versions/v1/source.webp",
    "derived/other-run/file.webp",
    "derived/new-run--nonce/../other-run/file.webp",
    "derived/new-run--nonce/..\\outside.webp",
    "/tmp/source.webp",
  ])("rejects stored path %s outside the run instead of accepting non-empty source bytes", async (stored) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-derived-path-"));
    tempDirs.push(root);
    const entry = sampleEntry({ archiveDir: "derived/new-run--nonce" });
    const artifact = entry.steps[0].artifacts[0];
    await materializeEntry(root, "ord-icon-001", entry);
    const source = path.join(root, ".repochan/orders/ord-icon-001/versions/v1/source.webp");
    await fs.mkdir(path.dirname(source), { recursive: true });
    await fs.writeFile(source, "non-empty source bytes");
    artifact.stored = stored;
    await expect(appendOrderDerivedEntry(root, "ord-icon-001", entry)).rejects.toThrow(/archive/);
    expect(await readOrderDerived(root, "ord-icon-001")).toBeUndefined();
    expect(await fs.readFile(source, "utf8")).toBe("non-empty source bytes");
  });

  it("rejects archiveDir traversal before writing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-derived-dir-"));
    tempDirs.push(root);
    const entry = sampleEntry({ archiveDir: "derived/../versions/v1" });
    await expect(appendOrderDerivedEntry(root, "ord-icon-001", entry)).rejects.toThrow(/Unsafe derived archive path/);
    expect(await readOrderDerived(root, "ord-icon-001")).toBeUndefined();
  });

  it("rejects an invalid entry before writing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-derived-"));
    tempDirs.push(root);
    const bad = sampleEntry({ archiveDir: "versions/nope" });
    await expect(appendOrderDerivedEntry(root, "ord-icon-001", bad)).rejects.toThrow(/order\.derived/);
    expect(await readOrderDerived(root, "ord-icon-001")).toBeUndefined();
  });

  it("validates the derived index shape", () => {
    const valid = {
      schemaVersion: "repochan.order-derived.v1",
      orderId: "ord-icon-001",
      entries: [sampleEntry()],
    };
    expect(() => validateInput("order.derived", OrderDerivedIndexSchema, valid)).not.toThrow();

    const cases: Array<[string, unknown]> = [
      ["wrong schemaVersion", { ...valid, schemaVersion: "repochan.order-derived.v2" }],
      ["unknown top-level field", { ...valid, extra: true }],
      ["entry without archiveDir", { ...valid, entries: [{ ...sampleEntry(), archiveDir: undefined }] }],
      ["step with unknown op", { ...valid, entries: [sampleEntry({ steps: [{ op: "magic", out: "public/x.png", artifacts: [] }] })] }],
      ["step with non-boolean keep", { ...valid, entries: [sampleEntry({ steps: [{ op: "compress", out: "public/x.png", keep: "yes", artifacts: [] }] })] }],
      ["artifact without stored", { ...valid, entries: [sampleEntry({ steps: [{ op: "compress", out: "public/x.png", artifacts: [{ out: "public/x.png" }] }] })] }],
    ];
    for (const [label, value] of cases) {
      expect(() => validateInput("order.derived", OrderDerivedIndexSchema, value), label).toThrow(/order\.derived/);
    }
  });
});

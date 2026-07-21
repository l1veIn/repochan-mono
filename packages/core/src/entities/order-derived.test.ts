import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendOrderDerivedEntry, readOrderDerived, type OrderDerivedEntry } from "./index.js";
import { OrderDerivedIndexSchema } from "../schemas/index.js";
import { validateInput } from "../validate.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function sampleEntry(overrides: Partial<OrderDerivedEntry> = {}): OrderDerivedEntry {
  return {
    slot: "icon",
    starter: "landing-neobrutal-zine",
    resultVersion: "v2026-07-21T08-00-00-000Z",
    appliedAt: "2026-07-21T08:01:00.000Z",
    archiveDir: "derived/2026-07-21T08-01-00-000Z--icon",
    steps: [
      {
        op: "compress",
        args: { format: "webp", quality: 90, maxWidth: 512 },
        out: "public/assets/icon.webp",
        keep: true,
        artifacts: [{ out: "public/assets/icon.webp", stored: "derived/2026-07-21T08-01-00-000Z--icon/public/assets/icon.webp" }],
      },
      { op: "favicon", args: { sizes: [16, 32, 48] }, out: "public/favicon.ico", keep: false, artifacts: [] },
    ],
    ...overrides,
  };
}

describe("order derived archive", () => {
  it("creates derived.json on first append and round-trips the entry", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-derived-"));
    tempDirs.push(root);
    expect(await readOrderDerived(root, "ord-icon-001")).toBeUndefined();

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
    await appendOrderDerivedEntry(root, "ord-icon-001", sampleEntry());
    const second = sampleEntry({
      appliedAt: "2026-07-21T09:02:00.000Z",
      archiveDir: "derived/2026-07-21T09-02-00-000Z--icon",
    });
    const index = await appendOrderDerivedEntry(root, "ord-icon-001", second);
    expect(index.entries).toHaveLength(2);
    expect(index.entries[0].archiveDir).toBe("derived/2026-07-21T08-01-00-000Z--icon");
    expect(index.entries[1].archiveDir).toBe("derived/2026-07-21T09-02-00-000Z--icon");
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

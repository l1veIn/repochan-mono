import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrders, initProtocol } from "@repochan/core";
import { extractAssets, ExtractError, inspectImage, type ExtractQaReport } from "@repochan/image-edit";
import {
  runOrderCreate,
  runOrderAddRevision,
  runOrderExtract,
  runOrderRecoveryAbort,
  runOrderRecoveryList,
  runOrderRecoveryRecover,
  runOrderResolveReferences,
} from "./order.js";
import { PROTOCOL_SUBCOMMANDS } from "./entities.js";

vi.mock("@repochan/image-edit", async (importOriginal) => ({
  ...await importOriginal<typeof import("@repochan/image-edit")>(),
  extractAssets: vi.fn(),
  inspectImage: vi.fn(async () => ({ format: "png", width: 64, height: 64 })),
}));

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

// ---------------------------------------------------------------------------
// order extract — manual cutout extraction archived into the order's derived/
// ---------------------------------------------------------------------------

function extractQa(): ExtractQaReport {
  return {
    ok: true,
    defects: [],
    matte: {
      matte: [0, 255, 0],
      source: "auto-sampled",
      score: 0,
      minSubjectDistance: 300,
      clearsEraseRadius: true,
      eraseRadius: 28,
      candidateScores: [],
    },
    strategyUsed: "chroma-grid",
    pipeline: "v2",
  };
}

async function orderExtractFixture(overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "repochan-order-extract-"));
  tempDirs.push(root);
  const orderDir = path.join(root, ".repochan", "orders", "ord-extract-001");
  const versionDir = path.join(orderDir, "versions", "v1");
  await mkdir(versionDir, { recursive: true });
  await writeFile(path.join(orderDir, "order.json"), JSON.stringify({
    schemaVersion: "repochan.asset-order.v1",
    orderId: "ord-extract-001",
    requestType: "new_asset",
    status: "delivered",
    currentVersion: "v1",
    candidateVersions: [],
    assetType: "sticker_sheet",
    priority: "normal",
    references: [],
    brief: { intent: "test", mustInclude: [], avoid: [], creativeFreedom: [] },
    deliverables: [],
    acceptanceCriteria: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }));
  await writeFile(path.join(versionDir, "sheet.png"), "fake sheet");
  await writeFile(path.join(versionDir, "meta.json"), JSON.stringify({
    versionId: "v1", createdAt: "2026-01-01T00:00:00.000Z", files: ["sheet.png"],
  }));
  return { root, orderDir, versionDir };
}

async function writeGridTemplate(root: string) {
  await mkdir(path.join(root, ".repochan", "templates"), { recursive: true });
  await writeFile(path.join(root, ".repochan", "templates", "test-grid.yaml"), [
    'id: "test/extract-grid"',
    'asset_type: "sticker_sheet"',
    'label: "Test Extract Grid"',
    'size: "64x64"',
    "grid:",
    "  rows: 2",
    "  cols: 2",
    "  sliceable: true",
    "  cell_keys:",
    '    - "alpha"',
    '    - "bravo"',
    '    - "charlie"',
    '    - "delta"',
    "prompt_template: |",
    "  test prompt",
    "constraints:",
    '  - "test constraint"',
    "",
  ].join("\n"));
}

function mockExtraction() {
  vi.mocked(extractAssets).mockImplementation(async (source, outDir, options) => {
    await mkdir(outDir, { recursive: true });
    const keys = options.mapping as string[];
    const items = keys.map((key, index) => ({
      key, index, file: `${key}.png`, path: path.join(outDir, `${key}.png`),
      geometry: { cell: { row: 0, col: index, x: index * 10, y: 0, w: 10, h: 10 }, foreground: { x: 1, y: 1, w: 8, h: 8 }, normalized: { x: 2, y: 2, w: 60, h: 60, canvasWidth: 64, canvasHeight: 64, padding: 0 } },
      qa: { foregroundPixels: 64, foregroundRatio: 0.64, edgeTouchPixels: 0, edgeTouchRatio: 0, alphaThreshold: 16 },
    }));
    for (const item of items) await writeFile(item.path, item.key);
    return {
      sourceFile: String(source), rows: options.rows, cols: options.cols,
      matteColor: [0, 255, 0], matteColorSource: "auto-sampled",
      items, qa: extractQa(),
    } as never;
  });
}

describe("order extract", () => {
  it("defaults rows/cols and mapping from the order template grid and archives into derived/", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, orderDir } = await orderExtractFixture({ templateId: "test/extract-grid" });
    await writeGridTemplate(root);
    mockExtraction();

    await runOrderExtract(root, "ord-extract-001", { json: true });

    const call = vi.mocked(extractAssets).mock.calls[0];
    expect(call[0]).toBe(path.join(orderDir, "versions", "v1", "sheet.png"));
    expect(call[2]).toMatchObject({
      strategy: "chroma-grid",
      rows: 2,
      cols: 2,
      mapping: ["alpha", "bravo", "charlie", "delta"],
      chroma: { pipeline: "v2" },
      normalize: { canvasSize: 32, padding: 0 },
    });

    const derived = JSON.parse(await readFile(path.join(orderDir, "derived.json"), "utf8"));
    expect(derived.schemaVersion).toBe("repochan.order-derived.v1");
    expect(derived.orderId).toBe("ord-extract-001");
    expect(derived.entries).toHaveLength(1);
    const entry = derived.entries[0];
    expect(entry.slot).toBe("manual");
    expect(entry.starter).toBe("image-edit");
    expect(entry.resultVersion).toBe("v1");
    expect(entry.archiveDir).toMatch(/^derived\/.+--extract$/);
    expect(entry.steps).toHaveLength(1);
    expect(entry.steps[0].op).toBe("extract-grid");
    expect(entry.steps[0].args).toMatchObject({
      strategy: "chroma-grid", pipeline: "v2", rows: 2, cols: 2, sourceVersion: "v1", source: "sheet.png",
    });
    expect(entry.steps[0].artifacts).toEqual(["alpha", "bravo", "charlie", "delta"].map((key) => ({
      out: `assets/${key}.png`,
      stored: `${entry.archiveDir}/assets/${key}.png`,
    })));
    expect(await readFile(path.join(orderDir, entry.archiveDir, "assets/alpha.png"), "utf8")).toBe("alpha");
    // the immutable versions/ directory gained nothing
    expect(await readdir(path.join(orderDir, "versions"))).toEqual(["v1"]);

    const json = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(json).toMatchObject({
      orderId: "ord-extract-001",
      version: "v1",
      strategy: "chroma-grid",
      pipeline: "v2",
      rows: 2,
      cols: 2,
      items: 4,
      itemKeys: ["alpha", "bravo", "charlie", "delta"],
      derived: entry.archiveDir,
    });
    expect(json.qa.ok).toBe(true);
  });

  it("lets explicit --rows/--cols override the template grid and falls back to positional keys", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root } = await orderExtractFixture({ templateId: "test/extract-grid" });
    await writeGridTemplate(root);
    mockExtraction();

    await runOrderExtract(root, "ord-extract-001", { rows: 1, cols: 2, json: true });

    const options = vi.mocked(extractAssets).mock.calls[0][2];
    expect(options.rows).toBe(1);
    expect(options.cols).toBe(2);
    // cell_keys covers 2×2, not the overridden 1×2 grid → positional keys
    expect(options.mapping).toEqual(["s00", "s01"]);
  });

  it("requires --rows/--cols when the order has no template grid to default from", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root } = await orderExtractFixture();

    await expect(runOrderExtract(root, "ord-extract-001", {})).rejects.toThrow(/--rows and --cols are required/);
    expect(vi.mocked(extractAssets)).not.toHaveBeenCalled();
  });

  it("appends derived.json entries on repeat runs without rewriting history", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, orderDir } = await orderExtractFixture();
    mockExtraction();

    await runOrderExtract(root, "ord-extract-001", { rows: 2, cols: 2, json: true });
    await runOrderExtract(root, "ord-extract-001", { rows: 2, cols: 2, json: true });

    const derived = JSON.parse(await readFile(path.join(orderDir, "derived.json"), "utf8"));
    expect(derived.entries).toHaveLength(2);
    expect(derived.entries[1].archiveDir).toMatch(/^derived\/.+--extract$/);
    expect(await readdir(path.join(orderDir, "versions"))).toEqual(["v1"]);

    // a pre-existing asset-apply-style entry is preserved untouched
    const historicalEntry = {
      slot: "hero", starter: "minimal", resultVersion: "v1",
      appliedAt: "2026-01-01T00:00:00.000Z", archiveDir: "derived/2026-01-01T00-00-00-000Z--hero",
      steps: [{ op: "compress", out: "public/assets/hero.webp", artifacts: [] }],
    };
    derived.entries.unshift(historicalEntry);
    await writeFile(path.join(orderDir, "derived.json"), JSON.stringify(derived));
    await runOrderExtract(root, "ord-extract-001", { rows: 2, cols: 2, json: true });
    const after = JSON.parse(await readFile(path.join(orderDir, "derived.json"), "utf8"));
    expect(after.entries).toHaveLength(4);
    expect(after.entries[0]).toEqual(historicalEntry);
  });

  it("fails loud with ExtractError defects and archives nothing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, orderDir } = await orderExtractFixture();
    vi.mocked(extractAssets).mockRejectedValue(new ExtractError("extractAssets: QA failed", [
      { code: "empty_cell", index: 0, detail: "empty foreground" },
    ], extractQa()));

    await expect(runOrderExtract(root, "ord-extract-001", { rows: 2, cols: 2, json: true }))
      .rejects.toThrow(/QA failed/);
    await expect(readFile(path.join(orderDir, "derived.json"), "utf8")).rejects.toThrow();
    await expect(readdir(path.join(orderDir, "derived"))).rejects.toThrow();
    expect(await readdir(path.join(orderDir, "versions"))).toEqual(["v1"]);
  });

  it("rejects orders that are not delivered yet", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root } = await orderExtractFixture({ status: "approved" });

    await expect(runOrderExtract(root, "ord-extract-001", { rows: 2, cols: 2 }))
      .rejects.toThrow(/must be delivered/);
    expect(vi.mocked(extractAssets)).not.toHaveBeenCalled();
  });

  it("extracts a specific result version via --result-version", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, orderDir } = await orderExtractFixture();
    const v2Dir = path.join(orderDir, "versions", "v2");
    await mkdir(v2Dir, { recursive: true });
    await writeFile(path.join(v2Dir, "sheet-v2.png"), "fake sheet v2");
    await writeFile(path.join(v2Dir, "meta.json"), JSON.stringify({
      versionId: "v2", createdAt: "2026-01-02T00:00:00.000Z", files: ["sheet-v2.png"],
    }));
    mockExtraction();

    await runOrderExtract(root, "ord-extract-001", { resultVersion: "v2", rows: 2, cols: 2, json: true });

    expect(vi.mocked(extractAssets).mock.calls[0][0]).toBe(path.join(v2Dir, "sheet-v2.png"));
    const derived = JSON.parse(await readFile(path.join(orderDir, "derived.json"), "utf8"));
    expect(derived.entries[0].resultVersion).toBe("v2");
    expect(derived.entries[0].steps[0].args.sourceVersion).toBe("v2");
  });
});

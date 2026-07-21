import { mkdir, mkdtemp, readdir, readFile, rm, symlink as fsSymlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runStarterAssetApply,
  runStarterAssetImport,
  runStarterConfigure,
  runStarterCreateOrder,
  runStarterGet,
  runStarterList,
  runStarterPull,
  runStarterValidate,
} from "./starter.js";
import { getDefaultStarterId, getStarter, readStarterInstance } from "../lib/starter-loader.js";
import { ApplyFailurePrintedError } from "../lib/output.js";
import { chromaKeyImage, compressImage, extractAssets, ExtractError, type ExtractQaReport } from "@repochan/image-edit";

vi.mock("@repochan/image-edit", async (importOriginal) => ({
  ...await importOriginal<typeof import("@repochan/image-edit")>(),
  extractAssets: vi.fn(),
  compressImage: vi.fn(),
  chromaKeyImage: vi.fn(),
}));

function gridQa(strategyUsed: ExtractQaReport["strategyUsed"] = "chroma-grid", pipeline: "v1" | "v2" = "v2"): ExtractQaReport {
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
    strategyUsed,
    pipeline,
  };
}

const tempDirs: string[] = [];

function canonicalOrder(orderId: string, overrides: Record<string, unknown> = {}) {
  const timestamp = "2026-01-01T00:00:00.000Z";
  return {
    schemaVersion: "repochan.asset-order.v1",
    orderId,
    requestType: "new_asset",
    status: "delivered",
    currentVersion: "v1",
    candidateVersions: [],
    assetType: "test_asset",
    priority: "normal",
    references: [],
    brief: { intent: "test", mustInclude: [], avoid: [], creativeFreedom: [] },
    deliverables: [],
    acceptanceCriteria: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function projectFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "repochan-starter-"));
  tempDirs.push(root);
  await mkdir(path.join(root, ".repochan", "analysis"), { recursive: true });
  await mkdir(path.join(root, ".repochan", "persona"), { recursive: true });
  await writeFile(path.join(root, ".repochan", "analysis", "current.json"), JSON.stringify({
    schemaVersion: "repochan.analysis.v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    context: {
      basic: { project_name: "Fixture Project", repository_url: "https://example.test/fixture" },
      identity: { namingSeeds: { primary: ["fixture"], secondary: [], rationale: ["fixture"] } },
      file_structure: {}, inventory: {}, tech_stack: {}, pre_analysis: {}, git_profile: {},
      docs_narrative: {}, github_meta: {}, color_palette: {}, core_samples: {}, deterministic_tooling: {},
    },
    persona: null,
    error: null,
    preAnalysis: { summary: "Fixture summary" },
  }));
  await writeFile(path.join(root, ".repochan", "persona", "current.json"), JSON.stringify({
    name: "Fixture",
    rolePrompt: "fixture visual tags",
    mainColor: "#123456",
    secondaryColor: "#234567",
    accentColors: ["#345678", "#456789"],
    artStyle: "Precise",
    keyMotifs: ["node"],
    signaturePatterns: ["grid"],
    schemaVersion: "repochan.persona.v2",
    generatedAt: "2026-01-01T00:00:00.000Z",
    provenance: { tool: "test" },
  }));
  return root;
}

async function gridBundleFixture() {
  const root = await projectFixture();
  const siteDir = path.join(root, "site");
  await runStarterPull(root, { outputDir: siteDir, json: true });
  const manifestPath = path.join(siteDir, "repochan", "starter.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.assets = [{
    kind: "bundle",
    slot: "web-states",
    required: true,
    publications: [
      { key: "welcome", cell: 0, output: "public/assets/states/welcome.png" },
      { key: "empty", cell: 1, output: "public/assets/states/empty.png" },
    ],
    postprocess: [{ op: "extract-grid", out: ".repochan-grid/web-states", args: {
      rows: 1, cols: 2, normalize: { canvasSize: 64 },
    } }],
  }];
  await writeFile(manifestPath, JSON.stringify(manifest));
  const assetsPath = path.join(siteDir, "repochan", "assets.json");
  await writeFile(assetsPath, JSON.stringify({ schemaVersion: "repochan.starter-assets.v1", assets: {
    "web-states": { kind: "bundle", status: "source", items: {} },
  } }));
  const versionDir = path.join(root, ".repochan", "orders", "ord-grid-001", "versions", "v1");
  await mkdir(versionDir, { recursive: true });
  await writeFile(path.join(root, ".repochan", "orders", "ord-grid-001", "order.json"), JSON.stringify(
    canonicalOrder("ord-grid-001"),
  ));
  await writeFile(path.join(versionDir, "source.png"), "source");
  await writeFile(path.join(versionDir, "meta.json"), JSON.stringify({
    versionId: "v1", createdAt: "2026-01-01T00:00:00.000Z", files: ["source.png"],
  }));
  return { root, siteDir, assetsPath };
}

async function slotReferenceFixture() {
  const root = await projectFixture();
  const siteDir = path.join(root, "site");
  await runStarterPull(root, { outputDir: siteDir, json: true });
  const manifestPath = path.join(siteDir, "repochan", "starter.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.assets.push({
    kind: "scalar",
    slot: "scene-night",
    required: false,
    reference: "slot:hero-composite",
    output: "public/assets/scene-night.webp",
    order: {
      assetType: "scene",
      templateId: "official/hero-character-migrate",
      brief: { mustInclude: ["night mood"] },
    },
    postprocess: [{ op: "compress", out: "public/assets/scene-night.webp" }],
  });
  await writeFile(manifestPath, JSON.stringify(manifest));
  return { root, siteDir, manifestPath };
}

describe("starter v1 commands", () => {
  it("discovers minimal as the sole default through repochan/starter.json", async () => {
    expect(await getDefaultStarterId()).toBe("minimal");
    const starter = await getStarter("minimal");
    expect(starter.schemaVersion).toBe("repochan.starter.v1");
    expect(starter.config.site).toBe("repochan/site.json");
    expect(starter.assets.map((asset) => asset.slot)).toEqual(["hero-composite"]);
  });

  it("surfaces the operational asset contract in starter list/get output", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runStarterList("", {});
    expect(String(log.mock.calls.at(-1)?.[0])).toMatch(/minimal/);

    log.mockClear();
    await runStarterGet("", "minimal", {});
    const human = String(log.mock.calls.at(-1)?.[0]);
    expect(human).toMatch(/assets \(1\)/);
    expect(human).toMatch(/hero-composite → compress \[order\]/);

    log.mockClear();
    await runStarterGet("", "minimal", { json: true });
    const json = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(json.assets[0]).toMatchObject({ slot: "hero-composite", kind: "scalar" });
  });

  it("pulls a trusted local starter without copying build caches", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = await projectFixture();
    const sourceDir = path.join(root, "creator-owned-starter");
    const siteDir = path.join(root, "localized-site");
    await runStarterPull(root, { outputDir: sourceDir, json: true });
    await mkdir(path.join(sourceDir, "dist"), { recursive: true });
    await writeFile(path.join(sourceDir, "dist", "stale.html"), "stale");
    await runStarterPull(root, { from: sourceDir, outputDir: siteDir, json: true });
    expect((await readStarterInstance(siteDir)).id).toBe("minimal");
    await expect(readFile(path.join(siteDir, "dist", "stale.html"))).rejects.toThrow();
    expect(await readFile(path.join(siteDir, "repochan", "site.json"), "utf8"))
      .toBe(await readFile(path.join(sourceDir, "repochan", "site.json"), "utf8"));
  });

  it("rejects missing or non-file declared previews during starter validation", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = await projectFixture();
    const siteDir = path.join(root, "site");
    await runStarterPull(root, { outputDir: siteDir, json: true });
    const manifestPath = path.join(siteDir, "repochan/starter.json");
    const pulled = JSON.parse(await readFile(manifestPath, "utf8"));
    pulled.previews = { desktop: "repochan/previews/missing.png", mobile: "repochan/previews/mobile.png" };
    await writeFile(manifestPath, JSON.stringify(pulled));

    await expect(runStarterValidate(root, undefined, { outputDir: siteDir, json: true }))
      .rejects.toThrow(/desktop preview must be a regular file: repochan\/previews\/missing\.png/);

    pulled.previews.desktop = "public/assets";
    await writeFile(manifestPath, JSON.stringify(pulled));
    await expect(runStarterValidate(root, undefined, { outputDir: siteDir, json: true }))
      .rejects.toThrow(/desktop preview must be a regular file: public\/assets/);
  });

  it("pulls, projects config, and validates an independent instance", async () => {
    const root = await projectFixture();
    const siteDir = path.join(root, "site");
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runStarterPull(root, { outputDir: siteDir, json: true });
    expect((await readStarterInstance(siteDir)).id).toBe("minimal");
    await runStarterConfigure(root, { outputDir: siteDir, json: true, repositoryUrl: "https://example.test/override" });
    await runStarterValidate(root, undefined, { outputDir: siteDir, json: true });
    await expect(runStarterValidate(root, undefined, { outputDir: siteDir, json: true, localized: true }))
      .rejects.toThrow(/required asset is still using the source asset/);

    const configured = JSON.parse(await readFile(path.join(siteDir, "repochan", "site.json"), "utf8"));
    expect(configured).toMatchObject({
      project: { name: "Fixture Project", repositoryUrl: "https://example.test/override" },
      theme: { primary: "#123456", base: "#234567", accents: ["#345678", "#456789"] },
      brand: { artStyle: "Precise", motifs: ["node"], patterns: ["grid"] },
    });
  });

  it("rejects locale replacements whose complete structure differs from the source template", async () => {
    const root = await projectFixture();
    const siteDir = path.join(root, "site");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runStarterPull(root, { outputDir: siteDir, json: true });

    const localePath = path.join(siteDir, "repochan", "i18n", "en.json");
    const invalid = JSON.parse(await readFile(localePath, "utf8"));
    invalid.content.hero.tags = invalid.content.hero.tags.slice(0, 2);
    delete invalid.content.hero.primaryCta.href;
    const contentFile = path.join(root, "localized.json");
    await writeFile(contentFile, JSON.stringify(invalid));
    await expect(runStarterConfigure(root, { outputDir: siteDir, contentFile, overwrite: true, json: true }))
      .rejects.toThrow(/missing key href.*expected 3 items/s);
  });

  it("atomically imports a local file into a scalar slot with portable provenance", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = await projectFixture();
    const siteDir = path.join(root, "site");
    const source = path.join(root, "incoming", "hero.webp");
    await runStarterPull(root, { outputDir: siteDir, json: true });

    const output = path.join(siteDir, "public/assets/hero-composite.webp");
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(source, await readFile(output));
    const assetsPath = path.join(siteDir, "repochan/assets.json");
    const outputBefore = await readFile(output);
    const assetsBefore = await readFile(assetsPath);
    await expect(runStarterAssetImport(root, "hero-composite", {
      outputDir: siteDir, file: "incoming/hero.webp", json: true,
    })).rejects.toThrow(/Pass --overwrite/);
    expect(await readFile(output)).toEqual(outputBefore);
    expect(await readFile(assetsPath)).toEqual(assetsBefore);

    await runStarterAssetImport(root, "hero-composite", {
      outputDir: siteDir, file: "incoming/hero.webp", overwrite: true, json: true,
    });

    expect(await readFile(output)).toEqual(await readFile(source));
    const assets = JSON.parse(await readFile(assetsPath, "utf8"));
    expect(assets.assets["hero-composite"]).toMatchObject({
      kind: "scalar",
      src: "/assets/hero-composite.webp",
      status: "customized",
      provenance: {
        kind: "local-file",
        sourcePath: "incoming/hero.webp",
      },
    });
  });

  it("rejects an incompatible local import without changing output or asset state", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = await projectFixture();
    const siteDir = path.join(root, "site");
    await runStarterPull(root, { outputDir: siteDir, json: true });
    const output = path.join(siteDir, "public/assets/hero-composite.webp");
    const assetsPath = path.join(siteDir, "repochan/assets.json");
    const outputBefore = await readFile(output);
    const assetsBefore = await readFile(assetsPath);
    await writeFile(path.join(root, "hero.png"), outputBefore);

    await expect(runStarterAssetImport(root, "hero-composite", {
      outputDir: siteDir, file: "hero.png", overwrite: true, json: true,
    })).rejects.toThrow(/source extension declares png/);
    expect(await readFile(output)).toEqual(outputBefore);
    expect(await readFile(assetsPath)).toEqual(assetsBefore);
  });

  it("rejects undecodable and mislabeled local images before changing state", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = await projectFixture();
    const siteDir = path.join(root, "site");
    await runStarterPull(root, { outputDir: siteDir, json: true });
    const output = path.join(siteDir, "public/assets/hero-composite.webp");
    const assetsPath = path.join(siteDir, "repochan/assets.json");
    const outputBefore = await readFile(output);
    const assetsBefore = await readFile(assetsPath);

    await writeFile(path.join(root, "plain.webp"), "not an image");
    await expect(runStarterAssetImport(root, "hero-composite", {
      outputDir: siteDir, file: "plain.webp", overwrite: true, json: true,
    })).rejects.toThrow(/Unsupported or unreadable image/);

    await writeFile(path.join(root, "mislabeled.png"), outputBefore);
    await expect(runStarterAssetImport(root, "hero-composite", {
      outputDir: siteDir, file: "mislabeled.png", overwrite: true, json: true,
    })).rejects.toThrow(/source extension declares png/);
    expect(await readFile(output)).toEqual(outputBefore);
    expect(await readFile(assetsPath)).toEqual(assetsBefore);
  });

  it("refuses a symlinked output ancestor before importing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = await projectFixture();
    const siteDir = path.join(root, "site");
    await runStarterPull(root, { outputDir: siteDir, json: true });
    const source = path.join(root, "source.webp");
    const originalOutput = path.join(siteDir, "public/assets/hero-composite.webp");
    await writeFile(source, await readFile(originalOutput));
    const outside = path.join(root, "outside");
    await mkdir(outside);
    await rm(path.join(siteDir, "public/assets"), { recursive: true });
    await fsSymlink(outside, path.join(siteDir, "public/assets"));
    await expect(runStarterAssetImport(root, "hero-composite", {
      outputDir: siteDir, file: source, overwrite: true, json: true,
    })).rejects.toThrow(/refuses symlink path/);
    await expect(readFile(path.join(outside, "hero-composite.webp"))).rejects.toThrow();
  });

  it("refuses a symlinked assets config before importing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = await projectFixture();
    const siteDir = path.join(root, "site");
    await runStarterPull(root, { outputDir: siteDir, json: true });
    const source = path.join(root, "source.webp");
    await writeFile(source, await readFile(path.join(siteDir, "public/assets/hero-composite.webp")));
    const assetsPath = path.join(siteDir, "repochan/assets.json");
    const outsideConfig = path.join(root, "outside-assets.json");
    const original = await readFile(assetsPath);
    await writeFile(outsideConfig, original);
    await rm(assetsPath);
    await fsSymlink(outsideConfig, assetsPath);

    await expect(runStarterAssetImport(root, "hero-composite", {
      outputDir: siteDir, file: source, overwrite: true, json: true,
    })).rejects.toThrow(/refuses symlink path/);
    expect(await readFile(outsideConfig)).toEqual(original);
  });

  it("applies a named grid bundle and records per-item provenance and QA", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, siteDir, assetsPath } = await gridBundleFixture();
    vi.mocked(extractAssets).mockImplementation(async (_source, outDir, options) => {
      await mkdir(outDir, { recursive: true });
      const items = Object.entries(options.mapping as Record<string, number>).map(([key, index]) => ({
        key, index, file: `${key}.png`, path: path.join(outDir, `${key}.png`),
        geometry: { cell: { row: 0, col: index, x: index * 10, y: 0, w: 10, h: 10 }, foreground: { x: 1, y: 1, w: 8, h: 8 }, normalized: { x: 2, y: 2, w: 60, h: 60, canvasWidth: 64, canvasHeight: 64, padding: 0 } },
        qa: { foregroundPixels: 64, foregroundRatio: 0.64, edgeTouchPixels: 0, edgeTouchRatio: 0, alphaThreshold: 16 },
      }));
      for (const item of items) await writeFile(item.path, item.key);
      return { sourceFile: "source.png", rows: 1, cols: 2, matteColor: [0, 255, 0], matteColorSource: "auto-sampled", items, qa: gridQa() };
    });

    await runStarterAssetApply(root, "web-states", { outputDir: siteDir, order: "ord-grid-001", json: true });
    expect(await readFile(path.join(siteDir, "public/assets/states/welcome.png"), "utf8")).toBe("welcome");
    expect(await readFile(path.join(siteDir, "public/assets/states/empty.png"), "utf8")).toBe("empty");
    const assets = JSON.parse(await readFile(assetsPath, "utf8"));
    expect(assets.assets["web-states"].items.empty).toMatchObject({
      src: "/assets/states/empty.png", status: "customized", orderId: "ord-grid-001", versionId: "v1",
      qa: { foregroundRatio: 0.64 },
    });
  });

  it("forwards extract-grid args.format/quality to extractAssets and lands webp outputs", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, siteDir, assetsPath } = await gridBundleFixture();
    // Rewrite the bundle to declare webp output.
    const manifestPath = path.join(siteDir, "repochan", "starter.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.assets[0].publications = [
      { key: "welcome", cell: 0, output: "public/assets/states/welcome.webp" },
      { key: "empty", cell: 1, output: "public/assets/states/empty.webp" },
    ];
    manifest.assets[0].postprocess[0].args.format = "webp";
    manifest.assets[0].postprocess[0].args.quality = 80;
    await writeFile(manifestPath, JSON.stringify(manifest));

    const seenOptions: Array<{ format?: string; quality?: number }> = [];
    vi.mocked(extractAssets).mockImplementation(async (_source, outDir, options) => {
      seenOptions.push({ format: options.format, quality: options.quality });
      await mkdir(outDir, { recursive: true });
      const ext = options.format === "webp" ? "webp" : "png";
      const items = Object.entries(options.mapping as Record<string, number>).map(([key, index]) => ({
        key, index, file: `${key}.${ext}`, path: path.join(outDir, `${key}.${ext}`),
        geometry: { cell: { row: 0, col: index, x: index * 10, y: 0, w: 10, h: 10 }, foreground: { x: 1, y: 1, w: 8, h: 8 }, normalized: { x: 2, y: 2, w: 60, h: 60, canvasWidth: 64, canvasHeight: 64, padding: 0 } },
        qa: { foregroundPixels: 64, foregroundRatio: 0.64, edgeTouchPixels: 0, edgeTouchRatio: 0, alphaThreshold: 16 },
      }));
      for (const item of items) await writeFile(item.path, item.key);
      return { sourceFile: "source.png", rows: 1, cols: 2, matteColor: [0, 255, 0], matteColorSource: "auto-sampled", items, qa: gridQa() };
    });

    await runStarterAssetApply(root, "web-states", { outputDir: siteDir, order: "ord-grid-001", json: true });
    expect(seenOptions).toEqual([{ format: "webp", quality: 80 }]);
    expect(await readFile(path.join(siteDir, "public/assets/states/welcome.webp"), "utf8")).toBe("welcome");
    expect(await readFile(path.join(siteDir, "public/assets/states/empty.webp"), "utf8")).toBe("empty");
    const assets = JSON.parse(await readFile(assetsPath, "utf8"));
    expect(assets.assets["web-states"].items.empty).toMatchObject({
      src: "/assets/states/empty.webp", status: "customized", orderId: "ord-grid-001", versionId: "v1",
    });
  });

  it("chains each scalar postprocess output into the next step", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = await projectFixture();
    const siteDir = path.join(root, "site");
    await runStarterPull(root, { outputDir: siteDir, json: true });
    const manifestPath = path.join(siteDir, "repochan/starter.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.assets[0].postprocess = [
      { op: "compress", out: "public/assets/intermediate.webp" },
      { op: "chroma-key", out: "public/assets/hero-composite.webp" },
    ];
    await writeFile(manifestPath, JSON.stringify(manifest));
    const versionDir = path.join(root, ".repochan/orders/ord-hero-001/versions/v1");
    await mkdir(versionDir, { recursive: true });
    await writeFile(path.join(root, ".repochan/orders/ord-hero-001/order.json"), JSON.stringify(canonicalOrder("ord-hero-001", {
      assetType: manifest.assets[0].order.assetType,
      templateId: manifest.assets[0].order.templateId,
    })));
    await writeFile(path.join(versionDir, "source.webp"), "source");
    await writeFile(path.join(versionDir, "meta.json"), JSON.stringify({
      versionId: "v1", createdAt: "2026-01-01T00:00:00.000Z", files: ["source.webp"],
    }));
    vi.mocked(compressImage).mockImplementation(async (_source, out) => {
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, "intermediate");
      return {} as never;
    });
    vi.mocked(chromaKeyImage).mockImplementation(async (source, out) => {
      expect(source).toMatch(/public\/assets\/intermediate\.webp$/);
      expect(await readFile(source, "utf8")).toBe("intermediate");
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, "final");
      return {} as never;
    });

    await runStarterAssetApply(root, "hero-composite", {
      outputDir: siteDir, order: "ord-hero-001", overwrite: true, json: true,
    });
    expect(await readFile(path.join(siteDir, "public/assets/hero-composite.webp"), "utf8")).toBe("final");
  });

  it("leaves outputs and assets state unchanged when grid extraction fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, siteDir, assetsPath } = await gridBundleFixture();
    const welcome = path.join(siteDir, "public/assets/states/welcome.png");
    await mkdir(path.dirname(welcome), { recursive: true });
    await writeFile(welcome, "old");
    const assetsBefore = await readFile(assetsPath, "utf8");
    vi.mocked(extractAssets).mockRejectedValueOnce(new Error("alpha QA failed"));

    await expect(runStarterAssetApply(root, "web-states", {
      outputDir: siteDir, order: "ord-grid-001", overwrite: true, json: true,
    })).rejects.toThrow(/alpha QA failed/);
    expect(await readFile(welcome, "utf8")).toBe("old");
    await expect(readFile(path.join(siteDir, "public/assets/states/empty.png"), "utf8")).rejects.toThrow();
    expect(await readFile(assetsPath, "utf8")).toBe(assetsBefore);
  });

  it("validates publication semantics against template grid.cell_keys", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, siteDir, assetsPath } = await gridBundleFixture();
    const keys = ["welcome", "searching", "loading", "empty", "error", "success", "not-found", "cta", "cozy"];
    const manifestPath = path.join(siteDir, "repochan", "starter.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.assets[0].order = { assetType: "web_state_stickers", templateId: "official/web-state-grid-3x3" };
    manifest.assets[0].publications = keys.map((key, cell) => ({ key, cell, output: `public/assets/states/${key}.png` }));
    manifest.assets[0].postprocess[0].args = { rows: 3, cols: 3, normalize: { canvasSize: 64 } };
    await writeFile(manifestPath, JSON.stringify(manifest));
    const items = Object.fromEntries(keys.map((key) => [key, { src: `/assets/states/${key}.png`, status: "source" }]));
    await writeFile(assetsPath, JSON.stringify({ schemaVersion: "repochan.starter-assets.v1", assets: {
      "web-states": { kind: "bundle", status: "source", items },
    } }));
    for (const key of keys) {
      const output = path.join(siteDir, `public/assets/states/${key}.png`);
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, key);
    }
    await runStarterValidate(root, undefined, { outputDir: siteDir, json: true });

    manifest.assets[0].publications[0].key = "greeting";
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(runStarterValidate(root, undefined, { outputDir: siteDir, json: true }))
      .rejects.toThrow(/publications do not match.*grid\.cell_keys/);
  });

  it("rejects drifted grid publication semantics in asset-apply before processing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, siteDir, assetsPath } = await gridBundleFixture();
    const keys = ["welcome", "searching", "loading", "empty", "error", "success", "not-found", "cta", "cozy"];
    const manifestPath = path.join(siteDir, "repochan/starter.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.assets[0].order = { assetType: "web_state_stickers", templateId: "official/web-state-grid-3x3" };
    manifest.assets[0].publications = keys.map((key, cell) => ({ key, cell, output: `public/assets/states/${key}.png` }));
    manifest.assets[0].publications[0].key = "greeting";
    manifest.assets[0].postprocess[0].args = { rows: 3, cols: 3, normalize: { canvasSize: 64 } };
    await writeFile(manifestPath, JSON.stringify(manifest));
    const orderPath = path.join(root, ".repochan/orders/ord-grid-001/order.json");
    const order = JSON.parse(await readFile(orderPath, "utf8"));
    Object.assign(order, { assetType: "web_state_stickers", templateId: "official/web-state-grid-3x3" });
    await writeFile(orderPath, JSON.stringify(order));
    const assetsBefore = await readFile(assetsPath);

    await expect(runStarterAssetApply(root, "web-states", {
      outputDir: siteDir, order: "ord-grid-001", overwrite: true, json: true,
    })).rejects.toThrow(/publications do not match.*grid\.cell_keys/);
    expect(extractAssets).not.toHaveBeenCalled();
    expect(await readFile(assetsPath)).toEqual(assetsBefore);
  });

  it("prints the apply failure envelope on ExtractError under --json and rethrows the sentinel", async () => {
    const { root, siteDir, assetsPath } = await gridBundleFixture();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsBefore = await readFile(assetsPath, "utf8");
    const failure = new ExtractError(
      "extractAssets: chroma-grid QA failed:\n- empty (cell 1): empty foreground",
      [{ code: "empty_cell", key: "empty", index: 1, detail: "empty foreground" }],
      gridQa(),
    );
    vi.mocked(extractAssets).mockRejectedValueOnce(failure);

    await expect(runStarterAssetApply(root, "web-states", {
      outputDir: siteDir, order: "ord-grid-001", overwrite: true, json: true,
    })).rejects.toBeInstanceOf(ApplyFailurePrintedError);

    expect(log).toHaveBeenCalledTimes(1);
    const envelope = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(envelope).toMatchObject({
      ok: false,
      error: "ExtractError",
      command: "starter asset-apply",
      slot: "web-states",
      orderId: "ord-grid-001",
      resultVersion: "v1",
      strategyUsed: "chroma-grid",
      pipeline: "v2",
      matteColor: "#00ff00",
      matteColorSource: "auto-sampled",
    });
    expect(envelope.defects).toEqual([{ code: "empty_cell", key: "empty", index: 1, detail: "empty foreground" }]);
    expect(envelope.qa.strategyUsed).toBe("chroma-grid");
    // temp staging root is cleaned and no state changed
    const leftovers = await readdir(siteDir);
    expect(leftovers.filter((name) => name.startsWith(".repochan-starter-"))).toEqual([]);
    expect(await readFile(assetsPath, "utf8")).toBe(assetsBefore);
  });

  it("recovers a wrapped ExtractError through the cause chain for the envelope", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, siteDir } = await gridBundleFixture();
    const failure = new ExtractError("extractAssets: QA failed", [
      { code: "sheet_edge_touch", key: "cta", index: 7, detail: "touches the sheet edge", metric: 0.12 },
    ], gridQa("chroma-grid", "v2"));
    vi.mocked(extractAssets).mockRejectedValueOnce(Object.assign(new Error("stageGridBundle failed"), { cause: failure }));

    await expect(runStarterAssetApply(root, "web-states", {
      outputDir: siteDir, order: "ord-grid-001", overwrite: true, json: true,
    })).rejects.toBeInstanceOf(ApplyFailurePrintedError);
    const envelope = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(envelope.slot).toBe("web-states");
    expect(envelope.defects[0]).toMatchObject({ code: "sheet_edge_touch", key: "cta", metric: 0.12 });
    expect(envelope.strategyUsed).toBe("chroma-grid");
    expect(envelope.pipeline).toBe("v2");
  });

  it("rethrows ExtractError unchanged without an envelope when --json is off", async () => {
    const { root, siteDir, assetsPath } = await gridBundleFixture();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsBefore = await readFile(assetsPath, "utf8");
    const failure = new ExtractError("extractAssets: QA failed", [
      { code: "empty_cell", key: "empty", index: 1, detail: "empty foreground" },
    ]);
    vi.mocked(extractAssets).mockRejectedValueOnce(failure);

    await expect(runStarterAssetApply(root, "web-states", {
      outputDir: siteDir, order: "ord-grid-001", overwrite: true,
    })).rejects.toBe(failure);
    expect(log).not.toHaveBeenCalled();
    const leftovers = await readdir(siteDir);
    expect(leftovers.filter((name) => name.startsWith(".repochan-starter-"))).toEqual([]);
    expect(await readFile(assetsPath, "utf8")).toBe(assetsBefore);
  });

  it("rethrows non-ExtractError failures without an envelope under --json", async () => {
    const { root, siteDir } = await gridBundleFixture();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.mocked(extractAssets).mockRejectedValueOnce(new Error("image exceeds max dimension 8192"));

    await expect(runStarterAssetApply(root, "web-states", {
      outputDir: siteDir, order: "ord-grid-001", overwrite: true, json: true,
    })).rejects.toThrow(/image exceeds max dimension 8192/);
    expect(log).not.toHaveBeenCalled();
  });

  it("accepts the canary chroma-grid starter and forwards its extract-grid args to extractAssets", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = await projectFixture();
    const siteDir = path.join(root, "site");
    await runStarterPull(root, { outputDir: siteDir, json: true });
    const canary = JSON.parse(await readFile(new URL("../../test/fixtures/canary-chroma-grid.json", import.meta.url), "utf8"));
    await writeFile(path.join(siteDir, "repochan", "starter.json"), JSON.stringify(canary));
    const publications = canary.assets[0].publications as Array<{ key: string; cell: number; output: string }>;
    const sourceItems = Object.fromEntries(publications.map((publication) => [
      publication.key,
      { src: `/${publication.output.replace(/^public\//, "")}`, status: "source" },
    ]));
    await writeFile(path.join(siteDir, "repochan", "assets.json"), JSON.stringify({
      schemaVersion: "repochan.starter-assets.v1",
      assets: { "web-states": { kind: "bundle", status: "source", items: sourceItems } },
    }));
    const versionDir = path.join(root, ".repochan", "orders", "ord-canary-001", "versions", "v1");
    await mkdir(versionDir, { recursive: true });
    await writeFile(path.join(root, ".repochan", "orders", "ord-canary-001", "order.json"), JSON.stringify(canonicalOrder("ord-canary-001")));
    await writeFile(path.join(versionDir, "source.png"), "source");
    await writeFile(path.join(versionDir, "meta.json"), JSON.stringify({
      versionId: "v1", createdAt: "2026-01-01T00:00:00.000Z", files: ["source.png"],
    }));

    const seenOptions: Array<Record<string, unknown>> = [];
    vi.mocked(extractAssets).mockImplementation(async (_source, outDir, options) => {
      seenOptions.push(options as unknown as Record<string, unknown>);
      await mkdir(outDir, { recursive: true });
      const items = Object.entries(options.mapping as Record<string, number>).map(([key, index]) => ({
        key, index, file: `${key}.webp`, path: path.join(outDir, `${key}.webp`),
        geometry: { cell: { row: 0, col: index, x: index * 10, y: 0, w: 10, h: 10 }, foreground: { x: 1, y: 1, w: 8, h: 8 }, normalized: { x: 2, y: 2, w: 60, h: 60, canvasWidth: 64, canvasHeight: 64, padding: 0 } },
        qa: { foregroundPixels: 64, foregroundRatio: 0.64, edgeTouchPixels: 0, edgeTouchRatio: 0, alphaThreshold: 16 },
      }));
      for (const item of items) await writeFile(item.path, item.key);
      return {
        sourceFile: "source.png", rows: 3, cols: 3, matteColor: [0, 255, 0], matteColorSource: "auto-subject-aware",
        items, qa: gridQa("chroma-grid", "v2"),
      };
    });

    await runStarterAssetApply(root, "web-states", { outputDir: siteDir, order: "ord-canary-001", json: true });
    expect(seenOptions).toHaveLength(1);
    expect(seenOptions[0]).toMatchObject({
      strategy: "chroma-grid",
      rows: 3,
      cols: 3,
      chroma: { pipeline: "v2", matteColor: "auto", matteSelect: "subject-aware" },
      geometry: { mode: "centroid-components" },
      normalize: { canvasSize: 256, padding: 16 },
      qa: { minForegroundRatio: 0.005, maxForegroundRatio: 0.8, maxSheetEdgeTouchRatio: 0 },
      format: "webp",
      quality: 80,
    });
    expect(await readFile(path.join(siteDir, "public/assets/states/welcome.webp"), "utf8")).toBe("welcome");
    expect(await readFile(path.join(siteDir, "public/assets/states/cozy.webp"), "utf8")).toBe("cozy");
  });

  async function scalarChainFixture(postprocess: Array<Record<string, unknown>>) {
    const root = await projectFixture();
    const siteDir = path.join(root, "site");
    await runStarterPull(root, { outputDir: siteDir, json: true });
    const manifestPath = path.join(siteDir, "repochan/starter.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.assets[0].postprocess = postprocess;
    await writeFile(manifestPath, JSON.stringify(manifest));
    const versionDir = path.join(root, ".repochan/orders/ord-hero-001/versions/v1");
    await mkdir(versionDir, { recursive: true });
    await writeFile(path.join(root, ".repochan/orders/ord-hero-001/order.json"), JSON.stringify(canonicalOrder("ord-hero-001", {
      assetType: manifest.assets[0].order.assetType,
      templateId: manifest.assets[0].order.templateId,
    })));
    await writeFile(path.join(versionDir, "source.webp"), "source");
    await writeFile(path.join(versionDir, "meta.json"), JSON.stringify({
      versionId: "v1", createdAt: "2026-01-01T00:00:00.000Z", files: ["source.webp"],
    }));
    vi.mocked(compressImage).mockImplementation(async (_source, out) => {
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, "intermediate");
      return {} as never;
    });
    vi.mocked(chromaKeyImage).mockImplementation(async (_source, out) => {
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, "final");
      return {} as never;
    });
    return { root, siteDir, orderDir: path.join(root, ".repochan/orders/ord-hero-001") };
  }

  it("archives kept scalar step artifacts into the order derived/ copy and appends on re-apply", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, siteDir, orderDir } = await scalarChainFixture([
      { op: "compress", out: "public/assets/intermediate.webp" },
      { op: "chroma-key", out: "public/assets/hero-composite.webp", keep: false },
    ]);

    await runStarterAssetApply(root, "hero-composite", {
      outputDir: siteDir, order: "ord-hero-001", overwrite: true, json: true,
    });

    const derived = JSON.parse(await readFile(path.join(orderDir, "derived.json"), "utf8"));
    expect(derived.schemaVersion).toBe("repochan.order-derived.v1");
    expect(derived.orderId).toBe("ord-hero-001");
    expect(derived.entries).toHaveLength(1);
    const entry = derived.entries[0];
    expect(entry.slot).toBe("hero-composite");
    expect(entry.starter).toBe("minimal");
    expect(entry.resultVersion).toBe("v1");
    expect(entry.archiveDir).toMatch(/^derived\/.+--hero-composite$/);
    expect(entry.steps).toHaveLength(2);
    // kept intermediate step: archived with its artifact record
    expect(entry.steps[0]).toMatchObject({ op: "compress", out: "public/assets/intermediate.webp" });
    expect(entry.steps[0].artifacts).toEqual([{
      out: "public/assets/intermediate.webp",
      stored: `${entry.archiveDir}/public/assets/intermediate.webp`,
    }]);
    // keep: false final step: recorded but no artifacts
    expect(entry.steps[1]).toMatchObject({ op: "chroma-key", out: "public/assets/hero-composite.webp", keep: false, artifacts: [] });
    expect(await readFile(path.join(orderDir, entry.archiveDir, "public/assets/intermediate.webp"), "utf8")).toBe("intermediate");
    await expect(readFile(path.join(orderDir, entry.archiveDir, "public/assets/hero-composite.webp"))).rejects.toThrow();
    // the immutable versions/ directory gained nothing
    expect(await readdir(path.join(orderDir, "versions"))).toEqual(["v1"]);
    const json = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(json.derived).toBe(entry.archiveDir);

    // re-apply appends a second entry without touching the first
    await runStarterAssetApply(root, "hero-composite", {
      outputDir: siteDir, order: "ord-hero-001", overwrite: true, json: true,
    });
    const after = JSON.parse(await readFile(path.join(orderDir, "derived.json"), "utf8"));
    expect(after.entries).toHaveLength(2);
    expect(after.entries[0]).toEqual(entry);
    expect(after.entries[1].archiveDir).toMatch(/^derived\/.+--hero-composite$/);
  });

  it("archives grid bundle publications into the order derived/ copy", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, siteDir } = await gridBundleFixture();
    vi.mocked(extractAssets).mockImplementation(async (_source, outDir, options) => {
      await mkdir(outDir, { recursive: true });
      const items = Object.entries(options.mapping as Record<string, number>).map(([key, index]) => ({
        key, index, file: `${key}.png`, path: path.join(outDir, `${key}.png`),
        geometry: { cell: { row: 0, col: index, x: index * 10, y: 0, w: 10, h: 10 }, foreground: { x: 1, y: 1, w: 8, h: 8 }, normalized: { x: 2, y: 2, w: 60, h: 60, canvasWidth: 64, canvasHeight: 64, padding: 0 } },
        qa: { foregroundPixels: 64, foregroundRatio: 0.64, edgeTouchPixels: 0, edgeTouchRatio: 0, alphaThreshold: 16 },
      }));
      for (const item of items) await writeFile(item.path, item.key);
      return { sourceFile: "source.png", rows: 1, cols: 2, matteColor: [0, 255, 0], matteColorSource: "auto-sampled", items, qa: gridQa() };
    });

    await runStarterAssetApply(root, "web-states", { outputDir: siteDir, order: "ord-grid-001", json: true });

    const orderDir = path.join(root, ".repochan/orders/ord-grid-001");
    const derived = JSON.parse(await readFile(path.join(orderDir, "derived.json"), "utf8"));
    expect(derived.entries).toHaveLength(1);
    const entry = derived.entries[0];
    expect(entry.slot).toBe("web-states");
    expect(entry.archiveDir).toMatch(/^derived\/.+--web-states$/);
    expect(entry.steps).toHaveLength(1);
    expect(entry.steps[0].op).toBe("extract-grid");
    expect(entry.steps[0].artifacts).toEqual([
      { out: "public/assets/states/welcome.png", stored: `${entry.archiveDir}/public/assets/states/welcome.png` },
      { out: "public/assets/states/empty.png", stored: `${entry.archiveDir}/public/assets/states/empty.png` },
    ]);
    expect(await readFile(path.join(orderDir, entry.archiveDir, "public/assets/states/welcome.png"), "utf8")).toBe("welcome");
    expect(await readFile(path.join(orderDir, entry.archiveDir, "public/assets/states/empty.png"), "utf8")).toBe("empty");
    expect(await readdir(path.join(orderDir, "versions"))).toEqual(["v1"]);
  });

  it("warns but does not fail the apply when the derived archive cannot be written", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, siteDir, orderDir } = await scalarChainFixture([
      { op: "compress", out: "public/assets/intermediate.webp" },
      { op: "chroma-key", out: "public/assets/hero-composite.webp" },
    ]);
    // A directory at the derived.json path makes the append fail deterministically.
    await mkdir(path.join(orderDir, "derived.json"), { recursive: true });

    await runStarterAssetApply(root, "hero-composite", {
      outputDir: siteDir, order: "ord-hero-001", overwrite: true, json: true,
    });

    expect(await readFile(path.join(siteDir, "public/assets/hero-composite.webp"), "utf8")).toBe("final");
    const json = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(json.derived).toBeUndefined();
    expect(json.derivedWarning).toMatch(/derived archive failed/);
  });

  it("resolves a slot: reference to the referenced slot's customized asset", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, siteDir } = await slotReferenceFixture();
    await writeFile(path.join(siteDir, "public/assets/hero-composite.webp"), "customized-hero");
    const assetsPath = path.join(siteDir, "repochan", "assets.json");
    const assets = JSON.parse(await readFile(assetsPath, "utf8"));
    assets.assets["hero-composite"].status = "customized";
    await writeFile(assetsPath, JSON.stringify(assets));

    await runStarterCreateOrder(root, "scene-night", { outputDir: siteDir, intent: "night version", json: true });

    const json = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(json.orderId).toBe("ord-scene-night-001");
    expect(json.referenceWarning).toBeUndefined();
    const orderDir = path.join(root, ".repochan", "orders", "ord-scene-night-001");
    const order = JSON.parse(await readFile(path.join(orderDir, "order.json"), "utf8"));
    expect(order.references[0]).toMatchObject({ type: "file", role: "composition", path: "references/hero-composite.webp" });
    expect(await readFile(path.join(orderDir, "references", "hero-composite.webp"), "utf8")).toBe("customized-hero");
  });

  it("warns when a slot: reference still resolves to the starter source asset", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, siteDir } = await slotReferenceFixture();

    await runStarterCreateOrder(root, "scene-night", { outputDir: siteDir, intent: "night version", json: true });

    const json = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(json.orderId).toBe("ord-scene-night-001");
    expect(json.referenceWarning).toMatch(/starter source asset/);
    expect(json.referenceWarning).toMatch(/hero-composite/);
    const orderDir = path.join(root, ".repochan", "orders", "ord-scene-night-001");
    const order = JSON.parse(await readFile(path.join(orderDir, "order.json"), "utf8"));
    expect(order.references[0]).toMatchObject({ type: "file", role: "composition", path: "references/hero-composite.webp" });
    expect(await readFile(path.join(orderDir, "references", "hero-composite.webp"), "utf8"))
      .toBe(await readFile(path.join(siteDir, "public/assets/hero-composite.webp"), "utf8"));
  });

  it("rejects a slot: reference whose target slot has no asset state", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, siteDir, manifestPath } = await slotReferenceFixture();
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.assets.push({
      kind: "scalar",
      slot: "scene-day",
      required: false,
      output: "public/assets/scene-day.webp",
      postprocess: [{ op: "compress", out: "public/assets/scene-day.webp" }],
    });
    manifest.assets.find((asset: { slot: string }) => asset.slot === "scene-night").reference = "slot:scene-day";
    await writeFile(manifestPath, JSON.stringify(manifest));

    await expect(runStarterCreateOrder(root, "scene-night", { outputDir: siteDir, intent: "night version", json: true }))
      .rejects.toThrow(/slot reference 'slot:scene-day' has no asset state/);
  });

  it("skips the missing-reference check for slot: references in starter validate", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { root, siteDir, manifestPath } = await slotReferenceFixture();

    await runStarterValidate(root, undefined, { outputDir: siteDir, json: true });

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.assets.find((asset: { slot: string }) => asset.slot === "scene-night").reference = "public/assets/missing-reference.webp";
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(runStarterValidate(root, undefined, { outputDir: siteDir, json: true }))
      .rejects.toThrow(/scene-night: missing reference public\/assets\/missing-reference\.webp/);
  });
});

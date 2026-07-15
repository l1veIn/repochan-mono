import { mkdir, mkdtemp, readFile, rm, symlink as fsSymlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runStarterAssetApply,
  runStarterAssetImport,
  runStarterConfigure,
  runStarterGet,
  runStarterList,
  runStarterPull,
  runStarterValidate,
} from "./starter.js";
import { getDefaultStarterId, getStarter, readStarterInstance } from "../lib/starter-loader.js";
import { chromaKeyImage, compressImage, extractMatteGrid } from "@repochan/image-edit";

vi.mock("@repochan/image-edit", async (importOriginal) => ({
  ...await importOriginal<typeof import("@repochan/image-edit")>(),
  extractMatteGrid: vi.fn(),
  compressImage: vi.fn(),
  chromaKeyImage: vi.fn(),
}));

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
  manifest.capabilities = {
    sections: [{
      id: "states",
      recipe: "web-state-grid",
      provenance: { type: "html-first" },
      bakedLayers: [],
      liveLayers: ["L2", "L3", "L4"],
      canonicalViewport: { width: 1280, height: 800 },
      responsive: { mode: "reflow", notes: "Reflow state cards at narrow widths." },
      assetSlots: ["web-states"],
      motion: [],
    }],
    transitions: [],
  };
  await writeFile(manifestPath, JSON.stringify(manifest));
  const assetsPath = path.join(siteDir, "repochan", "assets.json");
  await writeFile(assetsPath, JSON.stringify({ schemaVersion: "repochan.starter-assets.v1", assets: {
    "web-states": { kind: "bundle", status: "pending", items: {} },
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

describe("starter v1 commands", () => {
  it("discovers minimal as the sole default through repochan/starter.json", async () => {
    expect(await getDefaultStarterId()).toBe("minimal");
    const starter = await getStarter("minimal");
    expect(starter.schemaVersion).toBe("repochan.starter.v1");
    expect(starter.config.site).toBe("repochan/site.json");
    expect(starter.capabilities.sections.map((section) => section.id)).toEqual(["hero"]);
  });

  it("surfaces section capabilities in starter list/get human and JSON output", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runStarterList("", {});
    expect(String(log.mock.calls.at(-1)?.[0])).toMatch(/sections: hero/);

    log.mockClear();
    await runStarterGet("", "minimal", {});
    const human = String(log.mock.calls.at(-1)?.[0]);
    expect(human).toMatch(/sections \(1\)/);
    expect(human).toMatch(/hero — hero-composite-live-copy/);
    expect(human).toMatch(/baked=L1\+L2, live=L3\+L4/);
    expect(human).toMatch(/transitions \(0\): none/);

    log.mockClear();
    await runStarterGet("", "minimal", { json: true });
    const json = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(json.capabilities.sections[0]).toMatchObject({
      id: "hero",
      recipe: "hero-composite-live-copy",
      assetSlots: ["hero-composite"],
    });
  });

  it("rejects any starter instance without the canonical capabilities contract", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = await projectFixture();
    const siteDir = path.join(root, "invalid-site");
    await runStarterPull(root, { outputDir: siteDir, json: true });
    const manifestPath = path.join(siteDir, "repochan/starter.json");
    const pulled = JSON.parse(await readFile(manifestPath, "utf8"));
    delete pulled.capabilities;
    await writeFile(manifestPath, JSON.stringify(pulled));
    await expect(readStarterInstance(siteDir)).rejects.toThrow(/capabilities/);
    await expect(runStarterValidate(root, undefined, { outputDir: siteDir, json: true })).rejects.toThrow(/capabilities/);
  });

  it("rejects missing or non-file section design references during starter validation", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = await projectFixture();
    const siteDir = path.join(root, "site");
    await runStarterPull(root, { outputDir: siteDir, json: true });
    const manifestPath = path.join(siteDir, "repochan/starter.json");
    const pulled = JSON.parse(await readFile(manifestPath, "utf8"));
    pulled.capabilities.sections[0].provenance.reference = "public/assets/missing-design-reference.webp";
    await writeFile(manifestPath, JSON.stringify(pulled));

    await expect(runStarterValidate(root, undefined, { outputDir: siteDir, json: true }))
      .rejects.toThrow(/hero: design reference must be a regular file: public\/assets\/missing-design-reference\.webp/);

    pulled.capabilities.sections[0].provenance.reference = "public/assets";
    await writeFile(manifestPath, JSON.stringify(pulled));
    await expect(runStarterValidate(root, undefined, { outputDir: siteDir, json: true }))
      .rejects.toThrow(/hero: design reference must be a regular file: public\/assets/);
  });

  it("pulls, projects config, and validates an independent instance", async () => {
    const root = await projectFixture();
    const siteDir = path.join(root, "site");
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runStarterPull(root, { outputDir: siteDir, json: true });
    expect((await readStarterInstance(siteDir)).id).toBe("minimal");
    await runStarterConfigure(root, { outputDir: siteDir, json: true, repositoryUrl: "https://example.test/override" });
    await runStarterValidate(root, undefined, { outputDir: siteDir, json: true });

    const configured = JSON.parse(await readFile(path.join(siteDir, "repochan", "site.json"), "utf8"));
    expect(configured).toMatchObject({
      project: { name: "Fixture Project", repositoryUrl: "https://example.test/override" },
      theme: { primary: "#123456", base: "#234567", accents: ["#345678", "#456789"] },
      brand: { artStyle: "Precise", motifs: ["node"], patterns: ["grid"] },
    });
  });

  it("rejects pulled registry content with empty required objects or fixed-cardinality arrays", async () => {
    const root = await projectFixture();
    const siteDir = path.join(root, "registry-site");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runStarterPull(root, { starter: "registry-modular", outputDir: siteDir, json: true });
    await expect(runStarterValidate(root, undefined, { outputDir: siteDir, json: true })).resolves.toBeUndefined();

    const localePath = path.join(siteDir, "repochan", "i18n", "en.json");
    const fallback = JSON.parse(await readFile(localePath, "utf8"));
    const cardinalityCases: Array<[(content: any) => void, RegExp]> = [
      [(content) => { content.nav.links = content.nav.links.slice(0, 3); }, /content\.nav\.links\.3\.label/],
      [(content) => { content.capabilities.items = content.capabilities.items.slice(0, 5); }, /content\.capabilities\.items\.5\.title/],
      [(content) => { content.workflow.steps = content.workflow.steps.slice(0, 3); }, /content\.workflow\.steps\.3\.title/],
      [(content) => { content.proof.items = content.proof.items.slice(0, 3); }, /content\.proof\.items\.3\.lead/],
      [(content) => { content.cta.primary = {}; }, /content\.cta\.primary\.label/],
      [(content) => { content.footer.groups = content.footer.groups.slice(0, 2); }, /content\.footer\.groups\.2\.title/],
      [(content) => { content.footer.groups[1].links = content.footer.groups[1].links.slice(0, 1); }, /content\.footer\.groups\.1\.links\.1\.label/],
    ];
    for (const [mutate, expected] of cardinalityCases) {
      const invalid = structuredClone(fallback);
      mutate(invalid.content);
      await writeFile(localePath, JSON.stringify(invalid));
      await expect(runStarterValidate(root, undefined, { outputDir: siteDir, json: true }))
        .rejects.toThrow(expected);
    }

    const emptyContent = structuredClone(fallback);
    emptyContent.content = {};
    await writeFile(localePath, JSON.stringify(emptyContent));
    await expect(runStarterValidate(root, undefined, { outputDir: siteDir, json: true }))
      .rejects.toThrow(/en: missing content\.nav\.ariaLabel/);
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
      status: "ready",
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
    vi.mocked(extractMatteGrid).mockImplementation(async (_source, outDir, options) => {
      await mkdir(outDir, { recursive: true });
      const items = Object.entries(options.mapping as Record<string, number>).map(([key, index]) => ({
        key, index, file: `${key}.png`, path: path.join(outDir, `${key}.png`),
        geometry: { cell: { row: 0, col: index, x: index * 10, y: 0, w: 10, h: 10 }, foreground: { x: 1, y: 1, w: 8, h: 8 }, normalized: { x: 2, y: 2, w: 60, h: 60, canvasWidth: 64, canvasHeight: 64, padding: 0 } },
        qa: { foregroundPixels: 64, foregroundRatio: 0.64, edgeTouchPixels: 0, edgeTouchRatio: 0, alphaThreshold: 16 },
      }));
      for (const item of items) await writeFile(item.path, item.key);
      return { sourceFile: "source.png", rows: 1, cols: 2, matteColor: [0, 255, 0], matteColorSource: "auto-sampled", items };
    });

    await runStarterAssetApply(root, "web-states", { outputDir: siteDir, order: "ord-grid-001", json: true });
    expect(await readFile(path.join(siteDir, "public/assets/states/welcome.png"), "utf8")).toBe("welcome");
    expect(await readFile(path.join(siteDir, "public/assets/states/empty.png"), "utf8")).toBe("empty");
    const assets = JSON.parse(await readFile(assetsPath, "utf8"));
    expect(assets.assets["web-states"].items.empty).toMatchObject({
      src: "/assets/states/empty.png", status: "ready", orderId: "ord-grid-001", versionId: "v1",
      qa: { foregroundRatio: 0.64 },
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
    vi.mocked(extractMatteGrid).mockRejectedValueOnce(new Error("alpha QA failed"));

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
    const items = Object.fromEntries(keys.map((key) => [key, { src: `/assets/states/${key}.png`, status: "ready" }]));
    await writeFile(assetsPath, JSON.stringify({ schemaVersion: "repochan.starter-assets.v1", assets: {
      "web-states": { kind: "bundle", status: "ready", items },
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
    expect(extractMatteGrid).not.toHaveBeenCalled();
    expect(await readFile(assetsPath)).toEqual(assetsBefore);
  });
});

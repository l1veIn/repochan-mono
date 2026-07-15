import { describe, expect, it } from "vitest";
import {
  projectStarterSiteConfig,
  validateStarterAssetState,
  validateStarterAssetsConfig,
  validateStarterContentRequirements,
  validateStarterManifest,
  validateStarterPresentationColors,
  validateStarterSiteConfig,
  type StarterAssetsConfig,
  type StarterLocaleContent,
  type StarterManifest,
  type StarterSiteConfig,
} from "./index.js";

const manifest: StarterManifest = {
  schemaVersion: "repochan.starter.v1",
  id: "minimal",
  name: "Minimal",
  tags: ["hero"],
  config: { site: "repochan/site.json", assets: "repochan/assets.json", i18nDir: "repochan/i18n" },
  content: { defaultLocale: "en", supportedLocales: ["en"], requiredPaths: ["content.hero.headline"] },
  assets: [{
    slot: "hero-composite",
    required: true,
    reference: "public/assets/hero-reference.webp",
    output: "public/assets/hero.webp",
    postprocess: [{ op: "compress", out: "public/assets/hero.webp" }],
  }],
};

const multiSectionManifest: StarterManifest = {
  ...manifest,
  capabilities: {
    sections: [
      {
        id: "hero",
        required: true,
        recipe: "hero-composite-live-copy",
        provenance: { type: "design-reference", reference: "public/assets/hero-reference.webp" },
        bakedLayers: ["L1", "L2"],
        liveLayers: ["L3", "L4"],
        canonicalViewport: { width: 1440, height: 900 },
        safeZones: [{ id: "live-copy", x: 0.05, y: 0.1, width: 0.45, height: 0.8 }],
        responsive: { mode: "recompose", notes: "Move copy above artwork at narrow widths." },
        assetSlots: ["hero-composite"],
        motion: ["ambient"],
      },
      {
        id: "capabilities",
        required: true,
        recipe: "feature-grid",
        provenance: { type: "html-first" },
        bakedLayers: [],
        liveLayers: ["L1", "L3", "L4"],
        canonicalViewport: { width: 1440, height: 900 },
        responsive: { mode: "reflow", notes: "Collapse the grid to one column." },
        motion: [],
      },
    ],
    transitions: [{
      from: "hero",
      to: "capabilities",
      kind: "motif-handoff",
      motif: "signal-line",
      direction: "down-right",
      anchors: { from: { x: 0.9, y: 0.85 }, to: { x: 0.1, y: 0.15 } },
      mobile: "Remove the diagonal seam and retain the motif as a section marker.",
    }],
  },
};

const site: StarterSiteConfig = {
  schemaVersion: "repochan.starter-site.v1",
  project: { name: "Fallback" },
  theme: { primary: "#111111", base: "#eeeeee", accents: ["#ff00ff"] },
  brand: { motifs: [], patterns: [] },
  locales: { default: "en", supported: ["en"] },
};

describe("starter v1", () => {
  it("validates a manifest and rejects unsafe paths", () => {
    expect(validateStarterManifest(manifest).id).toBe("minimal");
    expect(() => validateStarterManifest({ ...manifest, config: { ...manifest.config, site: "../site.json" } })).toThrow(/safe site-root-relative/);
  });

  it("validates a multi-section capability contract while accepting legacy omission", () => {
    expect(validateStarterManifest(manifest).capabilities).toBeUndefined();
    const validated = validateStarterManifest(multiSectionManifest);
    expect(validated.capabilities?.sections.map((section) => section.id)).toEqual(["hero", "capabilities"]);
    expect(validated.capabilities?.transitions[0]).toMatchObject({ from: "hero", to: "capabilities" });
  });

  it("rejects invalid section capability semantics", () => {
    const cases: Array<[string, (value: StarterManifest) => void, RegExp]> = [
      ["duplicate section", (value) => { value.capabilities!.sections[1].id = "hero"; }, /duplicate 'hero'/],
      ["duplicate baked layer", (value) => { value.capabilities!.sections[0].bakedLayers.push("L1"); }, /duplicate 'L1'/],
      ["duplicate live layer", (value) => { value.capabilities!.sections[0].liveLayers.push("L3"); }, /duplicate 'L3'/],
      ["unknown asset slot", (value) => { value.capabilities!.sections[0].assetSlots = ["missing-slot"]; }, /unknown asset slot 'missing-slot'/],
      ["duplicate asset slot", (value) => { value.capabilities!.sections[0].assetSlots!.push("hero-composite"); }, /duplicate 'hero-composite'/],
      ["baked and live overlap", (value) => { value.capabilities!.sections[0].bakedLayers.push("L3"); }, /cannot be both baked and live/],
      ["whole and partial L1 overlap", (value) => {
        value.capabilities!.sections[0].bakedLayers = ["L1"];
        value.capabilities!.sections[0].liveLayers = ["L1b", "L3", "L4"];
      }, /cannot be both baked and live/],
      ["interactive layer baked", (value) => {
        value.capabilities!.sections[0].liveLayers = ["L3"];
        value.capabilities!.sections[0].bakedLayers.push("L4");
      }, /L4 interaction must remain live/],
      ["empty layer contract", (value) => {
        value.capabilities!.sections[1].bakedLayers = [];
        value.capabilities!.sections[1].liveLayers = [];
      }, /at least one baked or live layer/],
      ["safe zone outside bounds", (value) => { value.capabilities!.sections[0].safeZones![0].width = 0.96; }, /fit inside normalized bounds/],
      ["duplicate safe zone", (value) => {
        value.capabilities!.sections[0].safeZones!.push(structuredClone(value.capabilities!.sections[0].safeZones![0]));
      }, /duplicate 'live-copy'/],
      ["duplicate motion", (value) => { value.capabilities!.sections[0].motion.push("ambient"); }, /duplicate 'ambient'/],
      ["unsafe design reference", (value) => {
        const provenance = value.capabilities!.sections[0].provenance;
        if (provenance.type === "design-reference") provenance.reference = "../reference.webp";
      }, /safe site-root-relative/],
      ["undeclared section state", (value) => {
        Object.assign(value.capabilities!.sections[0], { status: "approved" });
      }, /starter\.manifest/],
    ];
    for (const [, mutate, expected] of cases) {
      const invalid = structuredClone(multiSectionManifest);
      mutate(invalid);
      expect(() => validateStarterManifest(invalid)).toThrow(expected);
    }
  });

  it("requires exactly one transition for each adjacent section pair", () => {
    const missing = structuredClone(multiSectionManifest);
    missing.capabilities!.transitions = [];
    expect(() => validateStarterManifest(missing)).toThrow(/expected hero->capabilities/);

    const wrongOrder = structuredClone(multiSectionManifest);
    wrongOrder.capabilities!.transitions[0] = {
      ...wrongOrder.capabilities!.transitions[0],
      from: "capabilities",
      to: "hero",
    };
    expect(() => validateStarterManifest(wrongOrder)).toThrow(/cover each adjacent section exactly once/);

    const duplicate = structuredClone(multiSectionManifest);
    duplicate.capabilities!.transitions.push(structuredClone(duplicate.capabilities!.transitions[0]));
    expect(() => validateStarterManifest(duplicate)).toThrow(/duplicate 'hero->capabilities'/);
  });

  it("requires transition-kind-specific continuity data", () => {
    const missingMotif = structuredClone(multiSectionManifest);
    delete missingMotif.capabilities!.transitions[0].motif;
    expect(() => validateStarterManifest(missingMotif)).toThrow(/motif-handoff requires motif/);

    const missingHandoff = structuredClone(multiSectionManifest);
    delete missingHandoff.capabilities!.transitions[0].direction;
    delete missingHandoff.capabilities!.transitions[0].anchors;
    expect(() => validateStarterManifest(missingHandoff)).toThrow(/requires direction or normalized anchors/);

    const continuous = structuredClone(multiSectionManifest);
    continuous.capabilities!.transitions[0].kind = "continuous";
    delete continuous.capabilities!.transitions[0].motif;
    delete continuous.capabilities!.transitions[0].direction;
    expect(validateStarterManifest(continuous).capabilities?.transitions[0].kind).toBe("continuous");
    delete continuous.capabilities!.transitions[0].anchors;
    expect(() => validateStarterManifest(continuous)).toThrow(/continuous requires normalized anchors/);

    const hardCut = structuredClone(multiSectionManifest);
    hardCut.capabilities!.transitions[0].kind = "hard-cut";
    delete hardCut.capabilities!.transitions[0].motif;
    delete hardCut.capabilities!.transitions[0].direction;
    delete hardCut.capabilities!.transitions[0].anchors;
    expect(validateStarterManifest(hardCut).capabilities?.transitions[0].kind).toBe("hard-cut");
    hardCut.capabilities!.transitions[0].motif = "stray-motif";
    expect(() => validateStarterManifest(hardCut)).toThrow(/hard-cut cannot declare/);
  });

  it("requires final postprocess output to match the slot output", () => {
    const invalid = structuredClone(manifest);
    invalid.assets[0].postprocess![0].out = "public/assets/other.webp";
    expect(() => validateStarterManifest(invalid)).toThrow(/must match/);
  });

  it("requires publication keys to be lowercase hyphen-separated words", () => {
    for (const key of ["foo-", "foo--bar"]) {
      const invalid = structuredClone(manifest);
      invalid.assets = [{
        slot: "states",
        required: true,
        output: "public/foo.png",
        publications: [{ key, cell: 0, output: "public/foo.png" }],
        postprocess: [{ op: "extract-grid", out: "tmp/states", args: { rows: 1, cols: 1, normalize: { canvasSize: 32 } } }],
      }];
      expect(() => validateStarterManifest(invalid)).toThrow(/starter\.manifest/);
    }
  });

  it("rejects chaining after a multi-output postprocess", () => {
    const invalid = structuredClone(manifest);
    invalid.assets[0].postprocess = [
      { op: "slice", out: "public/assets/slices", args: { rows: 1, cols: 2 } },
      { op: "compress", out: "public/assets/hero.webp" },
    ];
    expect(() => validateStarterManifest(invalid)).toThrow(/multi-output postprocess 'slice' must be the final step/);
  });

  it("validates named extract-grid publications and their ready state", () => {
    const bundle: StarterManifest = {
      ...manifest,
      assets: [{
        slot: "web-states",
        required: true,
        output: "public/assets/states/welcome.png",
        publications: [
          { key: "welcome", cell: 0, output: "public/assets/states/welcome.png" },
          { key: "not-found", cell: 1, output: "public/assets/states/not-found.png" },
        ],
        postprocess: [{ op: "extract-grid", out: ".repochan-grid/web-states", args: {
          rows: 1,
          cols: 2,
          mapping: ["welcome", "not-found"],
          normalize: { canvasSize: 256, padding: 16 },
          qa: { maxEdgeTouchRatio: 0 },
        } }],
      }],
    };
    expect(validateStarterManifest(bundle).assets[0].publications).toHaveLength(2);
    const state: StarterAssetsConfig = {
      schemaVersion: "repochan.starter-assets.v1",
      assets: { "web-states": {
        src: "/assets/states/welcome.png",
        status: "ready",
        items: {
          welcome: { src: "/assets/states/welcome.png", status: "ready" },
          "not-found": { src: "/assets/states/not-found.png", status: "ready", qa: { foregroundRatio: 0.2 } },
        },
      } },
    };
    expect(validateStarterAssetState(bundle, state, [
      "public/assets/states/welcome.png",
      "public/assets/states/not-found.png",
    ])).toEqual([]);
    delete state.assets["web-states"].items!["not-found"];
    expect(validateStarterAssetState(bundle, state, ["public/assets/states/welcome.png"]))
      .toContain("web-states.not-found: missing publication state");

    const duplicate = structuredClone(bundle);
    duplicate.assets[0].publications![1].cell = 0;
    expect(() => validateStarterManifest(duplicate)).toThrow(/duplicate '0'/);
    const mismatch = structuredClone(bundle);
    mismatch.assets[0].postprocess![0].args!.mapping = ["not-found", "welcome"];
    expect(() => validateStarterManifest(mismatch)).toThrow(/mapping must exactly match/);
  });

  it("projects deterministic analysis and persona fields", () => {
    const projected = projectStarterSiteConfig({
      defaults: site,
      analysis: { context: { basic: { project_name: "Demo", repository_url: "https://example.test/repo" } } },
      persona: { mainColor: "#123456", accentColors: ["#abcdef"], keyMotifs: ["diamond"] },
    });
    expect(projected.project.name).toBe("Demo");
    expect(projected.theme.primary).toBe("#123456");
    expect(projected.theme.base).toBe("#eeeeee");
    expect(projected.brand.motifs).toEqual(["diamond"]);
  });

  it("projects repository URLs by override, analysis, origin fetch remote, then defaults", () => {
    const fromRemote = projectStarterSiteConfig({
      defaults: { ...site, project: { ...site.project, repositoryUrl: "https://example.test/default" } },
      analysis: { context: { basic: {}, git_profile: { remotes: [
        "upstream\thttps://github.com/elsewhere/upstream.git (fetch)",
        "origin\tgit@github.com:owner/repo.git (push)",
        "origin\tgit@github.com:owner/repo.git (fetch)",
      ] } } },
    });
    expect(fromRemote.project.repositoryUrl).toBe("https://github.com/owner/repo");
    expect(projectStarterSiteConfig({
      defaults: site,
      analysis: { context: { git_profile: { remotes: ["origin\thttps://github.com/https-owner/https-repo.git (fetch)"] } } },
    }).project.repositoryUrl).toBe("https://github.com/https-owner/https-repo");

    const fromAnalysis = projectStarterSiteConfig({
      defaults: site,
      analysis: { repositoryUrl: "https://example.test/analysis", context: { git_profile: { remotes: ["origin\thttps://github.com/owner/repo.git (fetch)"] } } },
      repositoryUrl: "https://example.test/override",
    });
    expect(fromAnalysis.project.repositoryUrl).toBe("https://example.test/override");
    expect(projectStarterSiteConfig({
      defaults: site,
      analysis: { repositoryUrl: "https://example.test/analysis", context: { git_profile: { remotes: ["origin\thttps://github.com/owner/repo.git (fetch)"] } } },
    }).project.repositoryUrl).toBe("https://example.test/analysis");
    expect(projectStarterSiteConfig({
      defaults: { ...site, project: { ...site.project, repositoryUrl: "https://example.test/default" } },
    }).project.repositoryUrl).toBe("https://example.test/default");
  });

  it("keeps theme colors compatible with the stable RGB token reader", () => {
    expect(validateStarterSiteConfig(site).theme.primary).toBe("#111111");
    expect(() => validateStarterSiteConfig({ ...site, theme: { ...site.theme, primary: "red" } })).toThrow();
  });

  it("validates content requirements and asset readiness", () => {
    const locale: StarterLocaleContent = {
      schemaVersion: "repochan.starter-content.v1",
      locale: "en",
      meta: { title: "Demo", description: "Demo" },
      content: { hero: { headline: "Hello" } },
    };
    expect(validateStarterContentRequirements(manifest, [locale])).toEqual([]);
    const assets: StarterAssetsConfig = {
      schemaVersion: "repochan.starter-assets.v1",
      assets: { "hero-composite": { src: "/assets/hero.webp", status: "ready" } },
    };
    expect(validateStarterAssetState(manifest, assets, ["public/assets/hero.webp"])).toEqual([]);
    expect(validateStarterAssetState(manifest, assets, [])).toContain("hero-composite: ready output does not exist: public/assets/hero.webp");
    assets.assets["hero-composite"].status = "pending";
    expect(validateStarterAssetState(manifest, assets, ["public/assets/hero.webp"])).toContain("hero-composite: required asset is not ready");
  });

  it("validates structured local-file provenance", () => {
    expect(validateStarterAssetsConfig({
      schemaVersion: "repochan.starter-assets.v1",
      assets: { hero: {
        src: "/assets/hero.webp",
        status: "ready",
        provenance: { kind: "local-file", sourcePath: "incoming/hero.webp", sha256: "a".repeat(64) },
      } },
    }).assets.hero.provenance?.kind).toBe("local-file");
    expect(() => validateStarterAssetsConfig({
      schemaVersion: "repochan.starter-assets.v1",
      assets: { hero: {
        src: "/assets/hero.webp",
        status: "ready",
        provenance: { kind: "local-file", sourcePath: "incoming/hero.webp", sha256: "not-a-hash" },
      } },
    })).toThrow(/sha256/);
  });

  it("finds hardcoded presentation colors but allows the theme config", () => {
    const violations = validateStarterPresentationColors([
      { path: "src/Hero.astro", content: ".hero { color: #fff; background: rgba(0, 0, 0, .5); border-color: rebeccapurple }" },
      { path: "repochan/site.json", content: JSON.stringify(site) },
    ]);
    expect(violations.map((item) => item.kind)).toEqual(["hex color", "numeric color function", "named CSS color"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  projectStarterSiteConfig,
  validateStarterAssetState,
  validateStarterAssetsConfig,
  validateStarterLocaleShape,
  validateStarterLocaleStructures,
  validateStarterManifest,
  validateStarterLocaleContent,
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
  previews: { desktop: "repochan/previews/desktop.png", mobile: "repochan/previews/mobile.png" },
  content: { defaultLocale: "en", supportedLocales: ["en", "zh"] },
  assets: [{
    kind: "scalar",
    slot: "hero-composite",
    required: true,
    reference: "public/assets/hero-reference.webp",
    output: "public/assets/hero.webp",
    postprocess: [{ op: "compress", out: "public/assets/hero.webp" }],
  }],
};

const site: StarterSiteConfig = {
  schemaVersion: "repochan.starter-site.v1",
  project: { name: "Fallback" },
  theme: { primary: "#111111", base: "#eeeeee", ink: "#111111", accents: ["#ff00ff"] },
  brand: { motifs: [], patterns: [] },
  locales: { default: "en", supported: ["en"] },
};

describe("starter v1", () => {
  it("validates a manifest and rejects unsafe paths", () => {
    expect(validateStarterManifest(manifest).id).toBe("minimal");
    expect(() => validateStarterManifest({ ...manifest, config: { ...manifest.config, site: "../site.json" } })).toThrow(/starter\.manifest/);
    expect(() => validateStarterManifest({
      ...manifest,
      previews: { ...manifest.previews!, desktop: "../desktop.png" },
    })).toThrow(/previews\.desktop must be a safe/);
  });

  it("rejects unknown fields in every fixed Starter config object", () => {
    expect(() => validateStarterManifest({
      ...manifest,
      content: { ...manifest.content, removedField: true },
    } as unknown)).toThrow(/additional properties/);
    expect(() => validateStarterManifest({
      ...manifest,
      assets: [{
        ...manifest.assets[0],
        order: {
          removedField: true,
          brief: { removedField: true },
          deliverables: [{ name: "hero", format: "webp", removedField: true }],
        },
      }],
    } as unknown)).toThrow(/additional properties/);
    expect(() => validateStarterSiteConfig({ ...site, removedField: true } as unknown)).toThrow(/additional properties/);
    expect(() => validateStarterSiteConfig({
      ...site,
      project: { ...site.project, removedField: true },
    } as unknown)).toThrow(/additional properties/);
    const locale = {
      schemaVersion: "repochan.starter-content.v1",
      locale: "en",
      meta: { title: "Demo", description: "Demo", removedField: true },
      content: {},
    };
    expect(() => validateStarterLocaleContent(locale)).toThrow(/additional properties/);
    expect(() => validateStarterLocaleContent({ ...locale, meta: { title: "Demo", description: "Demo" }, removedField: true })).toThrow(/additional properties/);
  });

  it("requires final postprocess output to match the slot output", () => {
    const invalid = structuredClone(manifest);
    invalid.assets[0].postprocess![0].out = "public/assets/other.webp";
    expect(() => validateStarterManifest(invalid)).toThrow(/must match/);
  });

  it("enforces canonical asset discriminants and config paths", () => {
    const scalarWithPublications = structuredClone(manifest) as unknown as any;
    scalarWithPublications.assets[0].publications = [{ key: "hero", cell: 0, output: "public/assets/hero.png" }];
    expect(() => validateStarterManifest(scalarWithPublications)).toThrow(/starter\.manifest/);

    const bundleWithOutput = structuredClone(manifest) as unknown as any;
    bundleWithOutput.assets = [{
      kind: "bundle",
      slot: "states",
      required: true,
      output: "public/assets/state.png",
      publications: [{ key: "state", cell: 0, output: "public/assets/state.png" }],
      postprocess: [{ op: "extract-grid", out: ".repochan-grid/states", args: { rows: 1, cols: 1, normalize: { canvasSize: 32 } } }],
    }];
    expect(() => validateStarterManifest(bundleWithOutput)).toThrow(/starter\.manifest/);

    const nonCanonicalConfig = structuredClone(manifest) as unknown as any;
    nonCanonicalConfig.config.site = "config/site.json";
    expect(() => validateStarterManifest(nonCanonicalConfig)).toThrow(/starter\.manifest/);
  });

  it("requires publication keys to be lowercase hyphen-separated words", () => {
    for (const key of ["foo-", "foo--bar"]) {
      const invalid = structuredClone(manifest);
      invalid.assets = [{
        kind: "bundle",
        slot: "states",
        required: true,
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

  it("validates named extract-grid publications and their source state", () => {
    const bundle: StarterManifest = {
      ...manifest,
      assets: [{
        kind: "bundle",
        slot: "web-states",
        required: true,
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
    const validatedBundle = validateStarterManifest(bundle).assets[0];
    expect(validatedBundle.kind === "bundle" ? validatedBundle.publications : []).toHaveLength(2);
    const state: StarterAssetsConfig = {
      schemaVersion: "repochan.starter-assets.v1",
      assets: { "web-states": {
        kind: "bundle",
        status: "source",
        items: {
          welcome: { src: "/assets/states/welcome.png", status: "source" },
          "not-found": { src: "/assets/states/not-found.png", status: "source", qa: { foregroundRatio: 0.2 } },
        },
      } },
    };
    expect(validateStarterAssetState(bundle, state, [
      "public/assets/states/welcome.png",
      "public/assets/states/not-found.png",
    ])).toEqual([]);
    const bundleState = state.assets["web-states"];
    if (bundleState.kind === "bundle") delete bundleState.items["not-found"];
    expect(validateStarterAssetState(bundle, state, ["public/assets/states/welcome.png"]))
      .toContain("web-states.not-found: missing publication state");

    const duplicate = structuredClone(bundle);
    if (duplicate.assets[0].kind === "bundle") duplicate.assets[0].publications[1].cell = 0;
    expect(() => validateStarterManifest(duplicate)).toThrow(/duplicate '0'/);
    const mismatch = structuredClone(bundle);
    mismatch.assets[0].postprocess![0].args!.mapping = ["not-found", "welcome"];
    expect(() => validateStarterManifest(mismatch)).toThrow(/mapping must exactly match/);
  });

  describe("extract-grid args validation (PR5)", () => {
    const gridManifest = (args: Record<string, unknown>, format: "png" | "webp" = "png"): StarterManifest => {
      const cellCount = Number(args.rows) * Number(args.cols);
      const keys = ["welcome", "searching", "loading", "empty", "error", "success", "not-found", "cta", "cozy"].slice(0, cellCount);
      return {
        ...manifest,
        assets: [{
          kind: "bundle",
          slot: "web-states",
          required: true,
          publications: keys.map((key, cell) => ({ key, cell, output: `public/assets/states/${key}.${format}` })),
          postprocess: [{ op: "extract-grid", out: ".repochan-grid/web-states", args }],
        }],
      };
    };
    const baseArgs = { rows: 1, cols: 2, normalize: { canvasSize: 64 } };

    it("accepts the canary chroma-grid + v2 config from the design doc", () => {
      const canary = gridManifest({
        rows: 3,
        cols: 3,
        strategy: "chroma-grid",
        chroma: { pipeline: "v2", matteColor: "auto", matteSelect: "subject-aware" },
        geometry: { mode: "centroid-components" },
        normalize: { canvasSize: 256, padding: 16 },
        qa: { minForegroundRatio: 0.005, maxForegroundRatio: 0.8, maxSheetEdgeTouchRatio: 0 },
        format: "webp",
        quality: 80,
      }, "webp");
      expect(validateStarterManifest(canary).assets[0].slot).toBe("web-states");
    });

    it("accepts a legal hybrid config and legacy equal-cell defaults", () => {
      expect(validateStarterManifest(gridManifest(baseArgs)).assets[0].kind).toBe("bundle");
      expect(validateStarterManifest(gridManifest({
        ...baseArgs,
        strategy: "equal-cell",
        geometry: { mode: "equal-cell" },
        chroma: { pipeline: "v1", threshold: 28, softness: 34, spillSuppression: 0.85 },
      })).assets[0].kind).toBe("bundle");
      expect(validateStarterManifest(gridManifest({
        ...baseArgs,
        strategy: "hybrid",
        geometry: { mode: "centroid-components", debrisFraction: 0.3, minBlobFraction: 0.005, noiseMinAbs: 60, mergedSpanFactor: 1.5, debrisBorderTolPx: 2 },
        qa: { residueMaxFraction: 0.001, residueEdgeDepthPx: 2 },
        hybrid: { mlFallback: true, model: "medium", mlCrop: "dilated-seed", dilateFraction: 0.2 },
      })).assets[0].kind).toBe("bundle");
    });

    it("rejects an unknown strategy enum value", () => {
      expect(() => validateStarterManifest(gridManifest({ ...baseArgs, strategy: "magic-grid" })))
        .toThrow(/\.strategy must be 'equal-cell' \| 'chroma-grid' \| 'ml-blobs' \| 'hybrid'/);
    });

    it("rejects strategy/geometry.mode pairings forbidden by design §3", () => {
      for (const strategy of ["chroma-grid", "hybrid"]) {
        const hybrid = strategy === "hybrid" ? { hybrid: { mlFallback: true } } : {};
        expect(() => validateStarterManifest(gridManifest({ ...baseArgs, strategy, geometry: { mode: "equal-cell" }, ...hybrid })))
          .toThrow(new RegExp(`geometry\\.mode 'equal-cell' is incompatible with strategy '${strategy}'`));
      }
      expect(() => validateStarterManifest(gridManifest({ ...baseArgs, geometry: { mode: "centroid-components" } })))
        .toThrow(/geometry\.mode 'centroid-components' is incompatible with strategy 'equal-cell'/);
      expect(() => validateStarterManifest(gridManifest({ ...baseArgs, strategy: "ml-blobs", geometry: { mode: "centroid-components" } })))
        .toThrow(/geometry is not applicable to strategy 'ml-blobs'/);
      expect(() => validateStarterManifest(gridManifest({ ...baseArgs, geometry: { mode: "magic" } })))
        .toThrow(/geometry\.mode must be 'equal-cell' \| 'centroid-components'/);
    });

    it("rejects hybrid without mlFallback === true (design §7)", () => {
      expect(() => validateStarterManifest(gridManifest({ ...baseArgs, strategy: "hybrid" })))
        .toThrow(/hybrid\.mlFallback must be true when strategy is 'hybrid'/);
      expect(() => validateStarterManifest(gridManifest({ ...baseArgs, strategy: "hybrid", hybrid: { mlFallback: false } })))
        .toThrow(/hybrid\.mlFallback must be true when strategy is 'hybrid'/);
      expect(() => validateStarterManifest(gridManifest({ ...baseArgs, strategy: "hybrid", hybrid: { mlCrop: "seed-cell" } })))
        .toThrow(/hybrid\.mlFallback must be true when strategy is 'hybrid'/);
    });

    it("rejects out-of-range geometry numeric keys", () => {
      const withGeometry = (geometry: Record<string, unknown>) => gridManifest({ ...baseArgs, strategy: "chroma-grid", geometry: { mode: "centroid-components", ...geometry } });
      expect(() => validateStarterManifest(withGeometry({ debrisFraction: 1.5 }))).toThrow(/geometry\.debrisFraction must be between 0 and 1/);
      expect(() => validateStarterManifest(withGeometry({ minBlobFraction: -0.1 }))).toThrow(/geometry\.minBlobFraction must be between 0 and 1/);
      expect(() => validateStarterManifest(withGeometry({ noiseMinAbs: -1 }))).toThrow(/geometry\.noiseMinAbs must be a non-negative integer/);
      expect(() => validateStarterManifest(withGeometry({ noiseMinAbs: 1.5 }))).toThrow(/geometry\.noiseMinAbs must be a non-negative integer/);
      expect(() => validateStarterManifest(withGeometry({ debrisBorderTolPx: 0.5 }))).toThrow(/geometry\.debrisBorderTolPx must be a non-negative integer/);
      expect(() => validateStarterManifest(withGeometry({ mergedSpanFactor: 0.5 }))).toThrow(/geometry\.mergedSpanFactor must be a number >= 1/);
    });

    it("rejects illegal chroma keys", () => {
      const withChroma = (chroma: Record<string, unknown>) => gridManifest({ ...baseArgs, chroma });
      expect(() => validateStarterManifest(withChroma({ pipeline: "v3" }))).toThrow(/chroma\.pipeline must be 'v1' \| 'v2'/);
      expect(() => validateStarterManifest(withChroma({ matteSelect: "smart" }))).toThrow(/chroma\.matteSelect must be 'corner' \| 'subject-aware'/);
      expect(() => validateStarterManifest(withChroma({ threshold: -1 }))).toThrow(/chroma\.threshold must be a number >= 0/);
      expect(() => validateStarterManifest(withChroma({ softness: "soft" }))).toThrow(/chroma\.softness must be a number >= 0/);
      expect(() => validateStarterManifest(withChroma({ fringeThreshold: -2 }))).toThrow(/chroma\.fringeThreshold must be a number >= 0/);
      expect(() => validateStarterManifest(withChroma({ fringeDelta: -3 }))).toThrow(/chroma\.fringeDelta must be a number >= 0/);
      expect(() => validateStarterManifest(withChroma({ unmixReach: 33 }))).toThrow(/chroma\.unmixReach must be an integer from 0 to 32/);
      expect(() => validateStarterManifest(withChroma({ unmixReach: 1.5 }))).toThrow(/chroma\.unmixReach must be an integer from 0 to 32/);
      expect(() => validateStarterManifest(withChroma({ spillMaxFraction: 2 }))).toThrow(/chroma\.spillMaxFraction must be between 0 and 1/);
      expect(() => validateStarterManifest(withChroma({ spillSuppression: -0.1 }))).toThrow(/chroma\.spillSuppression must be between 0 and 1/);
    });

    it("rejects out-of-range qa residue and sheet-edge keys", () => {
      const withQa = (qa: Record<string, unknown>) => gridManifest({ ...baseArgs, qa });
      expect(() => validateStarterManifest(withQa({ maxSheetEdgeTouchRatio: 1.5 }))).toThrow(/qa\.maxSheetEdgeTouchRatio must be between 0 and 1/);
      expect(() => validateStarterManifest(withQa({ residueMaxFraction: -0.5 }))).toThrow(/qa\.residueMaxFraction must be between 0 and 1/);
      expect(() => validateStarterManifest(withQa({ residueEdgeDepthPx: 9 }))).toThrow(/qa\.residueEdgeDepthPx must be an integer from 0 to 8/);
      expect(() => validateStarterManifest(withQa({ residueEdgeDepthPx: 0.5 }))).toThrow(/qa\.residueEdgeDepthPx must be an integer from 0 to 8/);
    });

    it("rejects illegal hybrid policy keys", () => {
      const withHybrid = (hybrid: Record<string, unknown>) => gridManifest({ ...baseArgs, strategy: "chroma-grid", hybrid });
      expect(() => validateStarterManifest(withHybrid({ mlFallback: "yes" }))).toThrow(/hybrid\.mlFallback must be a boolean/);
      expect(() => validateStarterManifest(withHybrid({ model: "huge" }))).toThrow(/hybrid\.model must be 'small' \| 'medium' \| 'large'/);
      expect(() => validateStarterManifest(withHybrid({ mlCrop: "whole" }))).toThrow(/hybrid\.mlCrop must be 'seed-cell' \| 'dilated-seed' \| 'source-bounds'/);
      expect(() => validateStarterManifest(withHybrid({ dilateFraction: 2 }))).toThrow(/hybrid\.dilateFraction must be between 0 and 1/);
    });

    it("still allows unknown keys in extract-grid args and nested objects", () => {
      expect(validateStarterManifest(gridManifest({
        ...baseArgs,
        futureFlag: true,
        chroma: { matteColor: "auto", futureChroma: 1 },
        geometry: { futureGeo: 2 },
        qa: { futureQa: 3 },
        hybrid: { mlFallback: false, futureHybrid: 4 },
      })).assets[0].kind).toBe("bundle");
    });
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
    expect(projected.theme.ink).toBe("#123456");
    expect(projected.brand.motifs).toEqual(["diamond"]);
  });

  it("derives a readable semantic ink color from the persona palette", () => {
    const projected = projectStarterSiteConfig({
      defaults: site,
      persona: {
        mainColor: "#06B6D4",
        secondaryColor: "#F5F0E8",
        accentColors: ["#1E3A5F", "#F59E0B"],
      },
    });
    expect(projected.theme).toEqual({
      primary: "#06B6D4",
      base: "#F5F0E8",
      ink: "#1E3A5F",
      accents: ["#1E3A5F", "#F59E0B"],
    });
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

  it("uses the RGB triples required by the stable token reader", () => {
    expect(validateStarterSiteConfig(site).theme.primary).toBe("#111111");
    expect(() => validateStarterSiteConfig({ ...site, theme: { ...site.theme, primary: "red" } })).toThrow();
  });

  it("validates complete locale structures and source/customized asset states", () => {
    const en: StarterLocaleContent = {
      schemaVersion: "repochan.starter-content.v1",
      locale: "en",
      meta: { title: "Demo", description: "Demo" },
      content: { hero: { headline: "Hello", actions: [{ label: "Start", href: "#start" }] } },
    };
    const zh: StarterLocaleContent = {
      ...structuredClone(en),
      locale: "zh",
      meta: { title: "演示", description: "演示" },
      content: { hero: { headline: "你好", actions: [{ label: "开始", href: "#start" }] } },
    };
    expect(validateStarterLocaleStructures(manifest, [en, zh])).toEqual([]);
    expect(validateStarterLocaleStructures(manifest, [en])).toContain("missing locale content: zh");
    const assets: StarterAssetsConfig = {
      schemaVersion: "repochan.starter-assets.v1",
      assets: { "hero-composite": { kind: "scalar", src: "/assets/hero.webp", status: "source" } },
    };
    expect(validateStarterAssetState(manifest, assets, ["public/assets/hero.webp"])).toEqual([]);
    expect(validateStarterAssetState(manifest, assets, [])).toContain("hero-composite: output does not exist: public/assets/hero.webp");
    expect(validateStarterAssetState(manifest, assets, ["public/assets/hero.webp"], { requireCustomized: true }))
      .toContain("hero-composite: required asset is still using the source asset");
    assets.assets["hero-composite"].status = "customized";
    expect(validateStarterAssetState(manifest, assets, ["public/assets/hero.webp"], { requireCustomized: true })).toEqual([]);
  });

  it("uses full recursive locale shape instead of duplicated required paths", () => {
    const expected: StarterLocaleContent = {
      schemaVersion: "repochan.starter-content.v1",
      locale: "en",
      meta: { title: "Demo", description: "Demo" },
      content: { cards: [{ title: "One", href: "#one" }, { title: "Two", href: "#two" }] },
    };
    expect(validateStarterLocaleShape(expected, { ...expected, locale: "zh" })).toEqual([]);
    expect(validateStarterLocaleShape(expected, { ...expected, content: { cards: [] } }))
      .toContain("content.cards: expected 2 items, received 0");
    expect(validateStarterLocaleShape(expected, { ...expected, content: { cards: [{ title: "One" }, { title: "Two", href: 2 }] } }))
      .toEqual(expect.arrayContaining([
        "content.cards.0: missing key href",
        "content.cards.1.href: expected string, received number",
      ]));
  });

  it("validates structured local-file provenance", () => {
    expect(validateStarterAssetsConfig({
      schemaVersion: "repochan.starter-assets.v1",
      assets: { hero: {
        kind: "scalar",
        src: "/assets/hero.webp",
        status: "customized",
        provenance: { kind: "local-file", sourcePath: "incoming/hero.webp", sha256: "a".repeat(64) },
      } },
    }).assets.hero.provenance?.kind).toBe("local-file");
    expect(() => validateStarterAssetsConfig({
      schemaVersion: "repochan.starter-assets.v1",
      assets: { hero: {
        kind: "scalar",
        src: "/assets/hero.webp",
        status: "customized",
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

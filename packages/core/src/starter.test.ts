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
  theme: { primary: "#111111", base: "#eeeeee", accents: ["#ff00ff"] },
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

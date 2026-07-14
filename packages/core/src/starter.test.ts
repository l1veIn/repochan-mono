import { describe, expect, it } from "vitest";
import {
  projectStarterSiteConfig,
  validateStarterAssetState,
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

  it("requires final postprocess output to match the slot output", () => {
    const invalid = structuredClone(manifest);
    invalid.assets[0].postprocess![0].out = "public/assets/other.webp";
    expect(() => validateStarterManifest(invalid)).toThrow(/must match/);
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

  it("finds hardcoded presentation colors but allows the theme config", () => {
    const violations = validateStarterPresentationColors([
      { path: "src/Hero.astro", content: ".hero { color: #fff; background: rgba(0, 0, 0, .5); border-color: rebeccapurple }" },
      { path: "repochan/site.json", content: JSON.stringify(site) },
    ]);
    expect(violations.map((item) => item.kind)).toEqual(["hex color", "numeric color function", "named CSS color"]);
  });
});

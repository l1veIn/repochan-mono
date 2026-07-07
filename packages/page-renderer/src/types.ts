/**
 * Renderer-specific types.
 *
 * PageData, PageSection, PageTheme, AssetRef are imported from @repochan/core
 * — the renderer is a pure consumer of core's types.
 */
import type { AssetRef } from "@repochan/core";

export type { PageData, PageSection, PageTheme, AssetRef } from "@repochan/core";

/** Result of rendering a page. */
export type RenderResult = {
  /** Complete HTML document string. */
  html: string;
  /** Inline CSS (goes inside a <style> tag in the HTML head). */
  css: string;
  /** Asset files that need to be copied to the output directory. */
  assets: Array<{
    /** Absolute source path in .repochan/orders/. */
    source: string;
    /** Relative path in the output directory, e.g. "assets/hero.png". */
    destination: string;
  }>;
};

/** Resolve an AssetRef to the relative path emitted in the rendered HTML. */
export type AssetPathResolver = (ref: AssetRef) => string;

/** CSS variables generated from a PageTheme. */
export type ThemeCSSVars = Record<string, string>;

import type { PageSection } from "@repochan/core";
import type { AssetPathResolver } from "../types.js";
import { renderNavbarSimple, renderNavbarWithCta } from "./navbar.js";
import {
  renderHeroCentered,
  renderHeroSplitRight,
  renderHeroSplitLeft,
  renderHeroFullBg,
} from "./hero.js";
import {
  renderFeaturesGrid2,
  renderFeaturesGrid3,
  renderFeaturesGrid4,
} from "./features.js";
import { renderStatsRow, renderStatsGrid } from "./stats.js";
import { renderGalleryGrid, renderGalleryMasonry } from "./gallery.js";
import { renderCtaCentered, renderCtaBanner } from "./cta.js";
import { renderFooterStandard, renderFooterMinimal } from "./footer.js";

/**
 * Dispatch a section to its template function based on type+variant.
 * Returns the rendered HTML string, or empty string for unknown combos.
 */
export function renderSection(section: PageSection, resolveAsset?: AssetPathResolver): string {
  switch (section.type) {
    case "navbar":
      switch (section.variant) {
        case "simple":   return renderNavbarSimple(section.content);
        case "with-cta": return renderNavbarWithCta(section.content);
      }
      break;

    case "hero":
      switch (section.variant) {
        case "centered":   return renderHeroCentered(section.content, resolveAsset);
        case "split-right": return renderHeroSplitRight(section.content, resolveAsset);
        case "split-left":  return renderHeroSplitLeft(section.content, resolveAsset);
        case "full-bg":     return renderHeroFullBg(section.content, resolveAsset);
      }
      break;

    case "features":
      switch (section.variant) {
        case "grid-2": return renderFeaturesGrid2(section.content, resolveAsset);
        case "grid-3": return renderFeaturesGrid3(section.content, resolveAsset);
        case "grid-4": return renderFeaturesGrid4(section.content, resolveAsset);
      }
      break;

    case "stats":
      switch (section.variant) {
        case "row":  return renderStatsRow(section.content);
        case "grid": return renderStatsGrid(section.content);
      }
      break;

    case "gallery":
      switch (section.variant) {
        case "grid":    return renderGalleryGrid(section.content, resolveAsset);
        case "masonry": return renderGalleryMasonry(section.content, resolveAsset);
      }
      break;

    case "cta":
      switch (section.variant) {
        case "centered": return renderCtaCentered(section.content);
        case "banner":   return renderCtaBanner(section.content);
      }
      break;

    case "footer":
      switch (section.variant) {
        case "standard": return renderFooterStandard(section.content, resolveAsset);
        case "minimal":  return renderFooterMinimal(section.content);
      }
      break;
  }
  return "";
}

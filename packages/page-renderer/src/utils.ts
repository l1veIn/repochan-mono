import type { AssetRef } from "@repochan/core";
import type { AssetPathResolver } from "./types.js";

/** HTML-escape a string for safe insertion into HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Escape a href for safe attribute insertion. */
export function safeHref(href: string): string {
  return href.replace(/"/g, "&quot;");
}

/**
 * Resolve an AssetRef to a relative path for use in <img src>.
 * Assets are copied to `assets/<filename>` in the output directory.
 */
export function resolveAssetPath(ref: AssetRef): string {
  return `assets/${ref.file}`;
}

/** Render an <img> tag from an AssetRef. */
export function renderImg(ref: AssetRef, classes?: string, resolveAsset?: AssetPathResolver): string {
  const cls = classes ?? "";
  const alt = ref.alt ? escapeHtml(ref.alt) : "";
  const src = resolveAsset ? resolveAsset(ref) : resolveAssetPath(ref);
  return `<img src="${safeHref(src)}" alt="${alt}" class="${cls}" loading="lazy" />`;
}

/** Render a link safely. */
export function renderLink(label: string, href: string, classes?: string): string {
  return `<a href="${safeHref(href)}" class="${classes ?? ""}">${escapeHtml(label)}</a>`;
}

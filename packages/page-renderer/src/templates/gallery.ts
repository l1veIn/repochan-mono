import type { GalleryContent } from "@repochan/core";
import type { AssetPathResolver } from "../types.js";
import { escapeHtml, renderImg } from "../utils.js";

export function renderGalleryGrid(content: GalleryContent, resolveAsset?: AssetPathResolver): string {
  const heading = content.heading
    ? `<h2 class="text-3xl font-bold text-center text-[var(--color-text)] mb-12">${escapeHtml(content.heading)}</h2>`
    : "";

  const images = content.images.map((ref) => `
          <div class="overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow)]">
            ${renderImg(ref, "w-full h-64 object-cover transition-transform hover:scale-105", resolveAsset)}
          </div>`).join("\n");

  return `
      <section class="bg-[var(--color-background)]" style="padding-top: var(--section-spacing); padding-bottom: var(--section-spacing);">
        <div class="container mx-auto px-6">
          ${heading}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
${images}
          </div>
        </div>
      </section>`;
}

export function renderGalleryMasonry(content: GalleryContent, resolveAsset?: AssetPathResolver): string {
  const heading = content.heading
    ? `<h2 class="text-3xl font-bold text-center text-[var(--color-text)] mb-12">${escapeHtml(content.heading)}</h2>`
    : "";

  const images = content.images.map((ref) => `
        <div class="break-inside-avoid mb-6 overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow)]">
          ${renderImg(ref, "w-full h-auto", resolveAsset)}
        </div>`).join("\n");

  return `
      <section class="bg-[var(--color-background)]" style="padding-top: var(--section-spacing); padding-bottom: var(--section-spacing);">
        <div class="container mx-auto px-6">
          ${heading}
          <div class="columns-1 md:columns-2 lg:columns-3 gap-6">
${images}
          </div>
        </div>
      </section>`;
}

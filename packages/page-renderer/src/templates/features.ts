import type { FeaturesContent } from "@repochan/core";
import { escapeHtml, renderImg } from "../utils.js";

function renderFeaturesGrid(content: FeaturesContent, cols: 2 | 3 | 4): string {
  const heading = content.heading
    ? `<h2 class="text-3xl font-bold text-center text-[var(--color-text)] mb-4">${escapeHtml(content.heading)}</h2>`
    : "";
  const subheading = content.subheading
    ? `<p class="text-center text-[var(--color-text-muted)] mb-12 max-w-2xl mx-auto">${escapeHtml(content.subheading)}</p>`
    : "";

  const gridCols = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4" }[cols];

  const items = content.items.map((item) => {
    const icon = item.icon
      ? `<div class="text-4xl mb-4">${escapeHtml(item.icon)}</div>`
      : item.image
        ? `<div class="mb-4">${renderImg(item.image, "w-12 h-12")}</div>`
        : "";
    return `
          <div class="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow)] p-6 text-center" style="border: 1px solid var(--color-border);">
            ${icon}
            <h3 class="text-xl font-semibold text-[var(--color-text)]">${escapeHtml(item.title)}</h3>
            <p class="mt-2 text-[var(--color-text-muted)]">${escapeHtml(item.description)}</p>
          </div>`;
  }).join("\n");

  return `
      <section class="bg-[var(--color-surface)]" style="padding-top: var(--section-spacing); padding-bottom: var(--section-spacing);">
        <div class="container mx-auto px-6">
          ${heading}
          ${subheading}
          <div class="grid grid-cols-1 ${gridCols} gap-6">
${items}
          </div>
        </div>
      </section>`;
}

export function renderFeaturesGrid2(content: FeaturesContent): string {
  return renderFeaturesGrid(content, 2);
}
export function renderFeaturesGrid3(content: FeaturesContent): string {
  return renderFeaturesGrid(content, 3);
}
export function renderFeaturesGrid4(content: FeaturesContent): string {
  return renderFeaturesGrid(content, 4);
}

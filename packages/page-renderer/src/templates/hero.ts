import type { HeroContent } from "@repochan/core";
import { escapeHtml, safeHref, renderImg } from "../utils.js";

type HeroCta = { label?: string; href?: string } | undefined;

const BTN_PRIMARY = (c: HeroCta) =>
  c?.label && c.href
    ? `<a href="${safeHref(c.href)}" class="px-6 py-3 rounded-[var(--radius)] font-medium text-white transition-colors" style="background-color: var(--color-primary);">${escapeHtml(c.label)}</a>`
    : "";

const BTN_SECONDARY = (c: HeroCta) =>
  c?.label && c.href
    ? `<a href="${safeHref(c.href)}" class="px-6 py-3 rounded-[var(--radius)] font-medium border border-[var(--color-border)] text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface)]">${escapeHtml(c.label)}</a>`
    : "";

const BTN_SECONDARY_LIGHT = (c: HeroCta) =>
  c?.label && c.href
    ? `<a href="${safeHref(c.href)}" class="px-6 py-3 rounded-[var(--radius)] font-medium border border-white/30 text-white transition-colors hover:bg-white/10">${escapeHtml(c.label)}</a>`
    : "";

export function renderHeroCentered(content: HeroContent): string {
  const img = content.image
    ? `<div class="mt-12 max-w-2xl mx-auto">${renderImg(content.image, "rounded-[var(--radius-lg)] shadow-lg w-full")}</div>`
    : "";

  return `
      <section class="bg-[var(--color-background)]" style="padding-top: var(--section-spacing); padding-bottom: var(--section-spacing);">
        <div class="container mx-auto px-6 text-center">
          <h1 class="text-4xl md:text-6xl font-bold tracking-tight text-[var(--color-text)] max-w-4xl mx-auto">${escapeHtml(content.headline ?? "")}</h1>
          <p class="mt-6 text-lg text-[var(--color-text-muted)] max-w-2xl mx-auto">${escapeHtml(content.subheadline ?? "")}</p>
          <div class="mt-8 flex flex-wrap gap-4 justify-center">
            ${BTN_PRIMARY(content.primaryCta)}
            ${content.secondaryCta ? BTN_SECONDARY(content.secondaryCta) : ""}
          </div>
          ${img}
        </div>
      </section>`;
}

export function renderHeroSplitRight(content: HeroContent): string {
  const img = content.image
    ? `<div class="lg:w-1/2 flex items-center justify-center">${renderImg(content.image, "rounded-[var(--radius-lg)] shadow-lg max-w-full h-auto")}</div>`
    : "";

  return `
      <section class="bg-[var(--color-background)]" style="padding-top: var(--section-spacing); padding-bottom: var(--section-spacing);">
        <div class="container mx-auto px-6">
          <div class="flex flex-col lg:flex-row items-center gap-12">
            <div class="lg:w-1/2 text-center lg:text-left">
              <h1 class="text-4xl md:text-5xl font-bold tracking-tight text-[var(--color-text)]">${escapeHtml(content.headline ?? "")}</h1>
              <p class="mt-6 text-lg text-[var(--color-text-muted)]">${escapeHtml(content.subheadline ?? "")}</p>
              <div class="mt-8 flex flex-wrap gap-4 justify-center lg:justify-start">
                ${BTN_PRIMARY(content.primaryCta)}
                ${content.secondaryCta ? BTN_SECONDARY(content.secondaryCta) : ""}
              </div>
            </div>
            ${img}
          </div>
        </div>
      </section>`;
}

export function renderHeroSplitLeft(content: HeroContent): string {
  const img = content.image
    ? `<div class="lg:w-1/2 flex items-center justify-center">${renderImg(content.image, "rounded-[var(--radius-lg)] shadow-lg max-w-full h-auto")}</div>`
    : "";

  return `
      <section class="bg-[var(--color-background)]" style="padding-top: var(--section-spacing); padding-bottom: var(--section-spacing);">
        <div class="container mx-auto px-6">
          <div class="flex flex-col lg:flex-row items-center gap-12">
            ${img}
            <div class="lg:w-1/2 text-center lg:text-left">
              <h1 class="text-4xl md:text-5xl font-bold tracking-tight text-[var(--color-text)]">${escapeHtml(content.headline ?? "")}</h1>
              <p class="mt-6 text-lg text-[var(--color-text-muted)]">${escapeHtml(content.subheadline ?? "")}</p>
              <div class="mt-8 flex flex-wrap gap-4 justify-center lg:justify-start">
                ${BTN_PRIMARY(content.primaryCta)}
                ${content.secondaryCta ? BTN_SECONDARY(content.secondaryCta) : ""}
              </div>
            </div>
          </div>
        </div>
      </section>`;
}

export function renderHeroFullBg(content: HeroContent): string {
  const bgImage = content.image ? `assets/${content.image.file}` : "";
  const bgStyle = bgImage ? `background-image: url('${bgImage}'); background-size: cover; background-position: center;` : "";
  const overlay = bgImage ? '<div class="absolute inset-0 bg-black/40"></div>' : "";

  return `
      <section class="relative flex items-center justify-center text-center" style="min-height: 60vh; ${bgStyle}">
        ${overlay}
        <div class="relative container mx-auto px-6 py-24">
          <h1 class="text-4xl md:text-6xl font-bold tracking-tight text-white">${escapeHtml(content.headline ?? "")}</h1>
          <p class="mt-6 text-lg text-gray-200 max-w-2xl mx-auto">${escapeHtml(content.subheadline ?? "")}</p>
          <div class="mt-8 flex flex-wrap gap-4 justify-center">
            ${BTN_PRIMARY(content.primaryCta)}
            ${content.secondaryCta ? BTN_SECONDARY_LIGHT(content.secondaryCta) : ""}
          </div>
        </div>
      </section>`;
}

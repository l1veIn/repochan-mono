import type { CtaContent } from "@repochan/core";
import { escapeHtml, safeHref } from "../utils.js";

export function renderCtaCentered(content: CtaContent): string {
  const sub = content.subheading
    ? `<p class="mt-4 text-lg text-[var(--color-text-muted)] max-w-2xl mx-auto">${escapeHtml(content.subheading)}</p>`
    : "";

  return `
      <section class="bg-[var(--color-background)]" style="padding-top: var(--section-spacing); padding-bottom: var(--section-spacing);">
        <div class="container mx-auto px-6 text-center">
          <h2 class="text-3xl md:text-4xl font-bold text-[var(--color-text)] max-w-2xl mx-auto">${escapeHtml(content.heading)}</h2>
          ${sub}
          <a href="${safeHref(content.buttonHref)}" class="inline-block mt-8 px-8 py-3 rounded-[var(--radius)] font-medium text-white transition-colors" style="background-color: var(--color-primary);">${escapeHtml(content.buttonText)}</a>
        </div>
      </section>`;
}

export function renderCtaBanner(content: CtaContent): string {
  const sub = content.subheading
    ? `<p class="mt-2 text-gray-300">${escapeHtml(content.subheading)}</p>`
    : "";

  return `
      <section class="pb-16">
        <div class="container mx-auto px-6">
          <div class="rounded-[var(--radius-lg)] shadow-[var(--shadow)] text-center py-16 px-6" style="background-color: var(--color-primary);">
            <h2 class="text-3xl md:text-4xl font-bold text-white">${escapeHtml(content.heading)}</h2>
            ${sub}
            <a href="${safeHref(content.buttonHref)}" class="inline-block mt-8 px-8 py-3 rounded-[var(--radius)] font-medium transition-colors bg-white" style="color: var(--color-primary);">${escapeHtml(content.buttonText)}</a>
          </div>
        </div>
      </section>`;
}

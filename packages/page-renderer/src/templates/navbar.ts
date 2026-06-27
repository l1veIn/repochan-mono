import type { NavbarContent } from "@repochan/core";
import { escapeHtml, safeHref, renderLink } from "../utils.js";

export function renderNavbarSimple(content: NavbarContent): string {
  const links = (content.links ?? [])
    .map((l) => renderLink(l.label, l.href, "text-gray-600 hover:text-[var(--color-primary)] dark:text-gray-300"))
    .join("\n            ");

  return `
      <nav class="bg-white/80 backdrop-blur-sm border-b border-[var(--color-border)] dark:bg-gray-900/80 sticky top-0 z-50">
        <div class="container mx-auto px-6 py-4 flex items-center justify-between">
          <a href="#" class="text-xl font-bold text-[var(--color-text)]">${escapeHtml(content.brand)}</a>
          <div class="hidden md:flex items-center gap-6">
            ${links}
          </div>
        </div>
      </nav>`;
}

export function renderNavbarWithCta(content: NavbarContent): string {
  const links = (content.links ?? [])
    .map((l) => renderLink(l.label, l.href, "text-gray-600 hover:text-[var(--color-primary)] dark:text-gray-300"))
    .join("\n            ");

  const cta = content.cta
    ? `<a href="${safeHref(content.cta.href)}" class="px-4 py-2 rounded-[var(--radius)] font-medium text-white transition-colors" style="background-color: var(--color-primary);">${escapeHtml(content.cta.label)}</a>`
    : "";

  return `
      <nav class="bg-white/80 backdrop-blur-sm border-b border-[var(--color-border)] dark:bg-gray-900/80 sticky top-0 z-50">
        <div class="container mx-auto px-6 py-4 flex items-center justify-between">
          <a href="#" class="text-xl font-bold text-[var(--color-text)]">${escapeHtml(content.brand)}</a>
          <div class="hidden md:flex items-center gap-6">
            ${links}
            ${cta}
          </div>
        </div>
      </nav>`;
}

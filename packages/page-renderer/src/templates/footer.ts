import type { FooterContent } from "@repochan/core";
import type { AssetPathResolver } from "../types.js";
import { escapeHtml, safeHref, renderLink, renderImg } from "../utils.js";

export function renderFooterStandard(content: FooterContent, resolveAsset?: AssetPathResolver): string {
  const logo = content.logo
    ? renderImg(content.logo, "h-8 w-auto", resolveAsset)
    : "";

  const links = (content.links ?? [])
    .map((l) => renderLink(l.label, l.href, "text-gray-400 hover:text-white transition-colors"))
    .join("\n            ");

  const socials = (content.socials ?? [])
    .map((s) => `<a href="${safeHref(s.href)}" class="text-gray-400 hover:text-white transition-colors">${escapeHtml(s.platform)}</a>`)
    .join("\n            ");

  const copyright = escapeHtml(content.copyright ?? `© ${new Date().getFullYear()} ${content.brand}`);

  return `
      <footer class="bg-gray-900 text-white" style="padding-top: 4rem; padding-bottom: 2rem;">
        <div class="container mx-auto px-6">
          <div class="flex flex-col md:flex-row justify-between items-center gap-8">
            <div class="flex items-center gap-3">
              ${logo}
              <span class="text-lg font-semibold">${escapeHtml(content.brand)}</span>
            </div>
            ${links ? `<div class="flex flex-wrap gap-6">\n            ${links}\n            </div>` : ""}
            ${socials ? `<div class="flex gap-4">\n            ${socials}\n            </div>` : ""}
          </div>
          <div class="mt-8 pt-8 border-t border-gray-800 text-center text-sm text-gray-400">
            ${copyright}
          </div>
        </div>
      </footer>`;
}

export function renderFooterMinimal(content: FooterContent): string {
  const copyright = escapeHtml(content.copyright ?? `© ${new Date().getFullYear()} ${content.brand}`);
  return `
      <footer class="border-t border-[var(--color-border)] py-8">
        <div class="container mx-auto px-6 text-center text-sm text-[var(--color-text-muted)]">
          ${copyright}
        </div>
      </footer>`;
}

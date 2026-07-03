import type { StatsContent } from "@repochan/core";
import { escapeHtml } from "../utils.js";

export function renderStatsRow(content: StatsContent): string {
  const items = content.items.map((item) => `
        <div class="text-center">
          <div class="text-4xl md:text-5xl font-bold" style="color: var(--color-primary);">${escapeHtml(item.value)}</div>
          <div class="mt-2 text-[var(--color-text-muted)]">${escapeHtml(item.label)}</div>
        </div>`).join("\n");

  return `
      <section class="bg-[var(--color-background)] py-16 border-y border-[var(--color-border)]">
        <div class="container mx-auto px-6">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
${items}
          </div>
        </div>
      </section>`;
}

export function renderStatsGrid(content: StatsContent): string {
  const items = content.items.map((item) => `
        <div class="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow)] p-8 text-center" style="border: 1px solid var(--color-border);">
          <div class="text-4xl md:text-5xl font-bold" style="color: var(--color-primary);">${escapeHtml(item.value)}</div>
          <div class="mt-2 text-[var(--color-text-muted)]">${escapeHtml(item.label)}</div>
        </div>`).join("\n");

  return `
      <section class="bg-[var(--color-background)]" style="padding-top: var(--section-spacing); padding-bottom: var(--section-spacing);">
        <div class="container mx-auto px-6">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
${items}
          </div>
        </div>
      </section>`;
}

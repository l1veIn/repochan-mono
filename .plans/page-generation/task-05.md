# Task 05: Section HTML 模板

## 目标

实现 7 个 section type 的全部 variant 模板函数。每个模板是纯函数：输入 content，输出 HTML 字符串。设计语言参考 Meraki UI（MIT），用 Tailwind CSS utility class + CSS 变量。

## 文件

- 创建: `packages/page-renderer/src/utils.ts`
- 创建: `packages/page-renderer/src/templates/navbar.ts`
- 创建: `packages/page-renderer/src/templates/hero.ts`
- 创建: `packages/page-renderer/src/templates/features.ts`
- 创建: `packages/page-renderer/src/templates/stats.ts`
- 创建: `packages/page-renderer/src/templates/gallery.ts`
- 创建: `packages/page-renderer/src/templates/cta.ts`
- 创建: `packages/page-renderer/src/templates/footer.ts`
- 创建: `packages/page-renderer/src/templates/index.ts`

## 前置

Task 04 完成（包脚手架 + theme.ts 已有）。

## 设计约定

1. **所有用户输入的文本必须 HTML escape**——用 `escapeHtml()`
2. **颜色通过 CSS 变量引用**：`var(--color-primary)`，不内联 hex
3. **间距通过 CSS 变量引用**：`var(--section-spacing)`，`var(--radius)`
4. **每个 section 输出一个 `<section>` 标签**（navbar 输出 `<nav>`）
5. **响应式**：移动优先，`sm:`/`md:`/`lg:` breakpoint
6. **class 命名**：Tailwind utility class，不追加自定义 class

## Step 1: 创建 src/utils.ts

创建 `packages/page-renderer/src/utils.ts`：

```typescript
import type { AssetRef } from "@repochan/core";

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
export function renderImg(ref: AssetRef, classes?: string): string {
  const cls = classes ?? "";
  const alt = ref.alt ? escapeHtml(ref.alt) : "";
  return `<img src="${resolveAssetPath(ref)}" alt="${alt}" class="${cls}" loading="lazy" />`;
}

/** Render a link safely. */
export function renderLink(label: string, href: string, classes?: string): string {
  return `<a href="${safeHref(href)}" class="${classes ?? ""}">${escapeHtml(label)}</a>`;
}
```

## Step 2: 创建 templates/navbar.ts

```typescript
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
```

## Step 3: 创建 templates/hero.ts

```typescript
import type { HeroContent } from "@repochan/core";
import { escapeHtml, safeHref, renderImg } from "../utils.js";

const BTN_PRIMARY = (c: { label: string; href: string }) =>
  `<a href="${safeHref(c.href)}" class="px-6 py-3 rounded-[var(--radius)] font-medium text-white transition-colors" style="background-color: var(--color-primary);">${escapeHtml(c.label)}</a>`;

const BTN_SECONDARY = (c: { label: string; href: string }) =>
  `<a href="${safeHref(c.href)}" class="px-6 py-3 rounded-[var(--radius)] font-medium border border-[var(--color-border)] text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface)]">${escapeHtml(c.label)}</a>`;

const BTN_SECONDARY_LIGHT = (c: { label: string; href: string }) =>
  `<a href="${safeHref(c.href)}" class="px-6 py-3 rounded-[var(--radius)] font-medium border border-white/30 text-white transition-colors hover:bg-white/10">${escapeHtml(c.label)}</a>`;

export function renderHeroCentered(content: HeroContent): string {
  const img = content.image
    ? `<div class="mt-12 max-w-2xl mx-auto">${renderImg(content.image, "rounded-[var(--radius-lg)] shadow-lg w-full")}</div>`
    : "";

  return `
      <section class="bg-[var(--color-background)]" style="padding-top: var(--section-spacing); padding-bottom: var(--section-spacing);">
        <div class="container mx-auto px-6 text-center">
          <h1 class="text-4xl md:text-6xl font-bold tracking-tight text-[var(--color-text)] max-w-4xl mx-auto">${escapeHtml(content.headline)}</h1>
          <p class="mt-6 text-lg text-[var(--color-text-muted)] max-w-2xl mx-auto">${escapeHtml(content.subheadline)}</p>
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
              <h1 class="text-4xl md:text-5xl font-bold tracking-tight text-[var(--color-text)]">${escapeHtml(content.headline)}</h1>
              <p class="mt-6 text-lg text-[var(--color-text-muted)]">${escapeHtml(content.subheadline)}</p>
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
              <h1 class="text-4xl md:text-5xl font-bold tracking-tight text-[var(--color-text)]">${escapeHtml(content.headline)}</h1>
              <p class="mt-6 text-lg text-[var(--color-text-muted)]">${escapeHtml(content.subheadline)}</p>
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
          <h1 class="text-4xl md:text-6xl font-bold tracking-tight text-white">${escapeHtml(content.headline)}</h1>
          <p class="mt-6 text-lg text-gray-200 max-w-2xl mx-auto">${escapeHtml(content.subheadline)}</p>
          <div class="mt-8 flex flex-wrap gap-4 justify-center">
            ${BTN_PRIMARY(content.primaryCta)}
            ${content.secondaryCta ? BTN_SECONDARY_LIGHT(content.secondaryCta) : ""}
          </div>
        </div>
      </section>`;
}
```

## Step 4: 创建 templates/features.ts

```typescript
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
```

## Step 5: 创建 templates/stats.ts

```typescript
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
```

## Step 6: 创建 templates/gallery.ts

```typescript
import type { GalleryContent } from "@repochan/core";
import { escapeHtml, renderImg } from "../utils.js";

export function renderGalleryGrid(content: GalleryContent): string {
  const heading = content.heading
    ? `<h2 class="text-3xl font-bold text-center text-[var(--color-text)] mb-12">${escapeHtml(content.heading)}</h2>`
    : "";

  const images = content.images.map((ref) => `
          <div class="overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow)]">
            ${renderImg(ref, "w-full h-64 object-cover transition-transform hover:scale-105")}
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

export function renderGalleryMasonry(content: GalleryContent): string {
  const heading = content.heading
    ? `<h2 class="text-3xl font-bold text-center text-[var(--color-text)] mb-12">${escapeHtml(content.heading)}</h2>`
    : "";

  const images = content.images.map((ref) => `
        <div class="break-inside-avoid mb-6 overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow)]">
          ${renderImg(ref, "w-full h-auto")}
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
```

## Step 7: 创建 templates/cta.ts

```typescript
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
```

## Step 8: 创建 templates/footer.ts

```typescript
import type { FooterContent } from "@repochan/core";
import { escapeHtml, safeHref, renderLink, renderImg } from "../utils.js";

export function renderFooterStandard(content: FooterContent): string {
  const logo = content.logo
    ? renderImg(content.logo, "h-8 w-auto")
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
```

## Step 9: 创建 templates/index.ts — 分派注册表

```typescript
import type { PageSection } from "@repochan/core";
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
export function renderSection(section: PageSection): string {
  switch (section.type) {
    case "navbar":
      switch (section.variant) {
        case "simple":   return renderNavbarSimple(section.content);
        case "with-cta": return renderNavbarWithCta(section.content);
      }
      break;

    case "hero":
      switch (section.variant) {
        case "centered":   return renderHeroCentered(section.content);
        case "split-right": return renderHeroSplitRight(section.content);
        case "split-left":  return renderHeroSplitLeft(section.content);
        case "full-bg":     return renderHeroFullBg(section.content);
      }
      break;

    case "features":
      switch (section.variant) {
        case "grid-2": return renderFeaturesGrid2(section.content);
        case "grid-3": return renderFeaturesGrid3(section.content);
        case "grid-4": return renderFeaturesGrid4(section.content);
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
        case "grid":    return renderGalleryGrid(section.content);
        case "masonry": return renderGalleryMasonry(section.content);
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
        case "standard": return renderFooterStandard(section.content);
        case "minimal":  return renderFooterMinimal(section.content);
      }
      break;
  }
  return "";
}
```

## Step 10: 更新 src/index.ts

更新 `packages/page-renderer/src/index.ts`：

```typescript
export * from "./types.js";
export * from "./theme.js";
export * from "./utils.js";
export * from "./templates/index.js";
```

## Step 11: 验证编译

```bash
cd ~/Desktop/repochan-mono
pnpm --filter @repochan/page-renderer build
```

预期：编译通过，零 TypeScript 错误。

## Step 12: 提交

```bash
cd ~/Desktop/repochan-mono
git add packages/page-renderer/src/templates/ packages/page-renderer/src/utils.ts packages/page-renderer/src/index.ts
git commit -m "feat(page-renderer): add all section HTML templates (7 types, 20 variants)"
```

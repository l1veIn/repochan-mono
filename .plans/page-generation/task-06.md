# Task 06: 渲染引擎 + 资产解析器

## 目标

实现 `renderPage()` 主函数——把 PageData 变成完整的 HTML 文档字符串，同时输出需要复制的资产文件列表。

## 文件

- 创建: `packages/page-renderer/src/render.ts`
- 修改: `packages/page-renderer/src/index.ts`（添加 export）

## 前置

- Task 04 完成（theme.ts）
- Task 05 完成（templates + utils.ts）

## 上下文

`renderPage` 是 renderer 包的主入口。它的职责：
1. 编译 theme → CSS 变量
2. 生成 base CSS（reset + container + utility）
3. 遍历 sections，调 `renderSection()` 生成 HTML 片段
4. 拼接成完整 HTML 文档
5. 输出资产复制列表（从 core 的 AssetResolution 转换）

**关键约束：** renderPage 是纯同步函数（不读文件系统）。资产路径解析是 caller 的事。renderPage 只负责输出 HTML + CSS + 需要复制的文件列表。

但 caller（pi 层或 CLI）需要先调 core 的 `checkPageAssets()` 解析路径，然后把结果传给 renderer。

实际上更简洁的设计是：renderPage 接收一个 `resolvedAssets` 映射，把 AssetRef → 已解析的输出路径。

## Step 1: 创建 src/render.ts

```typescript
import type { PageData, AssetRef } from "@repochan/core";
import { compileTheme, formatCSSVars } from "./theme.js";
import { renderSection } from "./templates/index.js";
import type { RenderResult } from "./types.js";

/**
 * Pre-resolved asset mapping: AssetRef (orderId+versionId+file) → output path.
 * The caller resolves this via core's checkPageAssets() + readOrderResult().
 */
export type ResolvedAssets = Map<string, string>;
// key: `${orderId}/${versionId ?? 'current'}/${file}`
// value: relative output path, e.g. "assets/hero.png"

/** Generate a unique key for an AssetRef. */
export function assetKey(ref: AssetRef): string {
  return `${ref.orderId}/${ref.versionId ?? "current"}/${ref.file}`;
}

/**
 * Generate the base CSS — reset rules, container utility, and theme variables.
 */
function generateBaseCSS(page: PageData): string {
  const { light, dark } = compileTheme(page.theme);
  const lightVars = formatCSSVars(":root", light);
  const darkVars = formatCSSVars('[data-theme="dark"]', dark);
  const fontFamily = page.theme.fontFamily
    ? `'${page.theme.fontFamily}', system-ui, sans-serif`
    : "'Inter', system-ui, -apple-system, sans-serif";

  return `
${lightVars}

${darkVars}

/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }

body {
  font-family: var(--font-family);
  background-color: var(--color-background);
  color: var(--color-text);
  line-height: 1.6;
  transition: background-color 0.3s ease, color 0.3s ease;
}

img { max-width: 100%; height: auto; display: block; }

a { text-decoration: none; color: inherit; }

/* ── Container ── */
.container {
  width: 100%;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
}

/* ── Responsive grid helper ── */
.grid {
  display: grid;
  gap: 1.5rem;
}

/* ── Dark mode toggle (optional, via [data-theme]) ── */
[data-theme="dark"] { color-scheme: dark; }

/* ── Print-friendly ── */
@media print {
  nav, footer { display: none; }
  section { break-inside: avoid; }
}
`.trim();
}

/**
 * Render a complete PageData into a static HTML document.
 *
 * @param page The page data (theme + sections)
 * @param resolvedAssets Map of asset keys → output paths (from checkPageAssets)
 * @returns RenderResult with html, css, and asset copy instructions
 */
export function renderPage(
  page: PageData,
  resolvedAssets?: ResolvedAssets,
): RenderResult {
  // 1. Generate CSS
  const css = generateBaseCSS(page);

  // 2. Render all sections
  const bodyContent = page.sections
    .map((section) => renderSection(section))
    .join("\n");

  // 3. Collect asset copy instructions
  const assets: RenderResult["assets"] = [];
  if (resolvedAssets) {
    for (const [_key, destPath] of resolvedAssets) {
      // The source path will be filled by the caller (pi/CLI layer).
      // Renderer only knows the destination relative path.
      assets.push({
        source: "", // filled by caller
        destination: destPath,
      });
    }
  }

  // 4. Determine dark mode attribute
  const themeAttr = page.theme.darkMode ? 'data-theme="dark"' : "";

  // 5. Assemble full HTML document
  const html = `<!DOCTYPE html>
<html lang="en"${themeAttr ? ` ${themeAttr}` : ""}>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}" />
  <style>
${css}
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;

  return { html, css, assets };
}
```

**注意：** 上面 `escapeHtml` 没有 import。需要在文件顶部添加 import：

在 render.ts 顶部 import 区追加：
```typescript
import { escapeHtml } from "./utils.js";
```

## Step 2: 更新 src/index.ts

```typescript
export * from "./types.js";
export * from "./theme.js";
export * from "./utils.js";
export * from "./templates/index.js";
export * from "./render.js";
```

## Step 3: 验证编译

```bash
cd ~/Desktop/repochan-mono
pnpm --filter @repochan/orders-renderer build
```

**注意：** 上面的包名有 typo。应该是 `@repochan/page-renderer`：

```bash
pnpm --filter @repochan/page-renderer build
```

## Step 4: 提交

```bash
cd ~/Desktop/repochan-mono
git add packages/page-renderer/src/render.ts packages/page-renderer/src/index.ts
git commit -m "feat(page-renderer): add renderPage engine and asset resolution types"
```

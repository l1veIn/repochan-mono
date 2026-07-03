# Task 04: page-renderer 包脚手架 + 主题编译器

## 目标

创建 `packages/page-renderer` 新包，配置好项目结构和依赖，实现主题编译器（PageTheme → CSS 变量）。

## 文件

- 创建: `packages/page-renderer/package.json`
- 创建: `packages/page-renderer/tsconfig.json`
- 创建: `packages/page-renderer/src/types.ts`
- 创建: `packages/page-renderer/src/theme.ts`
- 创建: `packages/page-renderer/src/index.ts`

## 前置

- Task 01 完成（core 已有 PageData 等类型）

## 上下文

monorepo 根目录有 `pnpm-workspace.yaml`。现有包的 package.json 和 tsconfig 结构参考：

```
packages/core/package.json:
  name: "@repochan/core"
  type: module
  exports: ./dist/index.js
  scripts: { build: "tsc", test: "vitest run" }
```

monorepo 用 pnpm workspace，包之间通过 workspace 协议引用：
`"@repochan/core": "workspace:*"`

## Step 1: 创建 package.json

创建 `packages/page-renderer/package.json`：

```json
{
  "name": "@repochan/page-renderer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Static HTML renderer for RepoChan Page JSON — zero JS output.",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@repochan/core": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.9.3",
    "vitest": "^2.1.9"
  }
}
```

## Step 2: 创建 tsconfig.json

创建 `packages/page-renderer/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "test"]
}
```

这跟 `packages/core/tsconfig.json` 的模式完全一致（extends `../../tsconfig.base.json`）。

## Step 3: 创建 src/types.ts

创建 `packages/page-renderer/src/types.ts`：

```typescript
/**
 * Renderer-specific types.
 *
 * PageData, PageSection, PageTheme, AssetRef are imported from @repochan/core
 * — the renderer is a pure consumer of core's types.
 */
export type { PageData, PageSection, PageTheme, AssetRef } from "@repochan/core";

/** Result of rendering a page. */
export type RenderResult = {
  /** Complete HTML document string. */
  html: string;
  /** Inline CSS (goes inside a <style> tag in the HTML head). */
  css: string;
  /** Asset files that need to be copied to the output directory. */
  assets: Array<{
    /** Absolute source path in .repochan/orders/. */
    source: string;
    /** Relative path in the output directory, e.g. "assets/hero.png". */
    destination: string;
  }>;
};

/** CSS variables generated from a PageTheme. */
export type ThemeCSSVars = Record<string, string>;
```

## Step 4: 创建 src/theme.ts

创建 `packages/page-renderer/src/theme.ts`：

```typescript
import type { PageTheme, ThemeCSSVars } from "./types.js";

/**
 * Style presets — control structural CSS properties (border radius, shadow depth, spacing).
 * These are fixed per-style and do NOT come from the theme colors.
 */
export const STYLE_PRESETS: Record<string, {
  borderRadius: string;
  borderRadiusLg: string;
  shadowDepth: string;
  sectionSpacing: string;
  fontScale: string;
}> = {
  modern: {
    borderRadius: "0.5rem",
    borderRadiusLg: "0.75rem",
    shadowDepth: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
    sectionSpacing: "5rem",
    fontScale: "1",
  },
  playful: {
    borderRadius: "1rem",
    borderRadiusLg: "1.5rem",
    shadowDepth: "0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)",
    sectionSpacing: "4rem",
    fontScale: "1.05",
  },
  minimal: {
    borderRadius: "0.25rem",
    borderRadiusLg: "0.5rem",
    shadowDepth: "none",
    sectionSpacing: "6rem",
    fontScale: "1",
  },
  techy: {
    borderRadius: "0.125rem",
    borderRadiusLg: "0.25rem",
    shadowDepth: "0 0 0 1px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.08)",
    sectionSpacing: "5rem",
    fontScale: "0.95",
  },
  elegant: {
    borderRadius: "0.375rem",
    borderRadiusLg: "0.625rem",
    shadowDepth: "0 10px 25px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
    sectionSpacing: "5.5rem",
    fontScale: "1.02",
  },
};

/**
 * Validate a hex color string.
 * Accepts #RGB and #RRGGBB formats.
 */
export function isValidHex(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

/** Darken a hex color by a percentage (0-100). */
export function darken(hex: string, percent: number): string {
  if (!isValidHex(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const factor = 1 - percent / 100;
  return `#${Math.round(r * factor).toString(16).padStart(2, "0")}${Math.round(g * factor).toString(16).padStart(2, "0")}${Math.round(b * factor).toString(16).padStart(2, "0")}`;
}

/** Lighten a hex color by a percentage (0-100). */
export function lighten(hex: string, percent: number): string {
  if (!isValidHex(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const factor = percent / 100;
  return `#${Math.round(r + (255 - r) * factor).toString(16).padStart(2, "0")}${Math.round(g + (255 - g) * factor).toString(16).padStart(2, "0")}${Math.round(b + (255 - b) * factor).toString(16).padStart(2, "0")}`;
}

/**
 * Convert a hex color to an rgba string with given alpha.
 */
export function withAlpha(hex: string, alpha: number): string {
  if (!isValidHex(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Compile a PageTheme into CSS custom properties.
 *
 * Output is a record of CSS variable name → value.
 * Includes both light and dark mode variables.
 *
 * Usage: renderer will wrap these in `:root { ... }` and
 * `[data-theme="dark"] { ... }` blocks.
 */
export function compileTheme(theme: PageTheme): {
  light: ThemeCSSVars;
  dark: ThemeCSSVars;
} {
  const preset = STYLE_PRESETS[theme.style] ?? STYLE_PRESETS.modern;

  // Light mode (default)
  const light: ThemeCSSVars = {
    "--color-primary": theme.primary,
    "--color-primary-hover": darken(theme.primary, 10),
    "--color-primary-light": withAlpha(theme.primary, 0.1),
    "--color-secondary": theme.secondary,
    "--color-secondary-hover": darken(theme.secondary, 10),
    "--color-accent": theme.accent,
    "--color-accent-hover": darken(theme.accent, 10),
    "--color-background": theme.background,
    "--color-surface": lighten(theme.background, 3),
    "--color-text": "#1F2937",
    "--color-text-muted": "#6B7280",
    "--color-border": "#E5E7EB",
    "--radius": preset.borderRadius,
    "--radius-lg": preset.borderRadiusLg,
    "--shadow": preset.shadowDepth,
    "--section-spacing": preset.sectionSpacing,
    "--font-scale": preset.fontScale,
  };

  if (theme.fontFamily) {
    light["--font-family"] = theme.fontFamily;
  } else {
    light["--font-family"] = `'Inter', system-ui, -apple-system, sans-serif`;
  }

  // Dark mode
  const dark: ThemeCSSVars = {
    ...light,
    "--color-background": "#0F172A",
    "--color-surface": "#1E293B",
    "--color-text": "#F1F5F9",
    "--color-text-muted": "#94A3B8",
    "--color-border": "#334155",
  };

  return { light, dark };
}

/**
 * Convert CSS variables to a CSS string block.
 *
 * @example
 * formatCSSVars(":root", { "--color-primary": "#3B82F6" })
 * // → ":root {\n  --color-primary: #3B82F6;\n}"
 */
export function formatCSSVars(selector: string, vars: ThemeCSSVars): string {
  const entries = Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
  return `${selector} {\n${entries}\n}`;
}
```

## Step 5: 创建 src/index.ts

创建 `packages/page-renderer/src/index.ts`：

```typescript
export * from "./types.js";
export * from "./theme.js";
// Templates and render will be added in later tasks
```

## Step 6: 安装依赖 + 验证编译

```bash
cd ~/Desktop/repochan-mono
pnpm install
pnpm --filter @repochan/page-renderer build
```

预期：编译通过。

## Step 5: 提交

```bash
cd ~/Desktop/repochan-mono
git add packages/page-renderer/
git commit -m "feat(page-renderer): scaffold package with theme compiler"
```

import siteConfig from "../../repochan/site.json";
import assetsConfig from "../../repochan/assets.json";
import zhJson from "../../repochan/i18n/zh.json";
import enJson from "../../repochan/i18n/en.json";
import type { Locale, SiteContent } from "./i18n/types";

/** 站点配置（项目元信息 + 4 桶主题 token）—— 唯一出处 repochan/site.json */
export const site = siteConfig;

export const defaultLocale = site.locales.default as Locale;
export const supportedLocales = site.locales.supported as Locale[];

type LocaleFile = typeof zhJson;

function hydrate(raw: LocaleFile): SiteContent {
  return { locale: raw.locale as Locale, meta: raw.meta, ...raw.content } as unknown as SiteContent;
}

export const locales: Record<Locale, SiteContent> = {
  zh: hydrate(zhJson),
  en: hydrate(enJson as LocaleFile),
};

export function getContent(locale: Locale): SiteContent {
  return locales[locale];
}

/** 另一个 locale 的页面路径（locale 切换链接用） */
export function alternatePath(locale: Locale): string {
  return locale === defaultLocale ? `/${supportedLocales.find((l) => l !== defaultLocale) ?? "en"}/` : "/";
}

/** 素材路径 —— src 全部来自 repochan/assets.json（slot 状态），尺寸为布局提示 */
type ScalarState = { src: string };
type BundleState = { items: Record<string, { src: string }> };
const assetStates = assetsConfig.assets as unknown as Record<string, ScalarState & BundleState>;

function scalarSrc(slot: string): string {
  return assetStates[slot].src;
}

function bundleSrc(slot: string, key: string): string {
  return assetStates[slot].items[key].src;
}

export const assets = {
  lineart: { src: scalarSrc("lineart-full"), width: 1024, height: 1536 },
  cutout: { src: scalarSrc("cutout-a"), width: 1024, height: 1536 },
  foundation: { src: scalarSrc("foundation"), width: 1024, height: 1024 },
  pattern: { src: scalarSrc("pattern"), width: 800, height: 800 },
  studio: { src: scalarSrc("studio-wide"), width: 1536, height: 1024 },
  icon: { src: scalarSrc("icon"), width: 512, height: 512 },
  sticker0: { src: bundleSrc("stickers", "welcome"), width: 640, height: 640 },
  sticker3: { src: bundleSrc("stickers", "empty"), width: 640, height: 640 },
  sticker6: { src: bundleSrc("stickers", "not-found"), width: 640, height: 640 },
  og: { src: scalarSrc("cutout-a"), width: 1024, height: 1536 },
} as const;

/**
 * 4 桶 theme（primary/base/ink/accents）→ 命名色板（组件读取点）。
 * accents 顺序 = [emerald, pink, purple, yellow]（site.json 复原顺序）。
 */
export function palette() {
  const t = site.theme;
  const [emerald, pink, purple, yellow] = t.accents;
  return {
    wireBg: t.base,
    wireLine: t.ink,
    sky: t.primary,
    emerald,
    pink,
    purple,
    yellow,
    ink: t.ink,
  };
}

/**
 * 4 桶 theme → 组件消费的命名 CSS 变量（SiteLayout 内联注入）。
 * 颜色只在此处由 repochan/site.json 展开；wire-bg-soft / wire-dim / wire-faint
 * 与字体栈在 global.css 由这些变量派生，展示层不出现任何颜色字面量。
 */
export function buildCssVars(): string {
  const p = palette();
  const tokens: Record<string, string> = {
    "wire-bg": p.wireBg,
    "wire-line": p.wireLine,
    sky: p.sky,
    pink: p.pink,
    purple: p.purple,
    emerald: p.emerald,
    yellow: p.yellow,
  };
  return `:root {\n${Object.entries(tokens)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n")}\n}`;
}

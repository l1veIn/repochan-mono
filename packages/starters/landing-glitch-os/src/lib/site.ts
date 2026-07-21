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

/** bundle 切片按格号取用：格号 = 固定 key 顺序（repochan/starter.json publications） */
const gridKeys = ["welcome", "searching", "loading", "empty", "error", "success", "not-found", "cta", "cozy"] as const;

function bundleSrc(slot: string, n: number): string {
  return assetStates[slot].items[gridKeys[n]].src;
}

export const assets = {
  icon: { src: scalarSrc("icon"), width: 512, height: 512 },
  cutoutA: { src: scalarSrc("cutout-a"), width: 2048, height: 3072 },
  cutoutB: { src: scalarSrc("cutout-b"), width: 2048, height: 2048 },
  foundation: { src: scalarSrc("foundation"), width: 1024, height: 1024 },
  stickers: gridKeys.map((_, i) => ({
    src: bundleSrc("stickers", i),
    width: 640,
    height: 640,
  })),
  webstates: gridKeys.map((_, i) => ({
    src: bundleSrc("webstates", i),
    width: 640,
    height: 640,
  })),
  og: { src: scalarSrc("foundation"), width: 1024, height: 1024 },
} as const;

/**
 * 4 桶 theme（primary/base/ink/accents）→ 组件消费的 11 个 CSS 变量
 * （SiteLayout 内联注入）。颜色只在此处由 repochan/site.json 展开，
 * 展示层不出现任何颜色字面量；--scan 为 ink 的 4% 混合（原 rgba 白 4%
 * 无法进 4 桶 hex 契约，此处用 color-mix 等价复原）。
 */
export function buildCssVars(): string {
  const t = site.theme;
  const [win, titlebar, windowBorder, acidAlt, hot, cyan, muted] = t.accents;
  const tokens: Record<string, string> = {
    "crt-bg": t.base,
    "window": win,
    "titlebar": titlebar,
    "window-border": windowBorder,
    "acid": t.primary,
    "acid-alt": acidAlt,
    "hot": hot,
    "cyan": cyan,
    "text": t.ink,
    "muted": muted,
    "scan": "color-mix(in srgb, var(--text) 4%, transparent)",
  };
  return `:root {\n${Object.entries(tokens)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n")}\n}`;
}

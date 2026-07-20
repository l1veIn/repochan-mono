import siteConfig from "../../repochan/site.json";
import assetsConfig from "../../repochan/assets.json";
import zhJson from "../../repochan/i18n/zh.json";
import enJson from "../../repochan/i18n/en.json";
import type { Locale, SiteContent } from "./i18n/types";

/** 站点配置（项目元信息 + 主题 token）—— 唯一出处 repochan/site.json */
export const site = siteConfig;

export const defaultLocale = site.locales.default as Locale;
export const supportedLocales = site.locales.supported as Locale[];

type LocaleFile = typeof zhJson;

function hydrate(raw: LocaleFile): SiteContent {
  const { htmlLang, marquee, cover, issueBrief, pipeline, stickerWall, ransom, cta, colophon } = raw.content;
  return {
    locale: raw.locale as Locale,
    htmlLang,
    meta: raw.meta,
    marquee,
    cover,
    issueBrief,
    pipeline,
    stickerWall,
    ransom,
    cta,
    colophon,
  } as unknown as SiteContent;
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

export const assets = {
  cutout: { src: scalarSrc("cover-cutout"), width: 760, height: 1140 },
  icon: { src: scalarSrc("icon"), width: 512, height: 512 },
  poster: { src: scalarSrc("poster"), width: 1200, height: 800 },
  banner: { src: scalarSrc("banner"), width: 1600, height: 900 },
  pattern: { src: scalarSrc("pattern"), width: 816, height: 816 },
  og: { src: "/assets/og.jpg", width: 1200, height: 675 },
} as const;

/** bundle 切片按格号取用：格号 = 模板固定 key 顺序（repochan/starter.json publications） */
const gridKeys = ["welcome", "searching", "loading", "empty", "error", "success", "not-found", "cta", "cozy"] as const;

function bundleSrc(slot: string, n: number): string {
  return assetStates[slot].items[gridKeys[n]].src;
}

export function stickerSrc(n: number): string {
  return bundleSrc("stickers", n);
}

export function webstateSrc(n: number): string {
  return bundleSrc("webstates", n);
}

/**
 * 主题 token → CSS 变量（SiteLayout 内联注入）。
 * 颜色只在此处由 repochan/site.json 展开，展示层不出现任何颜色字面量。
 */
export function buildCssVars(): string {
  const t = site.theme;
  const [blue, purple, mint, yellow, stampRed, note, card] = t.accents;
  const tokens: Record<string, string> = {
    paper: t.base,
    ink: t.ink,
    pink: t.primary,
    blue,
    purple,
    mint,
    yellow,
    "stamp-red": stampRed,
    note,
    card,
  };
  return `:root {\n${Object.entries(tokens)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n")}\n}`;
}

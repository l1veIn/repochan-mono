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
const assetStates = assetsConfig.assets as unknown as Record<string, { src: string }>;

export const assets = {
  icon: { src: assetStates["icon"].src, width: 512, height: 512 },
  symbolA: { src: assetStates["symbol-cutout-a"].src, width: 2048, height: 3072 },
  symbolB: { src: assetStates["symbol-cutout-b"].src, width: 2048, height: 2048 },
  evidenceFoundation: { src: assetStates["evidence-foundation"].src, width: 1024, height: 1024 },
  evidencePoster: { src: assetStates["evidence-poster"].src, width: 1536, height: 1024 },
  og: { src: assetStates["icon"].src, width: 512, height: 512 },
} as const;

/**
 * 4 桶 theme（primary/base/ink/accents）→ 组件消费的 5 个 CSS 变量
 * （SiteLayout 内联注入）。颜色只在此处由 repochan/site.json 展开，
 * 展示层不出现任何颜色字面量。
 */
export function buildCssVars(): string {
  const t = site.theme;
  const [gray, blue] = t.accents;
  const tokens: Record<string, string> = {
    red: t.primary,
    black: t.ink,
    cream: t.base,
    gray,
    blue,
  };
  return `:root {\n${Object.entries(tokens)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n")}\n}`;
}

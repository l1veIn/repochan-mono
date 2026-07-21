import siteConfig from "../../repochan/site.json";
import assetsConfig from "../../repochan/assets.json";
import zhJson from "../../repochan/i18n/zh.json";
import enJson from "../../repochan/i18n/en.json";
import type { Locale, SiteContent } from "./i18n/types";

/** 站点配置（项目元信息 + 4 桶主题 token + brand）—— 唯一出处 repochan/site.json */
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
const assetStates = assetsConfig.assets as unknown as Record<string, ScalarState>;

function scalarSrc(slot: string): string {
  return assetStates[slot].src;
}

export const assets = {
  icon: { src: scalarSrc("icon"), width: 512, height: 512 },
  heroCutout: { src: scalarSrc("hero-cutout"), width: 2048, height: 2048 },
  footerCutout: { src: scalarSrc("footer-cutout"), width: 2048, height: 2048 },
  evidenceFoundation: { src: scalarSrc("foundation"), width: 1200, height: 1200 },
  evidencePoster: { src: scalarSrc("studio-poster"), width: 1536, height: 1024 },
  og: { src: scalarSrc("foundation"), width: 1200, height: 1200 },
} as const;

/**
 * 4 桶 theme（primary/base/ink/accents）→ 组件消费的 5 个 CSS 变量
 * （SiteLayout 内联注入）。颜色只在此处由 repochan/site.json 展开，
 * 展示层不出现任何颜色字面量；accent 顺序即该复原顺序（rule, muted）。
 */
export function buildCssVars(): string {
  const t = site.theme;
  const [rule, muted] = t.accents;
  const tokens: Record<string, string> = {
    ink: t.ink,
    paper: t.base,
    rule: rule,
    accent: t.primary,
    muted: muted,
  };
  return `:root {\n${Object.entries(tokens)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n")}\n}`;
}

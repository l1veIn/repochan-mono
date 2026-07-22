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

/** Normalize path to trailing-slash form used by this static site. */
export function normalizeSitePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  const withSlash = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return withSlash;
}

/** Whether a path is under the English prefix. */
export function pathIsEnglish(pathname: string): boolean {
  const p = pathname || "/";
  return p === "/en" || p === "/en/" || p.startsWith("/en/");
}

/**
 * Map a site path into the other (or target) locale.
 * zh: `/`, `/showcase/`, `/showcase/redis/`
 * en: `/en/`, `/en/showcase/`, `/en/showcase/redis/`
 */
export function switchLocalePath(pathname: string, target: Locale): string {
  const p = normalizeSitePath(pathname);
  const onEn = pathIsEnglish(p);

  if (target === "en") {
    if (onEn) return p;
    if (p === "/") return "/en/";
    return `/en${p}`;
  }

  // target zh
  if (!onEn) return p;
  if (p === "/en/") return "/";
  return p.replace(/^\/en/, "") || "/";
}

/**
 * 另一个 locale 的页面路径（locale 切换链接用）。
 * Pass `currentPath` so subpages (e.g. /showcase/redis/) map correctly.
 */
export function alternatePath(locale: Locale, currentPath?: string): string {
  const path = currentPath ?? (locale === "zh" ? "/" : "/en/");
  const target: Locale = locale === "zh" ? "en" : "zh";
  return switchLocalePath(path, target);
}

/** 素材路径 —— slot 输出 src 全部来自 repochan/assets.json（slot 状态），尺寸为布局提示 */
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
  openingPortrait: { src: scalarSrc("opening-portrait"), width: 2048, height: 3072 },
  cutoutWave: { src: scalarSrc("exhibit-cutout"), width: 2048, height: 2048 },
  exhibits: {
    foundation: { src: scalarSrc("exhibit-foundation"), width: 1600, height: 1600 },
    banner: { src: scalarSrc("exhibit-banner"), width: 1600, height: 900 },
    posterRiso: { src: scalarSrc("exhibit-poster-riso"), width: 1600, height: 1067 },
    posterMemphis: { src: scalarSrc("exhibit-poster-memphis"), width: 1536, height: 1536 },
    patternTile: { src: scalarSrc("exhibit-pattern"), width: 1024, height: 1024 },
  },
  // 研究墙 / 器物组：ord-sticker-001 / ord-props-001 母图的自由组合切片，
  // 非 slot（下游通过 stickers bundle 重出同一母图后自然覆盖），静态 source 资产。
  studies: {
    exprExcited: { src: "/assets/studies/expr-excited.webp", width: 640, height: 640 },
    exprFocused: { src: "/assets/studies/expr-focused.webp", width: 640, height: 640 },
    exprDeadpan: { src: "/assets/studies/expr-deadpan.webp", width: 640, height: 640 },
    chibiFull: { src: "/assets/studies/chibi-full.webp", width: 640, height: 640 },
  },
  props: {
    clip: { src: "/assets/props/motif-clip-alpha.webp", width: 640, height: 640 },
    earring: { src: "/assets/props/motif-earring-alpha.webp", width: 640, height: 640 },
    headphones: { src: "/assets/props/motif-headphones-alpha.webp", width: 640, height: 640 },
    pendant: { src: "/assets/props/motif-pendant-alpha.webp", width: 640, height: 640 },
  },
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
  og: { src: "/og.png", width: 1280, height: 640 },
} as const;

/** Canonical site origin for absolute OG URLs (override via PUBLIC_SITE_URL). */
export const siteOrigin: string =
  (import.meta.env.PUBLIC_SITE_URL as string | undefined) ||
  ((site.project as { siteUrl?: string }).siteUrl ?? "https://repochan.com");

/**
 * 4 桶 theme（primary/base/ink/accents）→ 组件消费的 8 个 CSS 变量
 * （SiteLayout 内联注入）。accents 顺序 = 复原顺序：
 * [floor, mat, muted, hairline]；frame 复用 ink。
 * 颜色只在此处由 repochan/site.json 展开，展示层不出现任何颜色字面量。
 */
export function buildCssVars(): string {
  const t = site.theme;
  const [floor, mat, muted, hairline] = t.accents;
  const tokens: Record<string, string> = {
    wall: t.base,
    floor,
    mat,
    ink: t.ink,
    muted,
    frame: t.ink,
    hairline,
    accent: t.primary,
  };
  return `:root {\n${Object.entries(tokens)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n")}\n}`;
}

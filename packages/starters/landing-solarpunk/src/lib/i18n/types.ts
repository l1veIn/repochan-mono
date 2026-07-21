/**
 * 站点文案类型定义 —— 所有页面文案的唯一结构契约。
 * 全部字段按纯文本渲染；命令行字段渲染在 <code> 中。
 */

export type Locale = "zh" | "en";

export interface NavContent {
  brand: string;
  tagline: string;
  stages: { id: string; label: string }[];
  localeSwitchLabel: string;
  iconAlt: string;
}

export interface HeroContent {
  kicker: string;
  titleLines: string[];
  sub: string;
  installCmd: string;
  copyLabel: string;
  copiedLabel: string;
  secondaryLabel: string;
  sceneAlt: string;
  scrollHint: string;
}

export interface SectionHead {
  /** 生长阶段标签，如 "STAGE 01 · 验土"（mono 小字） */
  stage: string;
  title: string;
  note: string;
}

export interface SoilContent extends SectionHead {
  cards: { term: string; value: string; desc: string }[];
  verdict: string;
}

export interface SeedContent extends SectionHead {
  entries: { dim: string; q: string; a: string }[];
}

export interface SproutContent extends SectionHead {
  name: string;
  role: string;
  catchphrase: string;
  traits: { term: string; desc: string }[];
  cutoutAlt: string;
  cutoutCaption: string;
}

export interface SunframeContent extends SectionHead {
  plaqueAlt: string;
  plaqueCaption: string;
  points: { term: string; desc: string }[];
}

export interface HarvestContent extends SectionHead {
  items: { name: string; alt: string }[];
  basketNote: string;
}

export interface ShareContent extends SectionHead {
  sub: string;
  cmd: string;
  copyLabel: string;
  copiedLabel: string;
  docsLabel: string;
  cutoutAlt: string;
  fine: string;
}

export interface FooterContent {
  lines: string[];
  localeSwitchLabel: string;
  copyright: string;
  note: string;
}

export interface SiteContent {
  locale: Locale;
  htmlLang: string;
  meta: { title: string; description: string };
  nav: NavContent;
  hero: HeroContent;
  soil: SoilContent;
  seed: SeedContent;
  sprout: SproutContent;
  sunframe: SunframeContent;
  harvest: HarvestContent;
  share: ShareContent;
  footer: FooterContent;
}

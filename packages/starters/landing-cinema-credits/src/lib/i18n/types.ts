/**
 * 站点文案类型定义 —— 所有页面文案的唯一结构契约（repochan/i18n/*.json）。
 */

export type Locale = "zh" | "en";

export interface FrameContent {
  brand: string;
  skip: string;
  localeSwitch: string;
}

export interface StudioContent {
  overline: string;
  line: string;
  co: string;
}

export interface TitleContent {
  kicker: string;
  main: string;
  latin: string;
  sub: string;
}

export interface StarringContent {
  role: string;
  roleLatin: string;
  name: string;
  latin: string;
  credit: string;
  alt: string;
  note: string;
}

export interface CreditsContent {
  title: string;
  note: string;
  rows: { role: string; name: string }[];
}

export interface StillsContent {
  title: string;
  note: string;
  figures: { tag: string; caption: string; alt: string }[];
}

export interface TaglineContent {
  line: string;
  sub: string;
}

export interface EndContent {
  overline: string;
  title: string;
  cmd: string;
  copyLabel: string;
  copiedLabel: string;
  githubLabel: string;
  fine: string;
  logoAlt: string;
}

export interface PostCreditsContent {
  kicker: string;
  line: string;
  sub: string;
  stickerAlt: string;
}

export interface SiteContent {
  locale: Locale;
  htmlLang: string;
  meta: { title: string; description: string };
  frame: FrameContent;
  studio: StudioContent;
  title: TitleContent;
  starring: StarringContent;
  credits: CreditsContent;
  stills: StillsContent;
  tagline: TaglineContent;
  end: EndContent;
  postCredits: PostCreditsContent;
}

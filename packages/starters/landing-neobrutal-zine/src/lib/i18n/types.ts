/**
 * 站点文案类型定义 —— 所有页面文案的唯一结构契约。
 * 富文本字段（注释标注 html）允许 <code>/<strong>/<br> 行内标签，
 * 渲染时用 set:html；其余字段一律按纯文本渲染。
 */

export type Locale = "zh" | "en";

export interface MarqueeContent {
  top: string;
  mid: string;
  bottom: string;
}

export interface CoverContent {
  badges: string[];
  /** 主标题三个色块 */
  titleBlocks: [string, string, string];
  /** html：副标题，可含 <code>/<strong>/<br> */
  sub: string;
  handnote: string;
  ctaPrimary: { label: string; href: string };
  ctaSecondary: { label: string; href: string };
  cutoutAlt: string;
  /** 封面底部小贴纸条：贴纸编号 + alt */
  stripStickers: { n: number; alt: string }[];
}

export interface IssueBriefContent {
  title: string;
  handnote: string;
  mainCard: {
    /** html */
    title: string;
    /** html 段落数组 */
    paragraphs: string[];
    /** html 手写涂鸦行 */
    scribble: string;
  };
  factsCard: {
    title: string;
    /** html 列表项 */
    facts: string[];
    iconAlt: string;
  };
  poster: { alt: string; caption: string };
  banner: { alt: string; caption: string };
}

export interface PipelineContent {
  title: string;
  handnote: string;
  panels: {
    no: string;
    /** webstates 素材编号 */
    state: number;
    alt: string;
    name: string;
    caption: string;
    cmd: string;
  }[];
}

export interface StickerWallContent {
  title: string;
  handnote: string;
  stickers: { n: number; alt: string }[];
  note: string;
}

export interface RansomQuoteContent {
  lines: [string, string];
  sig: string;
}

export interface StampCtaContent {
  stamp: { top: string; mainLines: [string, string]; bottom: string };
  handnote: string;
  coupon: {
    title: string;
    steps: { install: string; init: string };
    installCmd: string;
    initCmd: string;
    copyLabel: string;
    copiedLabel: string;
    /** html */
    fine: string;
  };
}

export interface ColophonContent {
  /** html 行数组 */
  lines: string[];
  localeSwitchLabel: string;
}

export interface SiteContent {
  locale: Locale;
  htmlLang: string;
  meta: { title: string; description: string };
  marquee: MarqueeContent;
  cover: CoverContent;
  issueBrief: IssueBriefContent;
  pipeline: PipelineContent;
  stickerWall: StickerWallContent;
  ransom: RansomQuoteContent;
  cta: StampCtaContent;
  colophon: ColophonContent;
}

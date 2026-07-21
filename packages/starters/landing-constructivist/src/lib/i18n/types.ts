/**
 * 站点文案类型定义 —— 所有页面文案的唯一结构契约。
 * 构成主义海报墙：每屏 = 一张海报。口号为主，小字区为辅。
 */

export type Locale = "zh" | "en";

export interface MastheadContent {
  wordmark: string;
  protocol: string;
  iconAlt: string;
  localeSwitchLabel: string;
}

/** 通用海报屏：编号 + 口号块 + 拉丁副行 + 小字说明区 */
export interface PosterContent {
  index: string;
  /** 竖排中文块（仅部分屏使用，≤6 字） */
  vertical?: string;
  /** 主口号分行（每行 ≤ 8 字，合计 ≤ 12 字） */
  slogan: string[];
  /** 拉丁叠字（构成主义双语叠字） */
  latin: string;
  /** 小字说明区 */
  note: string;
  /** 该屏对应的真实 repochan 子命令（等宽小字，可为空） */
  command?: string;
}

export interface EvidenceFigure {
  tag: string;
  alt: string;
  caption: string;
}

export interface ProductPosterContent extends PosterContent {
  figures: EvidenceFigure[];
}

export interface CtaPosterContent extends PosterContent {
  cmd: string;
  copyLabel: string;
  copiedLabel: string;
  docsLabel: string;
  fine: string;
}

export interface ColophonContent {
  lines: string[];
  cutoutAlt: string;
  copyright: string;
}

export interface SiteContent {
  locale: Locale;
  htmlLang: string;
  meta: { title: string; description: string };
  masthead: MastheadContent;
  posters: {
    call: PosterContent;
    analysis: PosterContent;
    persona: PosterContent;
    foundation: PosterContent;
    painter: PosterContent;
    product: ProductPosterContent;
    cta: CtaPosterContent;
  };
  progress: { label: string };
  colophon: ColophonContent;
}

/**
 * 站点文案类型定义 —— 所有页面文案的唯一结构契约。
 * 全部字段按纯文本渲染；命令行字段渲染在 <code> 中。
 */

export type Locale = "zh" | "en";

export interface MastheadContent {
  wordmark: string;
  protocol: string;
  docIndex: string;
  iconAlt: string;
}

export interface HeroContent {
  index: string;
  kicker: string;
  /** 巨字标题行 */
  lines: string[];
  sub: string;
  installCmd: string;
  copyLabel: string;
  copiedLabel: string;
  footnote: string;
  /** 右侧 Fig 图注（等宽小号） */
  figCaption?: string;
  figAlt?: string;
}

export interface TypeTrackContent {
  /** 横向字轨重复项 */
  items: string[];
}

export interface SectionHead {
  index: string;
  title: string;
  note: string;
}

export interface ThesisContent extends SectionHead {
  items: { no: string; term: string; def: string }[];
}

export interface PipelineContent extends SectionHead {
  head: { step: string; input: string; output: string; command: string };
  rows: { no: string; name: string; input: string; output: string; cmd: string }[];
}

export interface ArtifactsContent extends SectionHead {
  head: { item: string; spec: string; source: string };
  rows: { no: string; item: string; spec: string; source: string }[];
}

export interface EvidenceContent extends SectionHead {
  figures: { tag: string; alt: string; caption: string }[];
}

export interface CtaContent {
  index: string;
  title: string;
  cmd: string;
  copyLabel: string;
  copiedLabel: string;
  docsLabel: string;
  fine: string;
}

export interface ColophonContent {
  lines: string[];
  cutoutAlt: string;
  cutoutCaption: string;
  localeSwitchLabel: string;
  copyright: string;
}

export interface SiteContent {
  locale: Locale;
  meta: { title: string; description: string };
  masthead: MastheadContent;
  hero: HeroContent;
  typeTrack: TypeTrackContent;
  thesis: ThesisContent;
  pipeline: PipelineContent;
  artifacts: ArtifactsContent;
  evidence: EvidenceContent;
  cta: CtaContent;
  colophon: ColophonContent;
}

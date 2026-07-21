/**
 * 站点文案类型定义 —— 所有页面文案的唯一结构契约。
 * 全部字段按纯文本渲染；命令行字段渲染在 <code> 中。
 */

export type Locale = "zh" | "en";

export interface StageField {
  key: string;
  value: string;
}

export interface StageContent {
  id: string;
  pct: string;
  kicker: string;
  title: string;
  body: string;
  note: string;
  figLabel: string;
  imgAlt: string;
  fields?: StageField[];
  ctaPrimary?: string;
  ctaSecondary?: string;
  installLabel?: string;
  installCmd?: string;
  copyLabel?: string;
  copiedLabel?: string;
  repoLink?: string;
}

export interface SiteContent {
  locale: Locale;
  meta: { title: string; description: string };
  rail: {
    renderLabel: string;
    brandAlt: string;
    localeSwitch: string;
    stages: string[];
  };
  toggles: {
    title: string;
    items: { key: string; label: string }[];
  };
  snapshots: {
    title: string;
    hint: string;
    items: { label: string; target: string }[];
  };
  stages: StageContent[];
  colophon: {
    line1: string;
    line2: string;
    designNote: string;
    backTop: string;
  };
}

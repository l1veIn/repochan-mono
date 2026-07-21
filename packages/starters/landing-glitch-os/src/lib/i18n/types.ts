/**
 * 站点文案类型定义 —— 所有页面文案的唯一结构契约。
 * 全部字段按纯文本渲染；命令行字段渲染在 <code> 中。
 */

export type Locale = "zh" | "en";

export interface BootContent {
  lines: string[];
}

export interface DesktopIcon {
  id: string;
  label: string;
  note?: string;
}

export interface DesktopContent {
  brand: string;
  version: string;
  tagline: string;
  sub: string;
  hint: string;
  heroAlt: string;
  icons: DesktopIcon[];
}

export interface TermLine {
  t: "cmd" | "ok" | "err" | "info";
  text: string;
}

export interface WinAnalysisContent {
  title: string;
  badge: string;
  lines: TermLine[];
  prompt: string;
}

export interface WinPersonaContent {
  title: string;
  badge: string;
  avatarAlt: string;
  glitchNote: string;
  fields: { k: string; v: string }[];
}

export interface WinPainterContent {
  title: string;
  badge: string;
  stickerCap: string;
  stateCap: string;
  stickerAlt: string;
  stateAlt: string;
}

export interface WinFoundationContent {
  title: string;
  badge: string;
  imageAlt: string;
  status: { k: string; v: string }[];
}

export interface ModalContent {
  title: string;
  face: string;
  heading: string;
  body: string;
  stopCode: string;
  cmd: string;
  copyLabel: string;
  copiedLabel: string;
  docsLabel: string;
  foot: string;
}

export interface TaskbarContent {
  start: string;
  progressLabel: string;
  stages: { name: string; state: string }[];
  clockFallback: string;
  cmd: string;
  copyLabel: string;
  copiedLabel: string;
  localeLabel: string;
  localeSwitch: string;
}

export interface SiteContent {
  locale: Locale;
  meta: { title: string; description: string };
  boot: BootContent;
  desktop: DesktopContent;
  winAnalysis: WinAnalysisContent;
  winPersona: WinPersonaContent;
  winPainter: WinPainterContent;
  winFoundation: WinFoundationContent;
  modal: ModalContent;
  taskbar: TaskbarContent;
}

import { truncateToWidth } from "@earendil-works/pi-tui";
import { paintTone, pipelineSymbol, uiTheme, type PipelineTone, type UiTone } from "./theme.js";

export type ActionHint = {
  key: string;
  label: string;
  tone?: UiTone;
};

export type PipelineItem = {
  label: string;
  description: string;
  tone: PipelineTone;
};

export type StatusLine = {
  label: string;
  value: string | number;
  tone?: UiTone;
};

export function appHeader(opts: { title: string; subtitle?: string; project?: string; width: number }) {
  const lines: string[] = [];
  const title = opts.project ? `${opts.title} · ${opts.project}` : opts.title;
  lines.push(uiTheme.accent(uiTheme.strong(title)));
  if (opts.subtitle) lines.push(uiTheme.dim(opts.subtitle));
  return clampLines(lines, opts.width);
}

export function sectionTitle(title: string, subtitle?: string) {
  const lines = [uiTheme.accent(title)];
  if (subtitle) lines.push(uiTheme.dim(subtitle));
  return lines;
}

export function pipelineList(items: PipelineItem[], width: number) {
  const labelWidth = Math.min(18, Math.max(10, ...items.map((item) => visibleLength(item.label))));
  return items.map((item) => {
    const label = item.label.padEnd(labelWidth, " ");
    const raw = `  ${pipelineSymbol(item.tone)} ${label} ${item.description}`;
    return truncateToWidth(raw, width, "…");
  });
}

export function statusGrid(lines: StatusLine[], width: number) {
  const labelWidth = Math.min(18, Math.max(8, ...lines.map((line) => visibleLength(line.label))));
  return lines.map((line) => {
    const label = uiTheme.dim(line.label.padEnd(labelWidth, " "));
    const value = paintTone(String(line.value), line.tone ?? "strong");
    return truncateToWidth(`  ${label} ${value}`, width, "…");
  });
}

export function callout(opts: { title: string; body?: string[]; tone?: UiTone; width: number }) {
  const tone = opts.tone ?? "accent";
  const lines: string[] = [];
  lines.push(paintTone(opts.title, tone));
  for (const bodyLine of opts.body ?? []) {
    lines.push(truncateToWidth(`  ${bodyLine}`, opts.width, "…"));
  }
  return lines;
}

export function actionBar(actions: ActionHint[], width: number) {
  const text = actions.map((action) => {
    const key = uiTheme.strong(`[${action.key}]`);
    const label = paintTone(action.label, action.tone ?? "dim");
    return `${key} ${label}`;
  }).join("   ");
  return [truncateToWidth(text, width, "…")];
}

export function clampLines(lines: string[], width: number) {
  return lines.map((line) => truncateToWidth(line, width, "…"));
}

function visibleLength(value: string) {
  return [...value].length;
}

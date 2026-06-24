import { truncateToWidth } from "@earendil-works/pi-tui";
import chalk from "chalk";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  strong: (s: string) => chalk.bold(s),
};

export type DetailRow = {
  label: string;
  value?: unknown;
};

export function section(title: string, width: number, body: string[] = []) {
  const lines = [theme.accent(title), ...body];
  return lines.map((line) => truncateToWidth(line, width, "…"));
}

export function keyValueRows(rows: DetailRow[], width: number) {
  const visible = rows.filter((row) => !isEmpty(row.value));
  if (!visible.length) return [];
  const labelWidth = Math.min(18, Math.max(8, ...visible.map((row) => row.label.length)));
  return visible.map((row) => {
    const label = theme.dim(row.label.padEnd(labelWidth, " "));
    return truncateToWidth(`  ${label} ${formatValue(row.value)}`, width, "…");
  });
}

export function bulletList(title: string, values: unknown, width: number, limit = 6) {
  const items = toStringArray(values).filter(Boolean).slice(0, limit);
  if (!items.length) return [];
  const lines = [theme.accent(title)];
  for (const item of items) lines.push(...wrapText(String(item), width - 4, "  • "));
  return lines.map((line) => truncateToWidth(line, width, "…"));
}

export function paragraph(title: string, value: unknown, width: number, limit = 6) {
  if (isEmpty(value)) return [];
  return [theme.accent(title), ...wrapText(String(value), width - 2, "  ").slice(0, limit)];
}

export function rawJson(value: unknown, width: number, maxLines = 32) {
  const json = JSON.stringify(value, null, 2);
  return json.split("\n").slice(0, maxLines).map((line) => truncateToWidth(`  ${line}`, width, "…"));
}

export function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(", ");
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => !isEmpty(v))
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${shortValue(v)}`);
    return entries.join(" · ");
  }
  return String(value ?? "");
}

export function shortValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => shortValue(item)).join(", ");
  if (typeof value === "object" && value !== null) return "…";
  return String(value ?? "");
}

export function toStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  if (value == null) return [];
  return [String(value)];
}

export function wrapText(text: string, width: number, prefix = "") {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = (line + " " + word).trim();
    if (next.length > width && line) {
      lines.push(prefix + line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(prefix + line);
  return lines;
}

export function isEmpty(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

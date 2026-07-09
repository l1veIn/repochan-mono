import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  success: (s: string) => chalk.green(s),
  warn: (s: string) => chalk.yellow(s),
};

export type ConfirmChoice = "skip" | "version" | "overwrite" | "cancel";

export type ConfirmOption = {
  key: string; // "1", "2", "3"
  label: string;
  value: ConfirmChoice;
  tone?: "dim" | "success" | "warn";
};

const DEFAULT_OPTIONS: ConfirmOption[] = [
  { key: "1", label: "使用现有（跳过）", value: "skip", tone: "dim" },
  { key: "2", label: "重新生成（归档旧版 → 新版本）", value: "version", tone: "success" },
  { key: "3", label: "覆盖（不备份）", value: "overwrite", tone: "warn" },
];

export type ConfirmListOpts = {
  title: string;
  summary?: string[];
  options?: ConfirmOption[];
  onSelect: (choice: ConfirmChoice) => void;
  onCancel: () => void;
};

export class ConfirmList implements Component {
  private options: ConfirmOption[];

  constructor(private opts: ConfirmListOpts) {
    this.options = opts.options ?? DEFAULT_OPTIONS;
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q" || data === "Q") {
      this.opts.onCancel();
      return;
    }
    for (const opt of this.options) {
      if (data === opt.key) {
        this.opts.onSelect(opt.value);
        return;
      }
    }
  }

  render(width: number): string[] {
    const w = Math.max(40, width);
    const lines: string[] = [];
    lines.push(theme.accent(this.opts.title));
    lines.push("");

    if (this.opts.summary?.length) {
      for (const line of this.opts.summary) {
        lines.push(truncateToWidth(theme.dim(line), w, "…"));
      }
      lines.push("");
    }

    for (const opt of this.options) {
      const paint = opt.tone === "success" ? theme.success : opt.tone === "warn" ? theme.warn : theme.dim;
      lines.push(paint(`  [${opt.key}] ${opt.label}`));
    }
    lines.push(theme.dim("  [ESC] Cancel"));
    return lines.map((l) => truncateToWidth(l, w, "…"));
  }
}

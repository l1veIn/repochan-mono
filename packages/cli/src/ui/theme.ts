import chalk from "chalk";

export const uiTheme = {
  accent: (s: string) => chalk.cyan(s),
  accentDim: (s: string) => chalk.hex("#6ee7ff").dim(s),
  dim: (s: string) => chalk.gray(s),
  success: (s: string) => chalk.green(s),
  warn: (s: string) => chalk.yellow(s),
  error: (s: string) => chalk.red(s),
  strong: (s: string) => chalk.bold(s),
};

export type UiTone = "accent" | "dim" | "success" | "warn" | "error" | "strong";

export function paintTone(text: string, tone: UiTone = "dim") {
  return uiTheme[tone](text);
}

export type PipelineTone = "done" | "current" | "waiting" | "blocked";

export function pipelineSymbol(tone: PipelineTone) {
  if (tone === "done") return uiTheme.success("✓");
  if (tone === "current") return uiTheme.accent("→");
  if (tone === "blocked") return uiTheme.warn("!");
  return uiTheme.dim("○");
}

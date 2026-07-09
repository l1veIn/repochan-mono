import { Input, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  error: (s: string) => chalk.red(s),
};

export class PromptInput implements Component {
  private input = new Input();
  private error: string | null = null;

  constructor(
    private options: {
      title: string;
      prompt: string;
      placeholder?: string;
      onSubmit: (value: string) => void;
      onCancel: () => void;
    },
  ) {
    this.input.focused = true;
    this.input.onSubmit = (value) => {
      const trimmed = value.trim();
      if (!trimmed) {
        this.error = "输入不能为空。";
        return;
      }
      this.options.onSubmit(trimmed);
    };
    this.input.onEscape = () => this.options.onCancel();
  }

  invalidate(): void {}

  handleInput(data: string): void {
    this.error = null;
    this.input.handleInput(data);
  }

  render(width: number): string[] {
    const w = Math.max(40, width);
    const lines = [
      theme.accent(this.options.title),
      "",
      this.options.prompt,
      "",
      ...(this.input.getValue() || !this.options.placeholder
        ? this.input.render(w - 2).map((line) => `  ${line}`)
        : [`  ${theme.dim(this.options.placeholder)}`]),
    ];
    if (this.error) {
      lines.push("");
      lines.push(theme.error(this.error));
    }
    lines.push("");
    lines.push(theme.dim("Enter: submit  •  Esc: cancel"));
    return lines.map((line) => truncateToWidth(line, w, "…"));
  }
}

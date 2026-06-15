import { type Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";

type SettingsScreenOpts = {
  cwd: string;
  theme: Theme;
  requestRender: () => void;
  onClose?: () => void;
};

export class SettingsScreen implements Component {
  constructor(private readonly opts: SettingsScreenOpts) {}

  async dispose() {}

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q" || data === "Q") {
      this.opts.onClose?.();
    }
  }

  modelLabel() {
    return "setup: standalone";
  }

  render(width: number): string[] {
    const lines = [
      this.opts.theme.fg("accent", this.opts.theme.bold("Settings")),
      "",
      "Pi authentication and model setup now open as standalone CLI screens.",
      "",
      "Use:",
      "  repochan login",
      "  repochan model",
      "  repochan settings",
      "",
      this.opts.theme.fg("dim", "esc / q  back"),
    ];
    return lines.map((line) => truncateToWidth(line, width, "..."));
  }
}

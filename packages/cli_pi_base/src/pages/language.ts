import { SelectList, matchesKey, Key, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

import { type OnBack } from "../types.js";
import { t, setUiLocale, getLanguage } from "../i18n.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
};

export class LanguageHost implements Component {
  private list: SelectList;
  private onBack: OnBack;
  private tui: any;
  private allowCancel: boolean;

  constructor(onBack: OnBack, tui?: any, options: { allowCancel?: boolean } = {}) {
    this.onBack = onBack;
    this.tui = tui;
    this.allowCancel = options.allowCancel !== false;

    const current = getLanguage();

    this.list = new SelectList(
      [
        { value: "en", label: "English" },
        { value: "zh", label: "中文" },
      ],
      5,
      {
        selectedPrefix: (s) => theme.accent("> " + s),
        selectedText: (s) => theme.accent(s),
        description: (s) => theme.dim(s),
        scrollInfo: (s) => theme.dim(s),
        noMatch: (s) => theme.dim(s),
      }
    );

    const initialIndex = current === "en" ? 0 : 1;
    this.list.setSelectedIndex(initialIndex);

    this.list.onSelect = (item) => {
      void (async () => {
        const newLang = item.value as "en" | "zh";
        await setUiLocale(newLang);
        this.onBack();
        // force re-render so parent settings list updates immediately
        if (this.tui && typeof this.tui.requestRender === 'function') {
          this.tui.requestRender();
        }
      })();
    };
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q") {
      if (this.allowCancel) this.onBack();
      return;
    }
    this.list.handleInput(data);
  }

  render(width: number): string[] {
    const lines: string[] = [];
    lines.push(theme.accent(t("language.title")));
    lines.push("");
    lines.push(t("language.prompt"));
    lines.push("");
    lines.push(...this.list.render(width - 2));
    lines.push("");
    lines.push(theme.dim(t("language.hint")));
    return lines.map((l) => truncateToWidth(l, width));
  }
}

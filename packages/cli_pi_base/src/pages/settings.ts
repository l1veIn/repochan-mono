import { matchesKey, Key, SelectList, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

import { type OnBack, type TuiRef } from "../types.js";
import { t, getLanguage, getLangLabel } from "../i18n.js";
import { LanguageHost } from "./language.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
};

export class SettingsHost implements Component {
  private onSelectModel: (tui?: any) => void;
  private onBack: OnBack;
  private list: SelectList;
  private tui: any;
  private langSub: Component | null = null;
  private lastLang = getLanguage();

  private buildList() {
    const items = [
      { value: "model", label: t("settings.model") },
      { value: "uiLocale", label: t("settings.language", { lang: getLangLabel() }) },
    ];
    const list = new SelectList(items, 5, {
      selectedPrefix: (s) => theme.accent("> " + s),
      selectedText: (s) => theme.accent(s),
      description: (s) => theme.dim(s),
      scrollInfo: (s) => theme.dim(s),
      noMatch: (s) => theme.dim(s),
    });
    list.onSelect = (item) => {
      if (item.value === "model") {
        this.onSelectModel(this.tui);
      } else if (item.value === "uiLocale") {
        this.enterLanguage();
      }
    };
    return list;
  }

  constructor(onSelectModel: (tui?: any) => void, onBack: OnBack, tui?: any) {
    this.onSelectModel = onSelectModel;
    this.onBack = onBack;
    this.tui = tui;
    this.list = this.buildList();
  }

  private enterLanguage() {
    this.langSub = new LanguageHost(() => this.exitLanguage(), this.tui);
  }

  private exitLanguage() {
    this.langSub = null;
    this.list = this.buildList();  // rebuild list so language label shows updated value
    if (this.tui && typeof this.tui.requestRender === 'function') {
      this.tui.requestRender();
    }
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (this.langSub) {
      this.langSub.handleInput?.(data);
      return;
    }
    if (matchesKey(data, Key.escape) || data === "q") {
      this.onBack();
      return;
    }
    this.list.handleInput(data);
  }

  render(width: number): string[] {
    if (this.langSub) {
      return this.langSub.render(width);
    }
    const currentLang = getLanguage();
    if (currentLang !== this.lastLang) {
      this.lastLang = currentLang;
      this.list = this.buildList();
    }
    const lines: string[] = [];
    lines.push(theme.accent(t("settings.title")));
    lines.push("");
    lines.push(t("settings.header"));
    lines.push("");
    lines.push(...this.list.render(width - 2));
    lines.push("");
    lines.push(theme.dim(t("settings.hint")));
    return lines.map((l) => truncateToWidth(l, width));
  }
}

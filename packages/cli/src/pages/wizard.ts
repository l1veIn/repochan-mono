import { matchesKey, Key, SelectList, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

import { type TuiRef } from "../types.js";
import { ModelHost } from "./model.js";
import { SettingsHost } from "./settings.js";
import { t, getLanguage } from "../i18n.js";
import { AnalysisPage } from "./analysis.js";
import { PersonaPage } from "./persona.js";
import { OrdersPage } from "./orders.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
};

export class WizardHost implements Component {
  private list: SelectList;
  private currentSub: Component | null = null;
  private lastLang = getLanguage();

  constructor(private tuiRef: TuiRef) {
    this.list = this.createMenuList();
  }

  private createMenuList() {
    const list = new SelectList(
      [
        { value: "analysis", label: t("wizard.analysis") },
        { value: "persona", label: t("wizard.persona") },
        { value: "orders", label: t("wizard.orders") },
        { value: "model", label: t("wizard.model") },
        { value: "settings", label: t("wizard.settings") },
        { value: "chat", label: t("wizard.chat") },
      ],
      10,
      {
        selectedPrefix: (s) => theme.accent("> " + s),
        selectedText: (s) => theme.accent(s),
        description: (s) => theme.dim(s),
        scrollInfo: (s) => theme.dim(s),
        noMatch: (s) => theme.dim(s),
      }
    );
    list.onSelect = (item) => {
      if (item.value === "analysis") this.enterSub(new AnalysisPage(() => this.exitSub(), this.tuiRef));
      else if (item.value === "persona") this.enterSub(new PersonaPage(() => this.exitSub(), this.tuiRef));
      else if (item.value === "orders") this.enterSub(new OrdersPage(() => this.exitSub(), this.tuiRef));
      else if (item.value === "model") this.enterSub(new ModelHost(() => this.exitSub(), this.tuiRef.getTui()));
      else if (item.value === "settings") {
        const settingsHost = new SettingsHost(
          (tui) => this.enterSub(new ModelHost(() => this.exitSub(), tui || this.tuiRef.getTui())),
          () => this.exitSub(),
          this.tuiRef.getTui()
        );
        this.enterSub(settingsHost);
      }
    };
    return list;
  }

  private enterSub(sub: Component) {
    this.currentSub = sub;
    this.tuiRef.setFocus(sub);
    this.tuiRef.requestRender();
  }

  private exitSub() {
    this.currentSub = null;
    this.tuiRef.setFocus(this);
    this.tuiRef.requestRender();
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (this.currentSub) {
      this.currentSub.handleInput?.(data);
      return;
    }
    if (matchesKey(data, Key.escape) || data === "q") return;
    this.list.handleInput(data);
  }

  render(width: number): string[] {
    if (this.currentSub) return this.currentSub.render(width);

    const currentLang = getLanguage();
    if (currentLang !== this.lastLang) {
      this.lastLang = currentLang;
      this.list = this.createMenuList();
    }

    const lines: string[] = [];
    lines.push(theme.accent(t("wizard.title")));
    lines.push("");
    lines.push(t("wizard.select"));
    lines.push("");
    lines.push(...this.list.render(width - 2));
    lines.push("");
    lines.push(theme.dim(t("wizard.hint")));
    return lines.map((l) => truncateToWidth(l, width));
  }
}

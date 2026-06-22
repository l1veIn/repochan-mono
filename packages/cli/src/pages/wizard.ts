import { matchesKey, Key, SelectList, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

import { type TuiRef } from "../types.js";
import { ModelHost } from "./model.js";
import { SettingsHost } from "./settings.js";
import { t, getLanguage } from "../i18n.js";
import { AnalysisPage } from "./analysis.js";
import { PersonaPage } from "./persona.js";
import { FoundationPage } from "./foundation.js";
import { OrdersPage } from "./orders.js";
import { readProtocolOverview } from "../lib/protocol.js";
import { checkPreconditions } from "../lib/precondition.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
};

export class WizardHost implements Component {
  private list: SelectList;
  private currentSub: Component | null = null;
  private lastLang = getLanguage();
  private loading = true;
  private status: {
    hasProtocol: boolean;
    hasAnalysis: boolean;
    hasPersona: boolean;
    hasFoundation: boolean;
    orderCount: number;
    recommended: "analysis" | "persona" | "foundation" | "orders";
  } | null = null;
  private statusError: string | null = null;

  constructor(
    private tuiRef: TuiRef,
    private actions: { onChat?: () => void; onSessions?: () => void } = {},
  ) {
    this.list = this.createMenuList();
    void this.loadStatus();
  }

  private createMenuList() {
    const recommended = this.status?.recommended;
    const items = [
      ...(recommended ? [{ value: recommended, label: `Recommended: ${this.labelFor(recommended)}` }] : []),
      { value: "analysis", label: t("wizard.analysis") },
      { value: "persona", label: t("wizard.persona") },
      { value: "foundation", label: t("wizard.foundation") },
      { value: "orders", label: t("wizard.orders") },
      { value: "chat", label: t("wizard.chat") },
      { value: "sessions", label: t("wizard.sessions") },
      { value: "model", label: t("wizard.model") },
      { value: "settings", label: t("wizard.settings") },
    ];
    const list = new SelectList(
      items,
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
      else if (item.value === "foundation") this.enterSub(new FoundationPage(() => this.exitSub(), this.tuiRef));
      else if (item.value === "orders") this.enterSub(new OrdersPage(() => this.exitSub(), this.tuiRef));
      else if (item.value === "chat") this.actions.onChat?.();
      else if (item.value === "sessions") this.actions.onSessions?.();
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

  private labelFor(value: string) {
    if (value === "analysis") return t("wizard.analysis");
    if (value === "persona") return t("wizard.persona");
    if (value === "foundation") return t("wizard.foundation");
    if (value === "orders") return t("wizard.orders");
    return value;
  }

  private async loadStatus() {
    this.loading = true;
    this.statusError = null;
    this.tuiRef.requestRender();
    try {
      const overview = await readProtocolOverview(process.cwd());
      const precond = await checkPreconditions(process.cwd(), {});
      const hasProtocol = Boolean(overview.protocol.exists);
      const hasAnalysis = Boolean((overview.protocol as any).analysis);
      const hasPersona = Boolean((overview.protocol as any).persona);
      const hasFoundation = Boolean(precond.foundation);
      const orderCount = Array.isArray(overview.orders.orders) ? overview.orders.orders.length : 0;
      let recommended: "analysis" | "persona" | "foundation" | "orders";
      if (!hasProtocol || !hasAnalysis) recommended = "analysis";
      else if (!hasPersona) recommended = "persona";
      else if (!hasFoundation) recommended = "foundation";
      else recommended = "orders";
      this.status = { hasProtocol, hasAnalysis, hasPersona, hasFoundation, orderCount, recommended };
      this.list = this.createMenuList();
    } catch (error) {
      this.statusError = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
      this.tuiRef.requestRender();
    }
  }

  private enterSub(sub: Component) {
    this.currentSub = sub;
    this.tuiRef.setFocus(sub);
    this.tuiRef.requestRender();
  }

  private exitSub() {
    this.currentSub = null;
    this.tuiRef.setFocus(this);
    void this.loadStatus();
    this.tuiRef.requestRender();
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (this.currentSub) {
      this.currentSub.handleInput?.(data);
      return;
    }
    if (matchesKey(data, Key.escape) || data === "q") return;
    if (data === "r" || data === "R") { void this.loadStatus(); return; }
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
    if (this.loading) {
      lines.push(theme.dim(t("common.loading")));
      lines.push("");
    } else if (this.statusError) {
      lines.push(chalk.red(this.statusError));
      lines.push("");
    } else if (this.status) {
      lines.push(...this.renderStatus());
      lines.push("");
    }
    lines.push(t("wizard.select"));
    lines.push("");
    lines.push(...this.list.render(width - 2));
    lines.push("");
    lines.push(theme.dim(t("wizard.hint")));
    return lines.map((l) => truncateToWidth(l, width));
  }

  private renderStatus() {
    const s = this.status;
    if (!s) return [];
    const yes = (value: boolean) => value ? chalk.green("yes") : chalk.yellow("no");
    return [
      `${theme.dim(".repochan:")} ${yes(s.hasProtocol)}  ${theme.dim("analysis:")} ${yes(s.hasAnalysis)}  ${theme.dim("persona:")} ${yes(s.hasPersona)}`,
      `${theme.dim("foundation:")} ${yes(s.hasFoundation)}  ${theme.dim("orders:")} ${s.orderCount}`,
      `${theme.accent("Next:")} ${this.labelFor(s.recommended)}`,
    ];
  }
}

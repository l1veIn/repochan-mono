import path from "node:path";
import { matchesKey, Key, SelectList, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";

import { type TuiRef } from "../types.js";
import { ModelHost } from "./model.js";
import { SettingsHost } from "./settings.js";
import { t, getLanguage } from "../i18n.js";
import { AnalysisPage } from "./analysis.js";
import { PersonaPage } from "./persona.js";
import { CreationTasksPage } from "./orders.js";
import { AddCreationTaskPage } from "./create-task.js";
import { GuidedWizardPage } from "./guided-wizard.js";
import { SessionsPage } from "./sessions.js";
import { readOnboardingProgress, type OnboardingProgress } from "../lib/onboarding.js";
import { actionBar, appHeader, pipelineList, statusGrid, type PipelineItem } from "../ui/layout.js";
import { uiTheme } from "../ui/theme.js";

type MenuRoute = "wizard" | "analysis" | "persona" | "create-task" | "orders" | "chat" | "sessions" | "model" | "settings";

export class HomePage implements Component {
  private list: SelectList;
  private currentSub: Component | null = null;
  private lastLang = getLanguage();
  private loading = true;
  private progress: OnboardingProgress | null = null;
  private statusError: string | null = null;

  constructor(
    private tuiRef: TuiRef,
    private actions: { onChat?: (initialMessage?: string) => void; onOpenSession?: (session: SessionInfo) => void } = {},
  ) {
    this.list = this.createMenuList();
    void this.loadStatus();
  }

  private createMenuList() {
    const p = this.progress;
    const items: { value: MenuRoute; label: string }[] = p ? [
      { value: "wizard", label: `${t("home.guided")} ${this.badge(p.complete ? t("home.badge.complete") : t("home.badge.incomplete"))}` },
      { value: "analysis", label: `${t("wizard.analysis")} ${this.badge(p.hasAnalysis ? t("home.badge.ready") : t("home.badge.missing"))}` },
      { value: "persona", label: `${t("wizard.persona")} ${this.badge(p.hasPersona ? t("home.badge.ready") : t("home.badge.missing"))}` },
      { value: "create-task", label: `${t("home.create_task")} ${this.badge(p.hasFoundationResult ? t("home.badge.ready") : p.hasFoundationOrder ? t("home.badge.order_ready") : t("home.badge.missing"))}` },
      { value: "orders", label: `${t("home.task_list")} ${this.badge(t("home.badge.orders", { count: p.orderCount }))}` },
      { value: "chat", label: t("wizard.chat") },
      { value: "sessions", label: t("wizard.sessions") },
      { value: "model", label: t("wizard.model") },
      { value: "settings", label: t("wizard.settings") },
    ] : [
      { value: "wizard", label: t("home.guided") },
      { value: "analysis", label: t("wizard.analysis") },
      { value: "persona", label: t("wizard.persona") },
      { value: "create-task", label: t("home.create_task") },
      { value: "orders", label: t("home.task_list") },
      { value: "chat", label: t("wizard.chat") },
      { value: "sessions", label: t("wizard.sessions") },
      { value: "model", label: t("wizard.model") },
      { value: "settings", label: t("wizard.settings") },
    ];
    const list = new SelectList(items, 10, {
      selectedPrefix: (s) => uiTheme.accent("> " + s),
      selectedText: (s) => uiTheme.accent(s),
      description: (s) => uiTheme.dim(s),
      scrollInfo: (s) => uiTheme.dim(s),
      noMatch: (s) => uiTheme.dim(s),
    });
    list.onSelect = (item) => this.openRoute(item.value as MenuRoute);
    return list;
  }

  private badge(text: string) {
    return uiTheme.dim(`· ${text}`);
  }

  private openRoute(value: MenuRoute) {
    if (value === "wizard") this.enterSub(new GuidedWizardPage(() => this.exitSub(), this.tuiRef, { allowRestartPrompt: true, onOpenHome: () => this.exitSub() }));
    else if (value === "analysis") this.enterSub(new AnalysisPage(() => this.exitSub(), this.tuiRef));
    else if (value === "persona") this.enterSub(new PersonaPage(() => this.exitSub(), this.tuiRef));
    else if (value === "create-task") this.enterSub(new AddCreationTaskPage(() => this.exitSub(), this.tuiRef, {
      onChat: (initialMessage) => this.actions.onChat?.(initialMessage),
    }));
    else if (value === "orders") this.enterSub(new CreationTasksPage(() => this.exitSub(), this.tuiRef));
    else if (value === "chat") this.actions.onChat?.();
    else if (value === "sessions") this.enterSub(new SessionsPage(() => this.exitSub(), this.tuiRef, (session) => this.actions.onOpenSession?.(session)));
    else if (value === "model") this.enterSub(new ModelHost(() => this.exitSub(), this.tuiRef.getTui()));
    else if (value === "settings") {
      const settingsHost = new SettingsHost(
        (tui) => this.enterSub(new ModelHost(() => this.exitSub(), tui || this.tuiRef.getTui())),
        () => this.exitSub(),
        this.tuiRef.getTui(),
      );
      this.enterSub(settingsHost);
    }
  }

  private async loadStatus() {
    this.loading = true;
    this.statusError = null;
    this.tuiRef.requestRender();
    try {
      this.progress = await readOnboardingProgress(process.cwd());
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
    if (data === "w" || data === "W") { this.openRoute("wizard"); return; }
    if (data === "s" || data === "S") { this.openRoute("settings"); return; }
    if (data === "m" || data === "M") { this.openRoute("model"); return; }
    if (data === "c" || data === "C") { this.openRoute("chat"); return; }
    this.list.handleInput(data);
  }

  render(width: number): string[] {
    if (this.currentSub) return this.currentSub.render(width);

    const currentLang = getLanguage();
    if (currentLang !== this.lastLang) {
      this.lastLang = currentLang;
      this.list = this.createMenuList();
    }

    const w = Math.max(56, width);
    const lines: string[] = [];
    lines.push(...appHeader({
      title: t("home.title"),
      subtitle: t("home.subtitle"),
      project: path.basename(process.cwd()),
      width: w,
    }));
    lines.push("");

    if (this.loading) {
      lines.push(uiTheme.dim(t("common.loading")));
      lines.push("");
    } else if (this.statusError) {
      lines.push(uiTheme.error(t("home.status_error")));
      lines.push(uiTheme.error(`  ${this.statusError}`));
      lines.push("");
    } else if (this.progress) {
      lines.push(...this.renderStatus(this.progress, w));
      lines.push("");
    }

    lines.push(uiTheme.accent(t("home.sections")));
    lines.push(...this.list.render(w - 2));
    lines.push("");
    lines.push(...actionBar([
      { key: "Enter", label: t("home.action.open"), tone: "accent" },
      { key: "r", label: t("wizard.action.refresh") },
      { key: "w", label: t("home.action.wizard") },
      { key: "s", label: t("wizard.action.settings") },
      { key: "q", label: t("wizard.action.quit") },
    ], w));
    return lines.map((line) => truncateToWidth(line, w, "…"));
  }

  private renderStatus(progress: OnboardingProgress, width: number) {
    const items: PipelineItem[] = [
      { label: t("wizard.analysis.short"), description: progress.hasAnalysis ? t("home.status.ready") : t("home.status.missing"), tone: progress.hasAnalysis ? "done" : "waiting" },
      { label: t("wizard.persona.short"), description: progress.hasPersona ? t("home.status.ready") : t("home.status.missing"), tone: progress.hasPersona ? "done" : "waiting" },
      { label: t("wizard.foundation.short"), description: progress.hasFoundationResult ? t("home.status.ready") : progress.hasFoundationOrder ? t("home.status.order_ready") : t("home.status.missing"), tone: progress.hasFoundationResult ? "done" : "waiting" },
    ];
    return [
      uiTheme.accent(t("home.spiria")),
      ...pipelineList(items, width),
      "",
      uiTheme.accent(t("home.assets")),
      ...statusGrid([
        { label: t("wizard.metric.orders"), value: progress.orderCount, tone: progress.orderCount > 0 ? "success" : "dim" },
        { label: t("wizard.metric.results"), value: progress.resultCount, tone: progress.resultCount > 0 ? "success" : "dim" },
      ], width),
    ];
  }
}

export { HomePage as HomeHost };

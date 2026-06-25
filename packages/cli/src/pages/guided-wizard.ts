import path from "node:path";
import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";

import { t } from "../i18n.js";
import { type OnBack, type TuiRef } from "../types.js";
import { AnalysisPage } from "./analysis.js";
import { InterviewPage } from "./interview.js";
import { PersonaPage } from "./persona.js";
import { AddCreationTaskPage } from "./create-task.js";
import { PaintPage } from "./paint.js";
import { readOnboardingProgress, type OnboardingProgress, type OnboardingStep } from "../lib/onboarding.js";
import { actionBar, appHeader, callout, pipelineList, type PipelineItem } from "../ui/layout.js";
import { uiTheme } from "../ui/theme.js";

export class GuidedWizardPage implements Component {
  private progress: OnboardingProgress | null = null;
  private loading = true;
  private error: string | null = null;
  private currentSub: Component | null = null;
  private restartMode = false;

  constructor(
    private onBack: OnBack,
    private tuiRef: TuiRef,
    private opts: { allowRestartPrompt?: boolean; onOpenHome?: () => void } = {},
  ) {
    void this.load();
  }

  private async load() {
    this.loading = true;
    this.error = null;
    this.tuiRef.requestRender();
    try {
      this.progress = await readOnboardingProgress(process.cwd());
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
      this.tuiRef.requestRender();
    }
  }

  private effectiveStep(): OnboardingStep {
    if (this.restartMode) return "analysis";
    return this.progress?.currentStep ?? "analysis";
  }

  private openCurrentStep() {
    const step = this.effectiveStep();
    if (step === "complete") {
      this.opts.onOpenHome?.();
      return;
    }
    if (step === "analysis") this.enterSub(new AnalysisPage(() => this.exitSub(), this.tuiRef));
    else if (step === "interview") this.enterSub(new InterviewPage(
      () => this.exitSub(),
      this.tuiRef,
      { onSkip: () => this.enterSub(new PersonaPage(() => this.exitSub(), this.tuiRef)) },
    ));
    else if (step === "persona") this.enterSub(new PersonaPage(() => this.exitSub(), this.tuiRef));
    else if (step === "foundation-order") this.enterSub(new AddCreationTaskPage(() => this.exitSub(), this.tuiRef));
    else this.enterSub(new PaintPage(() => this.exitSub(), this.tuiRef, this.progress?.foundationOrderId));
  }

  private enterSub(sub: Component) {
    this.currentSub = sub;
    this.tuiRef.setFocus(sub);
    this.tuiRef.requestRender();
  }

  private exitSub() {
    this.currentSub = null;
    this.tuiRef.setFocus(this);
    void this.load();
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (this.currentSub) {
      this.currentSub.handleInput?.(data);
      return;
    }
    if (matchesKey(data, Key.escape) || data === "q" || data === "Q") { this.onBack(); return; }
    if (data === "r" || data === "R") { void this.load(); return; }
    if (data === "h" || data === "H") { this.opts.onOpenHome?.(); return; }
    if (data === "w" || data === "W") { this.restartMode = true; this.tuiRef.requestRender(); return; }
    if (data === "\r") this.openCurrentStep();
  }

  render(width: number): string[] {
    if (this.currentSub) return this.currentSub.render(width);

    const w = Math.max(56, width);
    const lines: string[] = [];
    lines.push(...appHeader({
      title: t("guided.title"),
      subtitle: t("guided.subtitle"),
      project: path.basename(process.cwd()),
      width: w,
    }));
    lines.push("");

    if (this.loading) {
      lines.push(uiTheme.dim(t("common.loading")));
    } else if (this.error) {
      lines.push(uiTheme.error(t("guided.error")));
      lines.push(uiTheme.error(`  ${this.error}`));
    } else if (this.progress) {
      lines.push(...this.renderProgress(this.progress, w));
    }

    lines.push("");
    const actions = this.progress?.complete && !this.restartMode
      ? [
          { key: "Enter", label: t("guided.action.home"), tone: "accent" as const },
          { key: "w", label: t("guided.action.restart") },
          { key: "r", label: t("wizard.action.refresh") },
          { key: "q", label: t("wizard.action.quit") },
        ]
      : [
          { key: "Enter", label: t("guided.action.continue"), tone: "accent" as const },
          { key: "h", label: t("guided.action.home") },
          { key: "r", label: t("wizard.action.refresh") },
          { key: "Esc", label: t("guided.action.stop") },
        ];
    lines.push(...actionBar(actions, w));
    return lines.map((line) => truncateToWidth(line, w, "…"));
  }

  private renderProgress(progress: OnboardingProgress, width: number) {
    const step = this.effectiveStep();
    const lines: string[] = [];
    lines.push(uiTheme.accent(t("guided.steps")));
    lines.push(...pipelineList(this.pipelineItems(progress, step), width));
    lines.push("");

    if (progress.complete && !this.restartMode) {
      lines.push(...callout({
        title: t("guided.complete.title"),
        body: [t("guided.complete.body"), t("guided.complete.restart_hint")],
        tone: "success",
        width,
      }));
      return lines;
    }

    if (this.restartMode) {
      lines.push(...callout({
        title: t("guided.restart.title"),
        body: [t("guided.restart.body")],
        tone: "warn",
        width,
      }));
      lines.push("");
    }

    lines.push(...callout({
      title: this.stepTitle(step),
      body: [this.stepBody(step)],
      tone: "accent",
      width,
    }));
    return lines;
  }

  private pipelineItems(progress: OnboardingProgress, current: OnboardingStep): PipelineItem[] {
    const tone = (done: boolean, step: OnboardingStep) => done ? "done" : current === step ? "current" : "waiting";
    return [
      { label: t("wizard.analysis.short"), description: progress.hasAnalysis ? t("home.status.ready") : t("home.status.missing"), tone: tone(progress.hasAnalysis && !this.restartMode, "analysis") },
      { label: t("wizard.interview.short"), description: progress.hasInterview ? t("home.status.ready") : t("home.status.missing"), tone: tone(progress.hasInterview && !this.restartMode, "interview") },
      { label: t("wizard.persona.short"), description: progress.hasPersona ? t("home.status.ready") : t("home.status.missing"), tone: tone(progress.hasPersona && !this.restartMode, "persona") },
      { label: t("guided.step.foundation_order.short"), description: progress.hasFoundationOrder ? t("home.status.order_ready") : t("home.status.missing"), tone: tone(progress.hasFoundationOrder && !this.restartMode, "foundation-order") },
      { label: t("guided.step.foundation_paint.short"), description: progress.hasFoundationResult ? t("home.status.ready") : t("home.status.missing"), tone: tone(progress.hasFoundationResult && !this.restartMode, "foundation-paint") },
    ];
  }

  private stepTitle(step: OnboardingStep) {
    if (step === "analysis") return t("guided.step.analysis.title");
    if (step === "interview") return t("guided.step.interview.title");
    if (step === "persona") return t("guided.step.persona.title");
    if (step === "foundation-order") return t("guided.step.foundation_order.title");
    if (step === "foundation-paint") return t("guided.step.foundation_paint.title");
    return t("guided.complete.title");
  }

  private stepBody(step: OnboardingStep) {
    if (step === "analysis") return t("guided.step.analysis.body");
    if (step === "interview") return t("guided.step.interview.body");
    if (step === "persona") return t("guided.step.persona.body");
    if (step === "foundation-order") return t("guided.step.foundation_order.body");
    if (step === "foundation-paint") return t("guided.step.foundation_paint.body");
    return t("guided.complete.body");
  }
}

export { GuidedWizardPage as WizardHost };

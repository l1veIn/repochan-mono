import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

import { t } from "../i18n.js";
import { type OnBack, type TuiRef } from "../types.js";
import { AgentStatus } from "../components/agent-status.js";
import { ConfirmList, type ConfirmChoice } from "../components/confirm-list.js";
import { PromptInput } from "../components/prompt-input.js";
import { checkPreconditions } from "../lib/precondition.js";
import { readAnalysis, readInterview } from "../lib/protocol.js";
import { formatSessionSavedMessage, startRoleSession, type RunningRoleSession } from "../lib/runtime.js";
import { actionBar, appHeader, statusGrid } from "../ui/layout.js";
import { bulletList, paragraph, rawJson } from "../ui/detail.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  success: (s: string) => chalk.green(s),
  warn: (s: string) => chalk.yellow(s),
  error: (s: string) => chalk.red(s),
};

type Phase = "loading" | "idle" | "confirm" | "revision" | "running" | "done" | "error";

export class InterviewPage implements Component {
  private phase: Phase = "loading";
  private interview: any = null;
  private hasAnalysis = false;
  private warnings: string[] = [];
  private statusMsg: string | null = null;
  private agentStatus: AgentStatus | null = null;
  private running: RunningRoleSession | null = null;
  private confirm: ConfirmList | null = null;
  private revisionInput: PromptInput | null = null;
  private rawMode = false;

  constructor(
    private onBack: OnBack,
    private tuiRef: TuiRef,
    private opts: { onSkip?: () => void } = {},
  ) {
    void this.load();
  }

  private async load() {
    this.phase = "loading";
    this.tuiRef.requestRender();
    try {
      this.hasAnalysis = Boolean(await readAnalysis(process.cwd()));
      this.interview = await readInterview(process.cwd());
      const precond = await checkPreconditions(process.cwd(), { analysis: true });
      this.warnings = precond.warnings;
      this.phase = "idle";
    } catch (e: any) {
      this.statusMsg = e?.message || String(e);
      this.phase = "error";
    } finally {
      this.tuiRef.requestRender();
    }
  }

  private showConfirm() {
    const summary: string[] = [];
    if (this.interview?.summary) summary.push(`Summary: ${this.interview.summary}`);
    if (this.interview?.generatedAt) summary.push(`Generated: ${this.interview.generatedAt}`);

    this.confirm = new ConfirmList({
      title: t("interview.confirm_title"),
      summary,
      onSelect: (choice: ConfirmChoice) => {
        this.confirm = null;
        if (choice === "skip") { this.phase = "idle"; this.tuiRef.requestRender(); }
        else if (choice === "version" || choice === "overwrite") void this.startRun();
        else { this.phase = "idle"; this.tuiRef.requestRender(); }
      },
      onCancel: () => { this.confirm = null; this.phase = "idle"; this.tuiRef.requestRender(); },
    });
    this.phase = "confirm";
    this.tuiRef.requestRender();
  }

  private showRevisionInput() {
    this.revisionInput = new PromptInput({
      title: "=== Revise Interview ===",
      prompt: "Describe how to update .repochan/interview/current.json:",
      placeholder: "e.g. Add a preference for blue-pink palette and avoid mecha elements",
      onSubmit: (request) => {
        this.revisionInput = null;
        void this.startRun([
          "Revise the current interview report according to this user request.",
          "Read interview.current and analysis.current first, then call repochan action=\"interview.append\" with the additional questions/responses.",
          `User request: ${request}`,
        ].join("\n"));
      },
      onCancel: () => {
        this.revisionInput = null;
        this.phase = "idle";
        this.tuiRef.requestRender();
      },
    });
    this.phase = "revision";
    this.tuiRef.setFocus(this);
    this.tuiRef.requestRender();
  }

  private async startRun(goal?: string) {
    if (this.running) return;
    if (!this.hasAnalysis) {
      this.statusMsg = t("interview.needs_analysis");
      this.phase = "error";
      this.tuiRef.requestRender();
      return;
    }
    this.confirm = null;
    this.revisionInput = null;
    this.phase = "running";
    this.statusMsg = null;
    this.agentStatus?.dispose();
    this.agentStatus = new AgentStatus({ role: "pm", onRequestRender: () => this.tuiRef.requestRender() });
    this.tuiRef.requestRender();
    try {
      this.running = await startRoleSession({
        phase: "interview", cwd: process.cwd(), newSession: true,
        goal,
        onDone: () => void this.finishRun(),
        onError: (error: unknown) => this.failRun(error),
      });
      this.agentStatus.setSession(this.running.session);
      void this.running.done.catch(() => undefined);
    } catch (e) { this.failRun(e); }
  }

  private async finishRun() {
    this.agentStatus?.markDone();
    this.running = null;
    this.phase = "done";
    this.statusMsg = t("interview.done");
    await this.load();
  }

  private failRun(error: unknown) {
    this.agentStatus?.markError(error);
    const session = this.running;
    this.running = null;
    this.phase = "error";
    this.statusMsg = `${error instanceof Error ? error.message : String(error)}\n${formatSessionSavedMessage(session)}`;
    this.tuiRef.requestRender();
  }

  private async cancelRun() {
    if (!this.running) return;
    await this.running.abort();
    this.agentStatus?.markCancelled();
    this.running = null;
    this.phase = "idle";
    this.statusMsg = t("agent.status.cancelled");
    this.tuiRef.requestRender();
  }

  invalidate(): void { this.agentStatus?.invalidate(); }

  handleInput(data: string): void {
    if (this.phase === "confirm" && this.confirm) { this.confirm.handleInput(data); return; }
    if (this.phase === "revision" && this.revisionInput) { this.revisionInput.handleInput(data); return; }
    if (matchesKey(data, Key.escape) || data === "q" || data === "Q") {
      if (this.running) void this.cancelRun(); else this.onBack();
      return;
    }
    if (this.running) return;
    if (data === "r" || data === "R") { void this.load(); return; }
    if ((data === "j" || data === "J") && this.interview) { this.rawMode = !this.rawMode; this.tuiRef.requestRender(); return; }
    if ((data === "e" || data === "E") && this.interview) { this.showRevisionInput(); return; }
    if (data === "s" || data === "S") { this.opts.onSkip?.(); return; }
    if (data === "u" || data === "U" || data === "\r") {
      if (!this.hasAnalysis) { this.statusMsg = t("interview.needs_analysis"); this.tuiRef.requestRender(); return; }
      if (this.interview) this.showConfirm(); else void this.startRun();
    }
  }

  render(width: number): string[] {
    const w = Math.max(40, width);
    if (this.phase === "confirm" && this.confirm) return this.confirm.render(w);
    if (this.phase === "revision" && this.revisionInput) return this.revisionInput.render(w);

    const lines: string[] = [];
    lines.push(...appHeader({ title: t("interview.title"), subtitle: t("interview.subtitle"), width: w }));
    lines.push("");

    if (this.agentStatus && this.phase === "running") {
      lines.push(...this.agentStatus.render(w - 2));
      lines.push("");
    }

    if (this.phase === "loading") {
      lines.push(theme.dim(t("common.loading")));
    } else if (!this.hasAnalysis) {
      lines.push(...statusGrid([{ label: t("interview.state"), value: t("interview.state.blocked"), tone: "error" }], w));
      lines.push(theme.error(t("interview.needs_analysis")));
    } else if (!this.interview) {
      lines.push(...statusGrid([{ label: t("interview.state"), value: t("interview.state.empty"), tone: "warn" }], w));
      lines.push("");
      lines.push(theme.warn(`  ${t("interview.skip_hint")}`));
    } else if (this.rawMode) {
      lines.push(theme.accent(t("common.raw_json")));
      lines.push(...rawJson(this.interview, w, 40));
    } else {
      lines.push(...renderInterview(this.interview, w));
    }

    if (this.warnings.length) {
      lines.push("");
      for (const warn of this.warnings) lines.push(theme.warn(`  ⚠ ${warn}`));
    }

    if (this.statusMsg) {
      lines.push("");
      for (const line of this.statusMsg.split("\n")) {
        lines.push(this.phase === "error" ? theme.error(line) : theme.success(line));
      }
    }

    lines.push("");
    lines.push(...actionBar([
      { key: "Enter", label: this.interview ? t("interview.action.regenerate") : t("interview.action.generate"), tone: "accent" },
      ...(this.interview ? [{ key: "e", label: t("interview.action.edit") }] : []),
      ...(this.interview ? [{ key: "j", label: this.rawMode ? t("common.summary") : t("common.raw_json") }] : []),
      { key: "s", label: t("interview.action.skip") },
      { key: "r", label: t("wizard.action.refresh") },
      { key: "Esc", label: t("guided.action.stop") },
    ], w));
    return lines.map((l) => truncateToWidth(l, w, "…"));
  }
}

function renderInterview(interview: any, width: number) {
  const lines: string[] = [];
  if (interview.summary) {
    lines.push(...paragraph(t("interview.summary"), interview.summary, width));
  }
  lines.push(...bulletList(t("interview.constraints"), interview.keyConstraints, width));
  lines.push(...bulletList(t("interview.preferences"), interview.preferences, width));
  lines.push(...bulletList(t("interview.avoid"), interview.avoidList, width));
  return lines;
}

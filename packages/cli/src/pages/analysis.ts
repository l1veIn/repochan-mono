import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

import { t } from "../i18n.js";
import { type OnBack, type TuiRef } from "../types.js";
import { AgentStatus } from "../components/agent-status.js";
import { ConfirmList, type ConfirmChoice } from "../components/confirm-list.js";
import { PromptInput } from "../components/prompt-input.js";
import { checkPreconditions } from "../lib/precondition.js";
import { readAnalysis } from "../lib/protocol.js";
import { formatSessionSavedMessage, startRoleSession, type RunningRoleSession } from "../lib/runtime.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  success: (s: string) => chalk.green(s),
  warn: (s: string) => chalk.yellow(s),
  error: (s: string) => chalk.red(s),
};

type Phase = "loading" | "idle" | "confirm" | "revision" | "running" | "done" | "error";

export class AnalysisPage implements Component {
  private phase: Phase = "loading";
  private analysis: any = null;
  private warnings: string[] = [];
  private statusMsg: string | null = null;
  private agentStatus: AgentStatus | null = null;
  private running: RunningRoleSession | null = null;
  private confirm: ConfirmList | null = null;
  private revisionInput: PromptInput | null = null;

  constructor(private onBack: OnBack, private tuiRef: TuiRef) {
    void this.load();
  }

  private async load() {
    this.phase = "loading";
    this.tuiRef.requestRender();
    try {
      this.analysis = await readAnalysis(process.cwd());
      const precond = await checkPreconditions(process.cwd(), { protocol: true });
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
    if (this.analysis?.repo?.name) summary.push(`Repository: ${this.analysis.repo.name}`);
    if (this.analysis?.summary) summary.push(`Summary: ${this.analysis.summary}`);
    if (this.analysis?.generatedAt) summary.push(`Generated: ${this.analysis.generatedAt}`);

    this.confirm = new ConfirmList({
      title: t("analysis.confirm_title"),
      summary,
      onSelect: (choice: ConfirmChoice) => {
        this.confirm = null;
        if (choice === "skip") { this.phase = "idle"; this.tuiRef.requestRender(); }
        else if (choice === "version") void this.startRun();
        else if (choice === "overwrite") void this.startRun();
        else { this.phase = "idle"; this.tuiRef.requestRender(); }
      },
      onCancel: () => { this.confirm = null; this.phase = "idle"; this.tuiRef.requestRender(); },
    });
    this.phase = "confirm";
    this.tuiRef.requestRender();
  }

  private showRevisionInput() {
    this.revisionInput = new PromptInput({
      title: "=== Revise Analysis ===",
      prompt: "Describe how to update .repochan/analysis/current.json:",
      placeholder: "e.g. Set documentLanguage to 中文 and adjust native language evidence",
      onSubmit: (request) => {
        this.revisionInput = null;
        void this.startRun([
          "Revise the current analysis artifact according to this user request.",
          "Read analysis.current first, then call repochan action=\"analysis.update\" with overwrite=true and a minimal deep-merge patch.",
          "Do not re-run full repository analysis unless the request explicitly needs fresh evidence.",
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
    this.confirm = null;
    this.revisionInput = null;
    this.phase = "running";
    this.statusMsg = null;
    this.agentStatus?.dispose();
    this.agentStatus = new AgentStatus({ role: "analyst", onRequestRender: () => this.tuiRef.requestRender() });
    this.tuiRef.requestRender();
    try {
      this.running = await startRoleSession({
        phase: "analysis", cwd: process.cwd(), newSession: true,
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
    this.statusMsg = t("analysis.done");
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
    if ((data === "e" || data === "E") && this.analysis) { this.showRevisionInput(); return; }
    if (data === "u" || data === "U" || data === "\r") {
      if (this.analysis) this.showConfirm(); else void this.startRun();
    }
  }

  render(width: number): string[] {
    const w = Math.max(40, width);
    if (this.phase === "confirm" && this.confirm) return this.confirm.render(w);
    if (this.phase === "revision" && this.revisionInput) return this.revisionInput.render(w);

    const lines: string[] = [];
    lines.push(theme.accent(t("analysis.title")));
    lines.push(theme.dim(t("analysis.subtitle")));
    lines.push("");

    if (this.agentStatus && this.phase === "running") {
      lines.push(...this.agentStatus.render(w - 2));
      lines.push("");
    }

    if (this.phase === "loading") {
      lines.push(theme.dim(t("common.loading")));
    } else if (this.phase === "error" && !this.agentStatus) {
      lines.push(theme.error(this.statusMsg || "Error"));
    } else if (!this.analysis) {
      lines.push(theme.dim(t("analysis.empty")));
      lines.push("");
      lines.push(theme.success("  [Enter/u] Start analysis"));
    } else {
      lines.push(...renderAnalysisSummary(this.analysis, w));
      lines.push("");
      lines.push(theme.success("  [Enter/u] Re-run analysis  [e] Edit analysis"));
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
    lines.push(theme.dim(t("analysis.hint")));
    return lines.map((l) => truncateToWidth(l, w, "…"));
  }
}

function renderAnalysisSummary(analysis: any, width: number) {
  const lines: string[] = [];
  if (analysis.repo) {
    lines.push(theme.accent(t("analysis.repo")));
    lines.push(`  name: ${analysis.repo.name ?? "?"}`);
    if (analysis.repo.remote) lines.push(`  remote: ${analysis.repo.remote}`);
    if (analysis.repo.head) lines.push(`  head: ${analysis.repo.head}`);
  }
  if (analysis.documentLanguage || analysis.languageSignals) {
    lines.push("");
    lines.push(theme.accent("Language"));
    if (analysis.documentLanguage) lines.push(`  document: ${analysis.documentLanguage}`);
    const signals = analysis.languageSignals;
    if (signals?.nativeLanguage) lines.push(`  native: ${signals.nativeLanguage}`);
    if (typeof signals?.confidence === "number") lines.push(`  confidence: ${Math.round(signals.confidence * 100)}%`);
    if (Array.isArray(signals?.evidence) && signals.evidence.length > 0) {
      lines.push(`  evidence: ${signals.evidence.slice(0, 3).join("; ")}`);
    }
  }
  if (analysis.summary) {
    lines.push("");
    lines.push(theme.accent(t("analysis.summary")));
    lines.push(...wrap(String(analysis.summary), width - 2).map((l) => `  ${l}`));
  }
  const tech = analysis.technicalProfile ?? analysis.context?.tech_stack;
  if (tech) {
    lines.push("");
    lines.push(theme.accent(t("analysis.tech")));
    lines.push(...objectPreview(tech, width).map((l) => `  ${l}`));
  }
  const visual = analysis.visualSignals;
  if (visual) {
    lines.push("");
    lines.push(theme.accent(t("analysis.visual")));
    if (Array.isArray(visual.colors)) lines.push(`  colors: ${visual.colors.slice(0, 8).join(", ")}`);
    if (Array.isArray(visual.existingAssets)) lines.push(`  assets: ${visual.existingAssets.length}`);
  }
  const creative = analysis.creativeSignals;
  if (creative) {
    lines.push("");
    lines.push(theme.accent(t("analysis.creative")));
    for (const key of ["anchors", "tensions", "motifs", "antiMotifs"]) {
      if (Array.isArray(creative[key])) lines.push(`  ${key}: ${creative[key].slice(0, 5).join(", ")}`);
    }
  }
  return lines;
}

function objectPreview(value: any, width: number) {
  return JSON.stringify(value, null, 2).split("\n").slice(0, 8).map((line) => truncateToWidth(line, width - 4, "…"));
}

function wrap(text: string, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > width && line) { lines.push(line); line = word; }
    else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 8);
}

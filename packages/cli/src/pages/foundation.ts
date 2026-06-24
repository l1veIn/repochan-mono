import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

import { t } from "../i18n.js";
import { type OnBack, type TuiRef } from "../types.js";
import { AgentStatus } from "../components/agent-status.js";
import { ConfirmList, type ConfirmChoice } from "../components/confirm-list.js";
import { checkPreconditions } from "../lib/precondition.js";
import { formatSessionSavedMessage, startRoleSession, type RunningRoleSession } from "../lib/runtime.js";
import { listOrderResults } from "../lib/protocol.js";
import { actionBar, appHeader, statusGrid } from "../ui/layout.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  success: (s: string) => chalk.green(s),
  warn: (s: string) => chalk.yellow(s),
  error: (s: string) => chalk.red(s),
};

type Phase = "loading" | "idle" | "confirm" | "running" | "done" | "error";

export class FoundationPage implements Component {
  private phase: Phase = "loading";
  private blockReason: string | null = null;
  private warnings: string[] = [];
  private statusMsg: string | null = null;
  private agentStatus: AgentStatus | null = null;
  private running: RunningRoleSession | null = null;
  private confirm: ConfirmList | null = null;
  private foundationInfo: { orderId: string; versionId: string; files: string[] } | null = null;

  constructor(private onBack: OnBack, private tuiRef: TuiRef) {
    void this.load();
  }

  private async load() {
    this.phase = "loading";
    this.tuiRef.requestRender();
    try {
      const precond = await checkPreconditions(process.cwd(), { analysis: true, persona: true });
      this.warnings = precond.warnings;
      if (!precond.ok) {
        this.blockReason = precond.blockReason ?? "Blocked";
        this.phase = "error";
      } else {
        this.blockReason = null;
        if (precond.foundation) {
          this.foundationInfo = {
            orderId: precond.foundation.orderId,
            versionId: precond.foundation.versionId,
            files: precond.foundation.files,
          };
        } else {
          this.foundationInfo = null;
        }
        this.phase = "idle";
      }
    } catch (e: any) {
      this.blockReason = e?.message || String(e);
      this.phase = "error";
    } finally {
      this.tuiRef.requestRender();
    }
  }

  private showConfirm() {
    const summary: string[] = [];
    if (this.foundationInfo) {
      summary.push(`Order: ${this.foundationInfo.orderId}`);
      summary.push(`Version: ${this.foundationInfo.versionId}`);
      summary.push(`Files: ${this.foundationInfo.files.join(", ")}`);
    }

    this.confirm = new ConfirmList({
      title: t("foundation.confirm_title"),
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

  private async startRun() {
    if (this.running) return;
    this.confirm = null;
    this.phase = "running";
    this.statusMsg = null;
    this.agentStatus?.dispose();
    this.agentStatus = new AgentStatus({ role: "pm", onRequestRender: () => this.tuiRef.requestRender() });
    this.tuiRef.requestRender();
    try {
      this.running = await startRoleSession({
        phase: "orders",
        goal: "Create foundation sheet order for this repository",
        cwd: process.cwd(),
        newSession: true,
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
    this.statusMsg = t("foundation.done");
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
    if (matchesKey(data, Key.escape) || data === "q" || data === "Q") {
      if (this.running) void this.cancelRun(); else this.onBack();
      return;
    }
    if (this.running) return;
    if (data === "r" || data === "R") { void this.load(); return; }
    if (data === "u" || data === "U" || data === "\r") {
      if (this.foundationInfo) this.showConfirm(); else void this.startRun();
    }
  }

  render(width: number): string[] {
    const w = Math.max(40, width);
    if (this.phase === "confirm" && this.confirm) return this.confirm.render(w);

    const lines: string[] = [];
    lines.push(...appHeader({ title: t("foundation.title"), subtitle: t("foundation.subtitle"), width: w }));
    lines.push("");

    if (this.agentStatus && this.phase === "running") {
      lines.push(...this.agentStatus.render(w - 2));
      lines.push("");
    }

    if (this.phase === "loading") {
      lines.push(theme.dim(t("common.loading")));
    } else if (this.blockReason) {
      lines.push(...statusGrid([{ label: t("foundation.state"), value: t("persona.state.blocked"), tone: "error" }], w));
      lines.push(theme.error(this.blockReason));
    } else if (!this.foundationInfo) {
      lines.push(...statusGrid([{ label: t("foundation.state"), value: t("foundation.state.empty"), tone: "warn" }], w));
    } else {
      lines.push(...statusGrid([
        { label: t("foundation.state"), value: t("home.status.ready"), tone: "success" },
        { label: "order", value: this.foundationInfo.orderId },
        { label: "version", value: this.foundationInfo.versionId },
        { label: "files", value: this.foundationInfo.files.length, tone: "success" },
      ], w));
      lines.push(`  ${this.foundationInfo.files.map((f) => truncateToWidth(f, w - 10, "…")).join(", ")}`);
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
      { key: "Enter", label: this.foundationInfo ? t("foundation.action.regenerate") : t("foundation.action.create"), tone: "accent" },
      { key: "r", label: t("wizard.action.refresh") },
      { key: "Esc", label: t("guided.action.stop") },
    ], w));
    return lines.map((l) => truncateToWidth(l, w, "…"));
  }
}

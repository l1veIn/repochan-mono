import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

import { t } from "../i18n.js";
import { type OnBack, type TuiRef } from "../types.js";
import { AgentStatus } from "../components/agent-status.js";
import { readAnalysis } from "../lib/protocol.js";
import { startRoleSession, type RunningRoleSession } from "../lib/runtime.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  success: (s: string) => chalk.green(s),
  error: (s: string) => chalk.red(s),
};

export class AnalysisPage implements Component {
  private analysis: any = null;
  private loading = false;
  private error: string | null = null;
  private statusMsg: string | null = null;
  private agentStatus: AgentStatus | null = null;
  private running: RunningRoleSession | null = null;

  constructor(private onBack: OnBack, private tuiRef: TuiRef) {
    void this.load();
  }

  private async load() {
    this.loading = true;
    this.error = null;
    this.tuiRef.requestRender();
    try {
      this.analysis = await readAnalysis(process.cwd());
    } catch (e: any) {
      this.error = e?.message || String(e);
    } finally {
      this.loading = false;
      this.tuiRef.requestRender();
    }
  }

  private async runAnalyst() {
    if (this.running) return;
    this.statusMsg = null;
    this.agentStatus?.dispose();
    this.agentStatus = new AgentStatus({ role: "analyst", onRequestRender: () => this.tuiRef.requestRender() });
    this.tuiRef.requestRender();
    try {
      this.running = await startRoleSession({
        phase: "analysis",
        cwd: process.cwd(),
        newSession: true,
        onDone: () => void this.finishRun(),
        onError: (error: unknown) => this.failRun(error),
      });
      this.agentStatus.setSession(this.running.session);
      void this.running.done.catch(() => undefined);
    } catch (e) {
      this.failRun(e);
    }
  }

  private async finishRun() {
    this.agentStatus?.markDone();
    this.running = null;
    this.statusMsg = t("analysis.done");
    await this.load();
  }

  private failRun(error: unknown) {
    this.agentStatus?.markError(error);
    this.running = null;
    this.statusMsg = error instanceof Error ? error.message : String(error);
    this.tuiRef.requestRender();
  }

  private async cancelRun() {
    if (!this.running) return;
    await this.running.abort();
    this.agentStatus?.markCancelled();
    this.running = null;
    this.statusMsg = t("agent.status.cancelled");
    this.tuiRef.requestRender();
  }

  invalidate(): void {
    this.agentStatus?.invalidate();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q" || data === "Q") {
      if (this.running) void this.cancelRun();
      else this.onBack();
      return;
    }
    if (data === "r" || data === "R") void this.load();
    if (data === "u" || data === "U") void this.runAnalyst();
  }

  render(width: number): string[] {
    const w = Math.max(40, width);
    const lines: string[] = [];
    lines.push(theme.accent(t("analysis.title")));
    lines.push(theme.dim(t("analysis.subtitle")));
    lines.push("");

    if (this.agentStatus) {
      lines.push(...this.agentStatus.render(w - 2));
      lines.push("");
    }

    if (this.loading) lines.push(theme.dim(t("common.loading")));
    else if (this.error) lines.push(theme.error(this.error));
    else if (!this.analysis) lines.push(theme.dim(t("analysis.empty")));
    else lines.push(...renderAnalysisSummary(this.analysis, w));

    if (this.statusMsg) {
      lines.push("");
      lines.push(theme.success(this.statusMsg));
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
  const text = JSON.stringify(value, null, 2).split("\n").slice(0, 8);
  return text.map((line) => truncateToWidth(line, width - 4, "…"));
}

function wrap(text: string, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 8);
}

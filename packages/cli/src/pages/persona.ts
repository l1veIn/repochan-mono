import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

import { t } from "../i18n.js";
import { type OnBack, type TuiRef } from "../types.js";
import { AgentStatus } from "../components/agent-status.js";
import { readAnalysis, readPersona } from "../lib/protocol.js";
import { startRoleSession, type RunningRoleSession } from "../lib/runtime.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  success: (s: string) => chalk.green(s),
  error: (s: string) => chalk.red(s),
};

export class PersonaPage implements Component {
  private persona: any = null;
  private hasAnalysis = false;
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
      this.hasAnalysis = Boolean(await readAnalysis(process.cwd()));
      this.persona = await readPersona(process.cwd());
    } catch (e: any) {
      this.error = e?.message || String(e);
    } finally {
      this.loading = false;
      this.tuiRef.requestRender();
    }
  }

  private async runCreative() {
    if (this.running) return;
    if (!this.hasAnalysis) {
      this.statusMsg = t("persona.needs_analysis");
      this.tuiRef.requestRender();
      return;
    }
    this.statusMsg = null;
    this.agentStatus?.dispose();
    this.agentStatus = new AgentStatus({ role: "creative", onRequestRender: () => this.tuiRef.requestRender() });
    this.tuiRef.requestRender();
    try {
      this.running = await startRoleSession({
        phase: "persona",
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
    this.statusMsg = t("persona.done");
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
    if (data === "u" || data === "U") void this.runCreative();
  }

  render(width: number): string[] {
    const w = Math.max(40, width);
    const lines: string[] = [];
    lines.push(theme.accent(t("persona.title")));
    lines.push(theme.dim(t("persona.subtitle")));
    lines.push("");

    if (this.agentStatus) {
      lines.push(...this.agentStatus.render(w - 2));
      lines.push("");
    }

    if (this.loading) lines.push(theme.dim(t("common.loading")));
    else if (this.error) lines.push(theme.error(this.error));
    else if (!this.hasAnalysis) lines.push(theme.error(t("persona.needs_analysis")));
    else if (!this.persona) lines.push(theme.dim(t("persona.empty")));
    else lines.push(...renderPersona(this.persona, w));

    if (this.statusMsg) {
      lines.push("");
      lines.push(theme.success(this.statusMsg));
    }

    lines.push("");
    lines.push(theme.dim(t("persona.hint")));
    return lines.map((l) => truncateToWidth(l, w, "…"));
  }
}

function renderPersona(persona: any, width: number) {
  const lines: string[] = [];
  const name = persona.name?.primary ?? persona.name ?? "?";
  lines.push(`${theme.accent(t("persona.name"))}: ${name}`);
  if (persona.coreConcept) lines.push(...wrap(`${t("persona.concept")}: ${persona.coreConcept}`, width));
  section(lines, t("persona.profile"), persona.characterProfile, width);
  section(lines, t("persona.appearance"), persona.appearance, width);
  section(lines, t("persona.relationships"), persona.relationships, width);
  section(lines, t("persona.hooks"), persona.artDirectionHooks, width);
  section(lines, t("persona.boundaries"), persona.boundaries, width);
  return lines;
}

function section(lines: string[], title: string, value: any, width: number) {
  if (!value) return;
  lines.push("");
  lines.push(theme.accent(title));
  lines.push(...JSON.stringify(value, null, 2).split("\n").slice(0, 10).map((l) => truncateToWidth(`  ${l}`, width, "…")));
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
  return lines.slice(0, 6);
}

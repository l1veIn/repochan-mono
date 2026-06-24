import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

import { t } from "../i18n.js";
import { type OnBack, type TuiRef } from "../types.js";
import { AgentStatus } from "../components/agent-status.js";
import { ConfirmList, type ConfirmChoice } from "../components/confirm-list.js";
import { PromptInput } from "../components/prompt-input.js";
import { checkPreconditions } from "../lib/precondition.js";
import { readAnalysis, readPersona } from "../lib/protocol.js";
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

export class PersonaPage implements Component {
  private phase: Phase = "loading";
  private persona: any = null;
  private hasAnalysis = false;
  private warnings: string[] = [];
  private statusMsg: string | null = null;
  private agentStatus: AgentStatus | null = null;
  private running: RunningRoleSession | null = null;
  private confirm: ConfirmList | null = null;
  private revisionInput: PromptInput | null = null;
  private rawMode = false;

  constructor(private onBack: OnBack, private tuiRef: TuiRef) {
    void this.load();
  }

  private async load() {
    this.phase = "loading";
    this.tuiRef.requestRender();
    try {
      this.hasAnalysis = Boolean(await readAnalysis(process.cwd()));
      this.persona = await readPersona(process.cwd());
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
    const name = this.persona?.name?.primary ?? this.persona?.name ?? "?";
    const concept = this.persona?.coreConcept ?? this.persona?.backstory ?? "";
    summary.push(`Name: ${name}`);
    if (concept) summary.push(`Concept: ${concept}`);

    this.confirm = new ConfirmList({
      title: t("persona.confirm_title"),
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
      title: "=== Revise Persona ===",
      prompt: "Describe how to update .repochan/persona/current.json:",
      placeholder: "e.g. Rewrite the persona document in Chinese with blue-pink colors",
      onSubmit: (request) => {
        this.revisionInput = null;
        void this.startRun([
          "Revise the current persona artifact according to this user request.",
          "Read current analysis and persona first, then call repochan action=\"persona.update\" with a complete updated persona object and overwrite=true.",
          "Keep rolePrompt in English image-generation tags regardless of the persona document language.",
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
      this.statusMsg = t("persona.needs_analysis");
      this.phase = "error";
      this.tuiRef.requestRender();
      return;
    }
    this.confirm = null;
    this.revisionInput = null;
    this.phase = "running";
    this.statusMsg = null;
    this.agentStatus?.dispose();
    this.agentStatus = new AgentStatus({ role: "creative", onRequestRender: () => this.tuiRef.requestRender() });
    this.tuiRef.requestRender();
    try {
      this.running = await startRoleSession({
        phase: "persona", cwd: process.cwd(), newSession: true,
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
    this.statusMsg = t("persona.done");
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
    if ((data === "j" || data === "J") && this.persona) { this.rawMode = !this.rawMode; this.tuiRef.requestRender(); return; }
    if ((data === "e" || data === "E") && this.persona) { this.showRevisionInput(); return; }
    if (data === "u" || data === "U" || data === "\r") {
      if (!this.hasAnalysis) { this.statusMsg = t("persona.needs_analysis"); this.tuiRef.requestRender(); return; }
      if (this.persona) this.showConfirm(); else void this.startRun();
    }
  }

  render(width: number): string[] {
    const w = Math.max(40, width);
    if (this.phase === "confirm" && this.confirm) return this.confirm.render(w);
    if (this.phase === "revision" && this.revisionInput) return this.revisionInput.render(w);

    const lines: string[] = [];
    lines.push(...appHeader({ title: t("persona.title"), subtitle: t("persona.subtitle"), width: w }));
    lines.push("");

    if (this.agentStatus && this.phase === "running") {
      lines.push(...this.agentStatus.render(w - 2));
      lines.push("");
    }

    if (this.phase === "loading") {
      lines.push(theme.dim(t("common.loading")));
    } else if (!this.hasAnalysis) {
      lines.push(...statusGrid([{ label: t("persona.state"), value: t("persona.state.blocked"), tone: "error" }], w));
      lines.push(theme.error(t("persona.needs_analysis")));
    } else if (!this.persona) {
      lines.push(...statusGrid([{ label: t("persona.state"), value: t("persona.state.empty"), tone: "warn" }], w));
    } else if (this.rawMode) {
      lines.push(theme.accent(t("common.raw_json")));
      lines.push(...rawJson(this.persona, w, 40));
    } else {
      lines.push(...renderPersona(this.persona, w));
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
      { key: "Enter", label: this.persona ? t("persona.action.regenerate") : t("persona.action.generate"), tone: "accent" },
      ...(this.persona ? [{ key: "e", label: t("persona.action.edit") }] : []),
      ...(this.persona ? [{ key: "j", label: this.rawMode ? t("common.summary") : t("common.raw_json") }] : []),
      { key: "r", label: t("wizard.action.refresh") },
      { key: "Esc", label: t("guided.action.stop") },
    ], w));
    return lines.map((l) => truncateToWidth(l, w, "…"));
  }
}

function renderPersona(persona: any, width: number) {
  const lines: string[] = [];
  const name = persona.name?.primary ?? persona.name ?? "?";
  lines.push(`${theme.accent(t("persona.name"))}: ${name}`);
  if (persona.language || persona.nativeLanguage) {
    const parts = [];
    if (persona.language) parts.push(`language: ${persona.language}`);
    if (persona.nativeLanguage) parts.push(`native: ${persona.nativeLanguage}`);
    lines.push(parts.join("  "));
  }
  if (persona.coreConcept) lines.push(...paragraph(t("persona.concept"), persona.coreConcept, width));
  lines.push(...bulletList("Personality", persona.personality ?? persona.characterTraits, width));
  lines.push(...bulletList("Visual motifs", persona.visualMotifs ?? persona.appearance?.motifs, width));
  lines.push(...bulletList("Flaws", persona.characterFlaws, width));
  if (persona.catchphrase) lines.push(`Catchphrase: ${persona.catchphrase}`);
  if (persona.rolePrompt) {
    lines.push("");
    lines.push(theme.accent("Role Prompt (image tags)"));
    lines.push(...wrap(persona.rolePrompt, width - 2).map((l) => `  ${l}`));
  }
  return lines;
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
  return lines.slice(0, 6);
}

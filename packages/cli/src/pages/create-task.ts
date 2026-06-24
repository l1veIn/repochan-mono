import { Key, matchesKey, SelectList, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";
import { createOrders } from "@repochan/core";

import { PromptInput } from "../components/prompt-input.js";
import { AgentStatus } from "../components/agent-status.js";
import { t } from "../i18n.js";
import { formatSessionSavedMessage, startRoleSession, type RunningRoleSession } from "../lib/runtime.js";
import type { OnBack, TuiRef } from "../types.js";
import { actionBar, appHeader, callout } from "../ui/layout.js";
import { bulletList, keyValueRows, rawJson, toStringArray, wrapText } from "../ui/detail.js";

type CreateMode = "auto" | "chat" | "manual" | "import";
type ManualStep = "assetType" | "intent" | "deliverable" | "criteria" | "mustInclude" | "avoid" | "preview";

type ManualDraft = {
  assetType?: string;
  intent?: string;
  deliverable?: string;
  acceptanceCriteria?: string[];
  mustInclude?: string[];
  avoid?: string[];
};

type CreateTaskActions = {
  onDone?: () => void;
  onChat?: (initialMessage: string) => void;
};

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  success: (s: string) => chalk.green(s),
  error: (s: string) => chalk.red(s),
};

export class CreateTaskPage implements Component {
  private list: SelectList;
  private promptInput: PromptInput | null = null;
  private agentStatus: AgentStatus | null = null;
  private running: RunningRoleSession | null = null;
  private statusMsg: string | null = null;
  private manualStep: ManualStep | null = null;
  private manualDraft: ManualDraft = {};
  private manualRaw = false;

  constructor(
    private onBack: OnBack,
    private tuiRef: TuiRef,
    private actions: CreateTaskActions = {},
  ) {
    this.list = this.createList();
  }

  private createList() {
    const items: { value: CreateMode; label: string }[] = [
      { value: "auto", label: t("create_task.mode.auto") },
      { value: "chat", label: t("create_task.mode.chat") },
      { value: "manual", label: t("create_task.mode.manual") },
      { value: "import", label: t("create_task.mode.import") },
    ];
    const list = new SelectList(items, 8, {
      selectedPrefix: (s) => theme.accent("> " + s),
      selectedText: (s) => theme.accent(s),
      description: (s) => theme.dim(s),
      scrollInfo: (s) => theme.dim(s),
      noMatch: (s) => theme.dim(s),
    });
    list.onSelect = (item) => this.selectMode((item as { value: CreateMode }).value);
    return list;
  }

  private selectMode(mode: CreateMode) {
    if (mode === "auto") { void this.runAutoPlanner(); return; }
    if (mode === "chat") { this.openChatPlanner(); return; }
    if (mode === "manual") { this.startManualWizard(); return; }
    this.openImportJsonInput();
  }

  private async runAutoPlanner() {
    if (this.running) return;
    this.statusMsg = null;
    this.agentStatus?.dispose();
    this.agentStatus = new AgentStatus({ role: "pm", onRequestRender: () => this.tuiRef.requestRender() });
    this.tuiRef.requestRender();
    try {
      this.running = await startRoleSession({
        phase: "orders",
        goal: "Create or regenerate RepoChan creation tasks based on the current repository profile, Spiria profile, and visual anchor. Prefer a small set of concrete, executable tasks.",
        cwd: process.cwd(),
        newSession: true,
        onDone: () => void this.finishAutoPlanner(),
        onError: (error: unknown) => this.failRun(error),
      });
      this.agentStatus.setSession(this.running.session);
      void this.running.done.catch(() => undefined);
    } catch (error) {
      this.failRun(error);
    }
  }

  private async finishAutoPlanner() {
    this.agentStatus?.markDone();
    this.running = null;
    this.statusMsg = t("create_task.auto.done");
    this.actions.onDone?.();
    this.tuiRef.requestRender();
  }

  private failRun(error: unknown) {
    this.agentStatus?.markError(error);
    const session = this.running;
    this.running = null;
    this.statusMsg = `${error instanceof Error ? error.message : String(error)}\n${formatSessionSavedMessage(session)}`;
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

  private openChatPlanner() {
    if (!this.actions.onChat) {
      this.statusMsg = t("create_task.chat.unavailable");
      this.tuiRef.requestRender();
      return;
    }
    this.actions.onChat(t("create_task.chat.initial_message"));
  }

  private startManualWizard() {
    this.manualDraft = {};
    this.manualRaw = false;
    this.openManualStep("assetType");
  }

  private openManualStep(step: ManualStep) {
    this.manualStep = step;
    if (step === "preview") {
      this.promptInput = null;
      this.tuiRef.requestRender();
      return;
    }
    this.promptInput = new PromptInput({
      title: t("create_task.manual.wizard_title"),
      prompt: manualPrompt(step),
      placeholder: manualPlaceholder(step),
      onSubmit: (value) => {
        this.applyManualValue(step, value);
        this.openManualStep(nextManualStep(step));
      },
      onCancel: () => this.cancelManualWizard(),
    });
    this.tuiRef.requestRender();
  }

  private applyManualValue(step: ManualStep, value: string) {
    if (step === "assetType") this.manualDraft.assetType = slug(value);
    if (step === "intent") this.manualDraft.intent = value;
    if (step === "deliverable") this.manualDraft.deliverable = value;
    if (step === "criteria") this.manualDraft.acceptanceCriteria = toStringArray(value);
    if (step === "mustInclude") this.manualDraft.mustInclude = toStringArray(value);
    if (step === "avoid") this.manualDraft.avoid = toStringArray(value);
  }

  private cancelManualWizard() {
    this.promptInput = null;
    this.manualStep = null;
    this.manualDraft = {};
    this.manualRaw = false;
    this.tuiRef.requestRender();
  }

  private openImportJsonInput() {
    this.promptInput = new PromptInput({
      title: t("create_task.import.title"),
      prompt: t("create_task.import.prompt"),
      placeholder: t("create_task.import.placeholder"),
      onSubmit: (value) => void this.submitImportJson(value),
      onCancel: () => {
        this.promptInput = null;
        this.tuiRef.requestRender();
      },
    });
    this.tuiRef.requestRender();
  }

  private async submitImportJson(value: string) {
    try {
      const parsed = JSON.parse(value);
      const params = normalizeManualOrderParams(parsed);
      await createOrders(process.cwd(), params);
      this.promptInput = null;
      this.statusMsg = t("create_task.import.done");
      this.actions.onDone?.();
    } catch (error) {
      this.statusMsg = error instanceof Error ? error.message : String(error);
    } finally {
      this.tuiRef.requestRender();
    }
  }

  private async createManualTask() {
    try {
      await createOrders(process.cwd(), { order: buildManualOrder(this.manualDraft) });
      this.statusMsg = t("create_task.manual.done");
      this.cancelManualWizard();
      this.actions.onDone?.();
    } catch (error) {
      this.statusMsg = error instanceof Error ? error.message : String(error);
      this.tuiRef.requestRender();
    }
  }

  invalidate(): void {
    this.agentStatus?.invalidate();
  }

  handleInput(data: string): void {
    if (this.promptInput) { this.promptInput.handleInput(data); return; }
    if (this.manualStep === "preview") {
      if (matchesKey(data, Key.escape) || data === "q" || data === "Q") { this.cancelManualWizard(); return; }
      if (data === "e" || data === "E") { this.startManualWizard(); return; }
      if (data === "j" || data === "J") { this.manualRaw = !this.manualRaw; this.tuiRef.requestRender(); return; }
      if (data === "\r") { void this.createManualTask(); return; }
    }
    if (matchesKey(data, Key.escape) || data === "q" || data === "Q") {
      if (this.running) void this.cancelRun();
      else this.onBack();
      return;
    }
    this.list.handleInput(data);
  }

  render(width: number): string[] {
    if (this.promptInput) return this.promptInput.render(width);
    if (this.manualStep === "preview") return this.renderManualPreview(width);

    const w = Math.max(40, width);
    const lines: string[] = [];
    lines.push(...appHeader({ title: t("create_task.title"), subtitle: t("create_task.subtitle"), width: w }));
    lines.push("");
    lines.push(...callout({ title: t("create_task.help"), tone: "dim", width: w }));
    lines.push("");

    if (this.agentStatus) {
      lines.push(...this.agentStatus.render(w - 2));
      lines.push("");
    }

    lines.push(...this.list.render(w).map((line) => truncateToWidth(line, w, "…")));

    if (this.statusMsg) {
      lines.push("");
      for (const line of this.statusMsg.split("\n")) lines.push(themeLine(this.statusMsg, line));
    }

    lines.push("");
    lines.push(...actionBar([
      { key: "Enter", label: t("create_task.action.choose"), tone: "accent" },
      { key: "Esc", label: t("wizard.action.quit") },
    ], w));
    return lines.map((line) => truncateToWidth(line, w, "…"));
  }

  private renderManualPreview(width: number) {
    const w = Math.max(40, width);
    const order = buildManualOrder(this.manualDraft);
    const lines: string[] = [];
    lines.push(...appHeader({ title: t("create_task.preview.title"), subtitle: t("create_task.preview.subtitle"), width: w }));
    lines.push("");
    if (this.manualRaw) {
      lines.push(theme.accent(t("common.raw_json")));
      lines.push(...rawJson({ order }, w, 32));
    } else {
      lines.push(...keyValueRows([
        { label: t("create_task.field.id"), value: order.orderId },
        { label: t("create_task.field.asset_type"), value: order.assetType },
        { label: t("create_task.field.output"), value: order.deliverables[0]?.name },
        { label: t("create_task.field.priority"), value: order.priority },
      ], w));
      lines.push("");
      lines.push(theme.accent(t("create_task.field.intent")));
      lines.push(...wrapText(order.brief.intent, w - 2, "  "));
      lines.push("");
      lines.push(...bulletList(t("create_task.field.criteria"), order.acceptanceCriteria, w));
      lines.push(...bulletList(t("create_task.field.must_include"), order.brief.mustInclude, w));
      lines.push(...bulletList(t("create_task.field.avoid"), order.brief.avoid, w));
    }
    if (this.statusMsg) {
      lines.push("");
      for (const line of this.statusMsg.split("\n")) lines.push(themeLine(this.statusMsg, line));
    }
    lines.push("");
    lines.push(...actionBar([
      { key: "Enter", label: t("create_task.action.create"), tone: "accent" },
      { key: "e", label: t("create_task.action.edit") },
      { key: "j", label: this.manualRaw ? t("common.summary") : t("common.raw_json") },
      { key: "Esc", label: t("wizard.action.quit") },
    ], w));
    return lines.map((line) => truncateToWidth(line, w, "…"));
  }
}

export { CreateTaskPage as AddCreationTaskPage, CreateTaskPage as CreateTaskHost };

function normalizeManualOrderParams(parsed: unknown) {
  if (!isObject(parsed)) throw new Error("Manual task JSON must be an object.");
  if (Array.isArray((parsed as any).orders) || isObject((parsed as any).order)) return parsed as Record<string, unknown>;
  return { order: parsed };
}

function buildManualOrder(draft: ManualDraft) {
  const assetType = slug(draft.assetType || "custom-asset");
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);
  const deliverable = parseDeliverable(draft.deliverable || assetType);
  return {
    orderId: `ord-${assetType}-${suffix}`.replace(/[^a-z0-9-]/g, "-").slice(0, 64),
    requestType: "new_asset" as const,
    assetType,
    brief: {
      intent: draft.intent || "Create a RepoChan asset aligned with Spiria.",
      mustInclude: draft.mustInclude ?? [],
      avoid: draft.avoid ?? [],
      creativeFreedom: ["Keep the result aligned with the current Spiria profile and visual anchor."],
    },
    deliverables: [deliverable],
    acceptanceCriteria: draft.acceptanceCriteria?.length ? draft.acceptanceCriteria : ["Matches Spiria identity", "Usable as a RepoChan brand asset"],
    status: "draft" as const,
    priority: "normal" as const,
  };
}

function parseDeliverable(value: string) {
  const lower = value.toLowerCase();
  const square = lower.includes("square") || lower.includes("avatar") || lower.includes("1024");
  const wide = lower.includes("banner") || lower.includes("wide") || lower.includes("16:9");
  return {
    name: value || "generated asset",
    format: lower.includes("svg") ? "svg" : "png",
    width: square ? 1024 : wide ? 1600 : undefined,
    height: square ? 1024 : wide ? 900 : undefined,
    aspectRatio: square ? "1:1" : wide ? "16:9" : undefined,
    transparentBackground: lower.includes("transparent") || lower.includes("透明"),
  };
}

function manualPrompt(step: ManualStep) {
  if (step === "assetType") return t("create_task.manual.asset_type.prompt");
  if (step === "intent") return t("create_task.manual.intent.prompt");
  if (step === "deliverable") return t("create_task.manual.deliverable.prompt");
  if (step === "criteria") return t("create_task.manual.criteria.prompt");
  if (step === "mustInclude") return t("create_task.manual.must_include.prompt");
  return t("create_task.manual.avoid.prompt");
}

function manualPlaceholder(step: ManualStep) {
  if (step === "assetType") return t("create_task.manual.asset_type.placeholder");
  if (step === "intent") return t("create_task.manual.intent.placeholder");
  if (step === "deliverable") return t("create_task.manual.deliverable.placeholder");
  if (step === "criteria") return t("create_task.manual.criteria.placeholder");
  if (step === "mustInclude") return t("create_task.manual.must_include.placeholder");
  return t("create_task.manual.avoid.placeholder");
}

function nextManualStep(step: ManualStep): ManualStep {
  if (step === "assetType") return "intent";
  if (step === "intent") return "deliverable";
  if (step === "deliverable") return "criteria";
  if (step === "criteria") return "mustInclude";
  if (step === "mustInclude") return "avoid";
  return "preview";
}

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom-asset";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function themeLine(status: string, line: string) {
  return /error|must|expected|invalid|failed/i.test(status) ? theme.error(line) : theme.success(line);
}

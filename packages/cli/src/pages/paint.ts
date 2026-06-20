import { Key, matchesKey, SelectList, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

import { t } from "../i18n.js";
import { type OnBack, type TuiRef } from "../types.js";
import { AgentStatus } from "../components/agent-status.js";
import { ConfirmList, type ConfirmChoice } from "../components/confirm-list.js";
import { checkPreconditions } from "../lib/precondition.js";
import { startRoleSession, type RunningRoleSession } from "../lib/runtime.js";
import { listOrderResults } from "../lib/protocol.js";
import { listOrders, readOrder, setOrderStatus } from "@repochan/core";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  success: (s: string) => chalk.green(s),
  warn: (s: string) => chalk.yellow(s),
  error: (s: string) => chalk.red(s),
};

type Phase = "loading" | "idle" | "select" | "confirm" | "running" | "done" | "error";

type OrderRow = { orderId?: string; status?: string; assetType?: string; resultCount?: number };

export class PaintPage implements Component {
  private phase: Phase = "loading";
  private orders: OrderRow[] = [];
  private list: SelectList | null = null;
  private selectedOrderId: string | null = null;
  private blockReason: string | null = null;
  private warnings: string[] = [];
  private statusMsg: string | null = null;
  private agentStatus: AgentStatus | null = null;
  private running: RunningRoleSession | null = null;
  private confirm: ConfirmList | null = null;

  constructor(
    private onBack: OnBack,
    private tuiRef: TuiRef,
    private initialOrderId?: string,
  ) {
    void this.load();
  }

  private async load() {
    this.phase = "loading";
    this.tuiRef.requestRender();
    try {
      const precond = await checkPreconditions(process.cwd(), {});
      this.warnings = precond.warnings;

      const result = await listOrders(process.cwd());
      this.orders = (result.orders || []) as OrderRow[];

      // If initialOrderId passed via CLI, try to use it directly
      if (this.initialOrderId && this.orders.some((o) => o.orderId === this.initialOrderId)) {
        this.selectedOrderId = this.initialOrderId;
        void this.tryPaint();
        return;
      }

      if (this.orders.length === 0) {
        this.blockReason = t("paint.no_orders");
        this.phase = "error";
      } else if (this.initialOrderId) {
        this.blockReason = `Order '${this.initialOrderId}' not found.`;
        this.phase = "error";
      } else {
        this.blockReason = null;
        this.rebuildList();
        this.phase = "select";
      }
    } catch (e: any) {
      this.blockReason = e?.message || String(e);
      this.phase = "error";
    } finally {
      this.tuiRef.requestRender();
    }
  }

  private rebuildList() {
    const items = this.orders.map((o) => ({
      value: o.orderId || "?",
      label: `${statusBadge(o.status)} ${o.orderId} · ${o.assetType || "?"} · ${o.resultCount ?? 0} result(s)`,
    }));
    this.list = new SelectList(items, 12, {
      selectedPrefix: (s) => theme.accent("> " + s),
      selectedText: (s) => theme.accent(s),
      description: (s) => theme.dim(s),
      scrollInfo: (s) => theme.dim(s),
      noMatch: (s) => theme.dim(s),
    });
    this.list.onSelect = (item) => {
      if (item.value === "empty") return;
      this.selectedOrderId = item.value;
      void this.tryPaint();
    };
  }

  private selectedOrder() {
    const item = this.list?.getSelectedItem?.();
    if (!item || item.value === "empty") return undefined;
    return this.orders.find((o) => o.orderId === item.value);
  }

  private async tryPaint() {
    if (!this.selectedOrderId) return;
    const orderId = this.selectedOrderId;

    // Check order status
    try {
      const order = await readOrder(process.cwd(), orderId);
      const status = order.status || "draft";

      if (status === "draft" || !["approved", "in_progress"].includes(status)) {
        // Auto-approve prompt
        this.statusMsg = t("paint.status_draft");
        this.phase = "idle";
        this.tuiRef.requestRender();
        return;
      }

      // Check existing results
      const results = await listOrderResults(process.cwd(), orderId);
      if (results.results && results.results.length > 0) {
        this.showConfirm(orderId, results.results);
        return;
      }

      void this.startRun(orderId);
    } catch (e: any) {
      this.statusMsg = e?.message || String(e);
      this.phase = "error";
      this.tuiRef.requestRender();
    }
  }

  private showConfirm(orderId: string, results: any[]) {
    const summary = results.slice(0, 3).map((r) => `Version ${r.versionId ?? r.id ?? "?"}: ${r.files?.join(", ") || "no files"}`);
    this.confirm = new ConfirmList({
      title: t("paint.confirm_title"),
      summary,
      onSelect: (choice: ConfirmChoice) => {
        this.confirm = null;
        if (choice === "skip") { this.phase = "select"; this.tuiRef.requestRender(); }
        else if (choice === "version" || choice === "overwrite") void this.startRun(orderId);
        else { this.phase = "select"; this.tuiRef.requestRender(); }
      },
      onCancel: () => { this.confirm = null; this.phase = "select"; this.tuiRef.requestRender(); },
    });
    this.phase = "confirm";
    this.tuiRef.requestRender();
  }

  private async autoApprove() {
    const orderId = this.selectedOrderId;
    if (!orderId) return;
    try {
      await setOrderStatus(process.cwd(), orderId, "approved");
      this.statusMsg = t("paint.auto_approved", { id: orderId });
      void this.tryPaint();
    } catch (e: any) {
      this.statusMsg = e?.message || String(e);
      this.tuiRef.requestRender();
    }
  }

  private async startRun(orderId: string) {
    if (this.running) return;
    this.confirm = null;
    this.phase = "running";
    this.statusMsg = null;
    this.agentStatus?.dispose();
    this.agentStatus = new AgentStatus({ role: "painter", orderId, onRequestRender: () => this.tuiRef.requestRender() });
    this.tuiRef.requestRender();
    try {
      this.running = await startRoleSession({
        phase: "painter", orderId, cwd: process.cwd(), newSession: true,
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
    // Mark delivered
    if (this.selectedOrderId) {
      try { await setOrderStatus(process.cwd(), this.selectedOrderId, "delivered"); } catch {}
    }
    this.phase = "done";
    this.statusMsg = t("paint.done");
    await this.load();
  }

  private failRun(error: unknown) {
    this.agentStatus?.markError(error);
    this.running = null;
    this.phase = "error";
    this.statusMsg = error instanceof Error ? error.message : String(error);
    this.tuiRef.requestRender();
  }

  private async cancelRun() {
    if (!this.running) return;
    await this.running.abort();
    this.agentStatus?.markCancelled();
    this.running = null;
    this.phase = "select";
    this.statusMsg = t("agent.status.cancelled");
    this.tuiRef.requestRender();
  }

  invalidate(): void { this.agentStatus?.invalidate(); }

  handleInput(data: string): void {
    if (this.phase === "confirm" && this.confirm) { this.confirm.handleInput(data); return; }
    if (matchesKey(data, Key.escape) || data === "q" || data === "Q") {
      if (this.running) void this.cancelRun();
      else this.onBack();
      return;
    }
    if (this.running) return;
    if (data === "r" || data === "R") { void this.load(); return; }
    if (data === "a" || data === "A") { void this.autoApprove(); return; }
    if (this.phase === "select" || this.phase === "idle") {
      this.list?.handleInput(data);
    }
  }

  render(width: number): string[] {
    const w = Math.max(40, width);
    if (this.phase === "confirm" && this.confirm) return this.confirm.render(w);

    const lines: string[] = [];
    lines.push(theme.accent(t("paint.title")));
    lines.push(theme.dim(t("paint.subtitle")));
    lines.push("");

    if (this.agentStatus && this.phase === "running") {
      lines.push(...this.agentStatus.render(w - 2));
      lines.push("");
    }

    if (this.phase === "loading") {
      lines.push(theme.dim(t("common.loading")));
    } else if (this.blockReason) {
      lines.push(theme.error(this.blockReason));
    } else if (this.phase === "select" || this.phase === "idle") {
      if (this.list) {
        lines.push(theme.dim(t("paint.select_order")));
        lines.push("");
        lines.push(...this.list.render(w));
      }
    }

    if (this.warnings.length) {
      lines.push("");
      for (const warn of this.warnings) lines.push(theme.warn(`  ⚠ ${warn}`));
    }

    if (this.statusMsg) {
      lines.push("");
      lines.push(this.phase === "error" ? theme.error(this.statusMsg) : theme.success(this.statusMsg));
    }

    lines.push("");
    if (this.phase === "idle") {
      lines.push(theme.dim(t("paint.hint")));
    } else if (this.phase === "select") {
      lines.push(theme.dim(t("paint.order_hint")));
    } else {
      lines.push(theme.dim(t("paint.hint")));
    }
    return lines.map((l) => truncateToWidth(l, w, "…"));
  }
}

function statusBadge(status?: string) {
  if (status === "approved") return "[approved]";
  if (status === "in_progress") return "[working]";
  if (status === "delivered") return "[done]";
  if (status === "needs_revision") return "[revision]";
  if (status === "cancelled") return "[cancelled]";
  return `[${status || "draft"}]`;
}

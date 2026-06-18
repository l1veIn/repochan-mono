import { Key, matchesKey, SelectList, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

import { type OnBack, type TuiRef } from "../types.js";
import { t } from "../i18n.js";
import { AgentStatus } from "../components/agent-status.js";
import { OrderDetailPage } from "./order-detail.js";
import { listOrders, setOrderStatus } from "@repochan/core";
import { startRoleSession, type RunningRoleSession } from "../lib/runtime.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  success: (s: string) => chalk.green(s),
  error: (s: string) => chalk.red(s),
  warn: (s: string) => chalk.yellow(s),
};

type OrderRow = {
  orderId?: string;
  status?: string;
  assetType?: string;
  priority?: string;
  file?: string;
  unreadable?: boolean;
};

export class OrdersPage implements Component {
  private list: SelectList | null = null;
  private orders: OrderRow[] = [];
  private loading = false;
  private error: string | null = null;
  private statusMsg: string | null = null;
  private currentSub: Component | null = null;
  private agentStatus: AgentStatus | null = null;
  private running: RunningRoleSession | null = null;

  constructor(private onBack: OnBack, private tuiRef: TuiRef) {
    void this.loadOrders();
  }

  private async loadOrders() {
    this.loading = true;
    this.error = null;
    this.tuiRef.requestRender();
    try {
      const result = await listOrders(process.cwd());
      this.orders = (result.orders || []) as OrderRow[];
      this.syncProtocolAgentStatus();
    } catch (e: any) {
      this.error = e?.message || String(e);
      this.orders = [];
      if (!this.running) this.agentStatus = null;
    } finally {
      this.loading = false;
      this.rebuildList();
      this.tuiRef.requestRender();
    }
  }

  private syncProtocolAgentStatus() {
    if (this.running) return;
    const inProgress = this.orders.find((o) => o.status === "in_progress");
    if (inProgress?.orderId) {
      if (!this.agentStatus) {
        this.agentStatus = new AgentStatus({ orderId: inProgress.orderId, role: "painter", onRequestRender: () => this.tuiRef.requestRender() });
      }
    } else {
      this.agentStatus?.dispose();
      this.agentStatus = null;
    }
  }

  private rebuildList() {
    const items = this.orders.map((o) => ({
      value: o.orderId || o.file || "unknown",
      label: `${statusBadge(o.status)} ${o.orderId || o.file} · ${o.assetType || "?"} · ${o.priority || "normal"}`,
    }));
    this.list = new SelectList(items.length ? items : [{ value: "empty", label: t("orders.empty") }], 12, {
      selectedPrefix: (s) => theme.accent("> " + s),
      selectedText: (s) => theme.accent(s),
      description: (s) => theme.dim(s),
      scrollInfo: (s) => theme.dim(s),
      noMatch: (s) => theme.dim(s),
    });
    this.list.onSelect = (item) => {
      if (item.value === "empty") return;
      const order = this.orders.find((o) => (o.orderId || o.file) === item.value);
      if (order?.orderId) this.enterSub(new OrderDetailPage(() => this.exitSub(), this.tuiRef, order.orderId));
    };
  }

  private selectedOrder() {
    const item = this.list?.getSelectedItem?.();
    if (!item || item.value === "empty") return undefined;
    return this.orders.find((o) => (o.orderId || o.file) === item.value);
  }

  private enterSub(sub: Component) {
    this.currentSub = sub;
    this.tuiRef.setFocus(sub);
    this.tuiRef.requestRender();
  }

  private exitSub() {
    this.currentSub = null;
    this.tuiRef.setFocus(this);
    void this.loadOrders();
  }

  private async approveSelected() {
    const order = this.selectedOrder();
    if (!order?.orderId) return;
    try {
      await setOrderStatus(process.cwd(), order.orderId, "approved");
      this.statusMsg = t("orders.approved", { id: order.orderId });
      await this.loadOrders();
    } catch (e: any) {
      this.statusMsg = e?.message || String(e);
      this.tuiRef.requestRender();
    }
  }

  private async runOrdersPhase() {
    if (this.running) return;
    this.statusMsg = null;
    this.agentStatus?.dispose();
    this.agentStatus = new AgentStatus({ role: "pm", onRequestRender: () => this.tuiRef.requestRender() });
    this.tuiRef.requestRender();
    try {
      this.running = await startRoleSession({
        phase: "orders",
        goal: "Create or regenerate RepoChan asset orders based on the current analysis and persona.",
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

  private async runPainterForSelected() {
    const order = this.selectedOrder();
    if (!order?.orderId || this.running) return;
    this.statusMsg = null;
    this.agentStatus?.dispose();
    this.agentStatus = new AgentStatus({ role: "painter", orderId: order.orderId, onRequestRender: () => this.tuiRef.requestRender() });
    this.tuiRef.requestRender();
    try {
      this.running = await startRoleSession({
        phase: "painter",
        orderId: order.orderId,
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
    this.statusMsg = t("orders.done");
    await this.loadOrders();
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
    if (this.currentSub) {
      this.currentSub.handleInput?.(data);
      return;
    }
    if (matchesKey(data, Key.escape) || data === "q" || data === "Q") {
      if (this.running) void this.cancelRun();
      else this.onBack();
      return;
    }
    if (data === "r" || data === "R") void this.loadOrders();
    else if (data === "a" || data === "A") void this.approveSelected();
    else if (data === "g" || data === "G") void this.runOrdersPhase();
    else if (data === "p" || data === "P") void this.runPainterForSelected();
    else this.list?.handleInput(data);
  }

  render(width: number): string[] {
    if (this.currentSub) return this.currentSub.render(width);

    const w = Math.max(40, width);
    const lines: string[] = [];
    lines.push(theme.accent(t("orders.title")));
    lines.push(theme.dim(t("orders.subtitle")));
    lines.push("");

    if (this.agentStatus) {
      lines.push(...this.agentStatus.render(w - 2));
      lines.push("");
    }

    if (this.loading) lines.push(theme.dim(t("common.loading")));
    if (this.error) lines.push(theme.error(this.error));
    if (this.list && !this.loading) lines.push(...this.list.render(w).map((l) => truncateToWidth(l, w, "…")));

    if (this.statusMsg) {
      lines.push("");
      lines.push(theme.success(this.statusMsg));
    }

    lines.push("");
    lines.push(theme.dim(t("orders.hint")));
    return lines.map((l) => truncateToWidth(l, w, "…"));
  }
}

export { OrdersPage as OrdersHost };

function statusBadge(status?: string) {
  if (status === "approved") return "[approved]";
  if (status === "in_progress") return "[working]";
  if (status === "delivered") return "[done]";
  if (status === "needs_revision") return "[revision]";
  if (status === "cancelled") return "[cancelled]";
  return `[${status || "draft"}]`;
}

import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import chalk from "chalk";

import { type OnBack, type TuiRef } from "../types.js";
import { t } from "../i18n.js";
import { AgentStatus } from "../components/agent-status.js";
import { readOrder, setCurrentAsset } from "@repochan/core";
import { listAssetsForOrder } from "../lib/protocol.js";
import { startRoleSession, type RunningRoleSession } from "../lib/runtime.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  success: (s: string) => chalk.green(s),
  error: (s: string) => chalk.red(s),
};

type VersionInfo = {
  assetId: string;
  versionId: string;
  createdAt?: string;
  files?: string[];
  isCurrent?: boolean;
};

export class OrderDetailPage implements Component {
  private order: any = null;
  private versions: VersionInfo[] = [];
  private selectedVersionIdx = 0;
  private loading = false;
  private statusMsg: string | null = null;
  private error: string | null = null;
  private agentStatus: AgentStatus | null = null;
  private running: RunningRoleSession | null = null;

  constructor(private onBack: OnBack, private tuiRef: TuiRef, private orderId: string) {
    void this.load();
  }

  private async load() {
    this.loading = true;
    this.error = null;
    this.tuiRef.requestRender();
    try {
      const cwd = process.cwd();
      this.order = await readOrder(cwd, this.orderId);
      const linked = await listAssetsForOrder(cwd, this.orderId);
      this.versions = [];
      for (const asset of linked) {
        for (const v of Array.isArray(asset.manifest.versions) ? asset.manifest.versions : []) {
          this.versions.push({
            assetId: asset.assetId,
            versionId: v.versionId,
            createdAt: v.createdAt,
            files: v.files,
            isCurrent: v.versionId === asset.manifest.currentVersion,
          });
        }
      }
      if (this.selectedVersionIdx >= this.versions.length) this.selectedVersionIdx = 0;
      this.syncProtocolAgentStatus();
    } catch (e: any) {
      this.error = e?.message || String(e);
      this.order = null;
      this.versions = [];
    } finally {
      this.loading = false;
      this.tuiRef.requestRender();
    }
  }

  private syncProtocolAgentStatus() {
    if (this.running) return;
    if (this.order?.status === "in_progress") {
      if (!this.agentStatus) this.agentStatus = new AgentStatus({ orderId: this.orderId, role: "painter", onRequestRender: () => this.tuiRef.requestRender() });
    } else {
      this.agentStatus?.dispose();
      this.agentStatus = null;
    }
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
    if (data === "p" || data === "P") void this.runPainter();
    if ((data === "s" || data === "S") && this.versions.length) void this.switchVersion();

    const n = this.versions.length;
    if (!n) return;
    if (matchesKey(data, Key.up)) {
      this.selectedVersionIdx = (this.selectedVersionIdx - 1 + n) % n;
      this.tuiRef.requestRender();
    } else if (matchesKey(data, Key.down)) {
      this.selectedVersionIdx = (this.selectedVersionIdx + 1) % n;
      this.tuiRef.requestRender();
    }
  }

  private async runPainter() {
    if (this.running) return;
    this.statusMsg = null;
    this.agentStatus?.dispose();
    this.agentStatus = new AgentStatus({ role: "painter", orderId: this.orderId, onRequestRender: () => this.tuiRef.requestRender() });
    this.tuiRef.requestRender();
    try {
      this.running = await startRoleSession({
        phase: "painter",
        orderId: this.orderId,
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
    this.statusMsg = t("orders.detail.done");
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

  private async switchVersion() {
    const v = this.versions[this.selectedVersionIdx];
    if (!v) return;
    try {
      await setCurrentAsset(process.cwd(), v.assetId, v.versionId);
      this.statusMsg = t("orders.detail.switched", { id: v.versionId });
      await this.load();
    } catch (e: any) {
      this.statusMsg = e?.message || String(e);
      this.tuiRef.requestRender();
    }
  }

  render(width: number): string[] {
    const w = Math.max(40, width);
    const lines: string[] = [];
    lines.push(theme.accent(t("orders.detail.title", { id: this.orderId })));
    lines.push(theme.dim(t("orders.detail.subtitle")));
    lines.push("");

    if (this.agentStatus) {
      lines.push(...this.agentStatus.render(w - 2));
      lines.push("");
    }

    if (this.loading) {
      lines.push(theme.dim(t("common.loading")));
      return lines.map((l) => truncateToWidth(l, w, "…"));
    }
    if (this.error) lines.push(theme.error(this.error));

    if (this.order) {
      lines.push(`${t("orders.status", { status: this.order.status || "?" })}  assetType: ${this.order.assetType || "?"}`);
      if (this.order.requestType) lines.push(`requestType: ${this.order.requestType}`);
      if (this.order.brief?.intent) lines.push(...wrap(`intent: ${this.order.brief.intent}`, w));
      lines.push("");
      lines.push(theme.accent(t("orders.detail.json")));
      lines.push(...JSON.stringify(this.order, null, 2).split("\n").slice(0, 18).map((l) => truncateToWidth(`  ${l}`, w, "…")));
      lines.push("");
    }

    if (this.versions.length === 0) {
      lines.push(theme.dim(t("orders.detail.no_images")));
    } else {
      lines.push(theme.accent(t("orders.detail.images")));
      this.versions.forEach((ver, i) => {
        const mark = i === this.selectedVersionIdx ? "❯" : " ";
        const cur = ver.isCurrent ? " [current]" : "";
        lines.push(truncateToWidth(`  ${mark} ${ver.assetId}/${ver.versionId}${cur}`, w, "…"));
        if (i === this.selectedVersionIdx && ver.files?.length) {
          ver.files.forEach((f) => lines.push(truncateToWidth(`      📄 ${f}`, w, "…")));
        }
      });
    }

    if (this.statusMsg) {
      lines.push("");
      lines.push(theme.success(this.statusMsg));
    }

    lines.push("");
    lines.push(theme.dim(t("orders.detail.hint")));
    return lines.map((l) => truncateToWidth(l, w, "…"));
  }
}

export { OrderDetailPage as OrderDetailHost };

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
  return lines.slice(0, 5);
}

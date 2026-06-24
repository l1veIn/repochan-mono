import { Key, matchesKey, truncateToWidth, type Component, Image, getCapabilities, setCapabilities } from "@earendil-works/pi-tui";
import chalk from "chalk";
import * as fs from "node:fs";
import * as path from "node:path";

import { type OnBack, type TuiRef } from "../types.js";
import { t } from "../i18n.js";
import { AgentStatus } from "../components/agent-status.js";
import { readOrder, setCurrentOrderResult, setOrderStatus, protocolRoot } from "@repochan/core";
import { listOrderResults } from "../lib/protocol.js";
import { formatSessionSavedMessage, startRoleSession, type RunningRoleSession } from "../lib/runtime.js";
import { actionBar, appHeader } from "../ui/layout.js";
import { bulletList, keyValueRows, paragraph, rawJson } from "../ui/detail.js";

const theme = {
  accent: (s: string) => chalk.cyan(s),
  dim: (s: string) => chalk.gray(s),
  success: (s: string) => chalk.green(s),
  error: (s: string) => chalk.red(s),
};

type VersionInfo = {
  orderId: string;
  versionId: string;
  createdAt?: string;
  files?: string[];
  isCurrent?: boolean;
  promptBrief?: string;
  generationPrompt?: string;
  revisedPrompt?: string;
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
  private currentImageChild: Component | null = null;
  private lastPreviewKey: string | null = null;
  private rawMode = false;

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
      const linked = await listOrderResults(cwd, this.orderId);
      this.versions = linked.results.map((v: any) => ({
        orderId: this.orderId,
        versionId: v.versionId,
        createdAt: v.createdAt,
        files: v.files,
        isCurrent: v.versionId === this.order?.currentVersion,
        promptBrief: v.promptBrief,
        generationPrompt: v.generationPrompt,
        revisedPrompt: v.revisedPrompt,
      }));
      if (this.selectedVersionIdx >= this.versions.length) this.selectedVersionIdx = 0;
      this.syncProtocolAgentStatus();
      this.updateImagePreview();
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
      else {
        this.cleanupImage();
        this.onBack();
      }
      return;
    }
    if (data === "r" || data === "R") void this.load();
    if ((data === "j" || data === "J") && this.order) { this.rawMode = !this.rawMode; this.tuiRef.requestRender(); }
    if (data === "p" || data === "P") void this.runPainter();
    if ((data === "s" || data === "S") && this.versions.length) void this.switchVersion();

    const n = this.versions.length;
    if (!n) return;
    if (matchesKey(data, Key.up)) {
      this.selectedVersionIdx = (this.selectedVersionIdx - 1 + n) % n;
      this.updateImagePreview();
      this.tuiRef.requestRender();
    } else if (matchesKey(data, Key.down)) {
      this.selectedVersionIdx = (this.selectedVersionIdx + 1) % n;
      this.updateImagePreview();
      this.tuiRef.requestRender();
    }
  }

  private updateImagePreview() {
    const ver = this.versions[this.selectedVersionIdx];
    if (!ver || !ver.files?.length) {
      this.setCurrentImage(null);
      return;
    }
    const imageFile = ver.files.find((f: string) => /\.(png|jpe?g|gif|webp)$/i.test(f));
    if (!imageFile) {
      this.setCurrentImage(null);
      return;
    }
    const previewKey = `${ver.orderId}/${ver.versionId}/${imageFile}`;
    if (previewKey === this.lastPreviewKey) return;
    this.lastPreviewKey = previewKey;

    const fullPath = path.join(
      protocolRoot(process.cwd()),
      "orders",
      ver.orderId,
      "versions",
      ver.versionId,
      imageFile
    );
    if (!fs.existsSync(fullPath)) {
      this.setCurrentImage(null);
      return;
    }
    try {
      const buffer = fs.readFileSync(fullPath);
      const base64 = buffer.toString("base64");
      const ext = path.extname(fullPath).toLowerCase();
      const mime =
        ext === ".png" ? "image/png" :
        (ext === ".jpg" || ext === ".jpeg") ? "image/jpeg" :
        ext === ".gif" ? "image/gif" :
        ext === ".webp" ? "image/webp" : "image/png";

      const imgTheme = {
        fallbackColor: (s: string) => chalk.gray(s),
      };

      // Auto enable for common terminals if not detected (like in image-demo.ts)
      const caps = getCapabilities ? getCapabilities() : { images: null as any };
      if (!caps.images) {
        const isWarp = (process.env.TERM_PROGRAM || "").toLowerCase().includes("warp");
        if (isWarp) {
          try { setCapabilities({ images: "iterm2", trueColor: true, hyperlinks: true }); } catch {}
        }
      }

      const img = new Image(base64, mime, imgTheme, {
        maxWidthCells: 55,
        filename: imageFile,
      });
      this.setCurrentImage(img);
    } catch (e) {
      this.setCurrentImage(null);
    }
  }

  private setCurrentImage(img: Component | null) {
    const tui = this.tuiRef.getTui() as any;
    if (this.currentImageChild) {
      try { tui.removeChild(this.currentImageChild); } catch {}
      this.currentImageChild = null;
    }
    if (img) {
      tui.addChild(img);
      this.currentImageChild = img;
    }
    this.tuiRef.requestRender();
  }

  private async runPainter() {
    if (this.running) return;

    // Ensure precondition for painter skill
    try {
      const current = await readOrder(process.cwd(), this.orderId);
      if (current.status === "draft" || !["approved", "in_progress"].includes(current.status || "")) {
        await setOrderStatus(process.cwd(), this.orderId, "in_progress");
        this.statusMsg = t("orders.in_progress", { id: this.orderId });
        await this.load();
      }
    } catch (e) {
      // non fatal
    }

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

    // Ensure delivered status after successful painter (robustness)
    try {
      await setOrderStatus(process.cwd(), this.orderId, "delivered");
    } catch {}

    this.statusMsg = t("orders.detail.done");
    await this.load();
    this.updateImagePreview();
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
    this.cleanupImage();
    this.tuiRef.requestRender();
  }

  private cleanupImage() {
    const tui = this.tuiRef.getTui() as any;
    if (this.currentImageChild) {
      try { tui.removeChild(this.currentImageChild); } catch {}
      this.currentImageChild = null;
    }
    this.lastPreviewKey = null;
  }

  private async switchVersion() {
    const v = this.versions[this.selectedVersionIdx];
    if (!v) return;
    try {
      await setCurrentOrderResult(process.cwd(), this.orderId, v.versionId);
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
    lines.push(...appHeader({ title: t("orders.detail.title", { id: this.orderId }), subtitle: t("orders.detail.subtitle"), width: w }));
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
      if (this.rawMode) {
        lines.push(theme.accent(t("common.raw_json")));
        lines.push(...rawJson(this.order, w, 42));
        lines.push("");
      } else {
        lines.push(...renderCreationTaskDetail(this.order, w));
        lines.push("");
      }
    }

    if (this.versions.length === 0) {
      lines.push(theme.dim(t("orders.detail.no_images")));
    } else {
      lines.push(theme.accent(t("orders.detail.images") || "OrderAsset versions"));
      this.versions.forEach((ver, i) => {
        const mark = i === this.selectedVersionIdx ? "❯" : " ";
        const cur = ver.isCurrent ? " [current]" : "";
        lines.push(truncateToWidth(`  ${mark} ${ver.versionId}${cur}`, w, "…"));
        if (i === this.selectedVersionIdx && ver.promptBrief) {
          lines.push(truncateToWidth(`      promptBrief: ${ver.promptBrief}`, w, "…"));
        }
        if (i === this.selectedVersionIdx && ver.generationPrompt) {
          lines.push(truncateToWidth(`      generationPrompt: ${ver.generationPrompt}`, w, "…"));
        }
        if (i === this.selectedVersionIdx && ver.revisedPrompt) {
          lines.push(truncateToWidth(`      revisedPrompt: ${ver.revisedPrompt}`, w, "…"));
        }
        if (i === this.selectedVersionIdx && ver.files?.length) {
          ver.files.forEach((f) => {
            const fullHint = `      📄 ${f}  (full: .repochan/orders/${this.orderId}/versions/${ver.versionId}/${f})`;
            lines.push(truncateToWidth(fullHint, w, "…"));
          });
        }
      });
    }

    if (this.currentImageChild) {
      lines.push("");
      lines.push(theme.dim("--- Image Preview below (pi-tui Image component) ---"));
    }

    if (this.statusMsg) {
      lines.push("");
      for (const line of this.statusMsg.split("\n")) lines.push(theme.success(line));
    }

    lines.push("");
    lines.push(...actionBar([
      { key: "↑↓", label: t("orders.detail.action.versions") },
      { key: "p", label: t("orders.action.paint"), tone: "accent" },
      { key: "s", label: t("orders.detail.switch_version") },
      ...(this.order ? [{ key: "j", label: this.rawMode ? t("common.summary") : t("common.raw_json") }] : []),
      { key: "r", label: t("wizard.action.refresh") },
      { key: "Esc", label: t("guided.action.stop") },
    ], w));
    return lines.map((l) => truncateToWidth(l, w, "…"));
  }
}

export { OrderDetailPage as OrderDetailHost };

function renderCreationTaskDetail(order: any, width: number) {
  const lines: string[] = [];
  lines.push(...keyValueRows([
    { label: t("orders.detail.field.status"), value: order.status || "draft" },
    { label: t("orders.detail.field.asset_type"), value: order.assetType },
    { label: t("orders.detail.field.request_type"), value: order.requestType },
    { label: t("orders.detail.field.priority"), value: order.priority || "normal" },
    { label: t("orders.detail.field.current"), value: order.currentVersion },
  ], width));
  lines.push("");
  lines.push(...paragraph(t("orders.detail.field.intent"), order.brief?.intent, width));
  lines.push(...bulletList(t("orders.detail.field.deliverables"), (order.deliverables ?? []).map((d: any) => describeDeliverable(d)), width));
  lines.push(...bulletList(t("orders.detail.field.criteria"), order.acceptanceCriteria, width));
  lines.push(...bulletList(t("orders.detail.field.must_include"), order.brief?.mustInclude, width));
  lines.push(...bulletList(t("orders.detail.field.avoid"), order.brief?.avoid, width));
  if (order.notes) lines.push(...paragraph(t("orders.detail.field.notes"), order.notes, width));
  return lines;
}

function describeDeliverable(deliverable: any) {
  const size = deliverable.width && deliverable.height ? ` ${deliverable.width}x${deliverable.height}` : deliverable.aspectRatio ? ` ${deliverable.aspectRatio}` : "";
  const transparent = deliverable.transparentBackground ? " transparent" : "";
  return `${deliverable.name ?? "asset"} · ${deliverable.format ?? "file"}${size}${transparent}`;
}

import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { promises as fs } from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import {
  type Component,
  Image,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  getCapabilities,
  setCapabilities,
} from "@earendil-works/pi-tui";
import {
  type OrderResultVersion,
  listOrders,
  listOrderResults,
  orderVersionDir,
  protocolRoot,
  readJsonIfExists,
  relativeProtocolPath,
  setCurrentOrderResult,
} from "@repochan/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrderSummary = {
  orderId: string;
  status?: string;
  assetType?: string;
  intent?: string;
  currentVersion?: string;
  resultCount: number;
};

type PreviewImage = {
  absPath: string;
  relPath: string;
  mimeType: string;
  base64: string;
  filename: string;
};

type BrowserVersion = OrderResultVersion & {
  image?: PreviewImage;
  isCurrent: boolean;
};

type BrowserOrder = OrderSummary & {
  versions: BrowserVersion[];
  error?: string;
};

type BrowserData = {
  orders: BrowserOrder[];
  loadedAt: Date;
  error?: string;
};

type PanelMode = "list" | "detail" | "meta";

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// ---------------------------------------------------------------------------
// Terminal capability patching
//
// pi-tui's getCapabilities() does not recognize Warp (TERM_PROGRAM=WarpTerminal),
// so it falls back to null image support even though Warp fully implements the
// Kitty graphics protocol. We detect Warp and override the cached capabilities
// before rendering any Image component, so inline previews work in Warp.
// ---------------------------------------------------------------------------

let warpPatched = false;

function patchCapabilitiesForWarp(): void {
  if (warpPatched) return;
  const termProgram = (process.env.TERM_PROGRAM ?? "").toLowerCase();
  if (termProgram !== "warpterminal") return;
  const caps = getCapabilities();
  if (caps.images) return; // already detected, don't clobber
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
  warpPatched = true;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerOrderPanel(pi: ExtensionAPI) {
  let sessionCwd = process.cwd();

  pi.on("session_start", async (_event, ctx) => {
    sessionCwd = ctx.cwd;
  });

  pi.registerCommand("order_panel", {
    description: "Open the RepoChan order result browser (/order_panel [order-id])",
    getArgumentCompletions: async (prefix: string) => {
      try {
        const { orders } = await listOrders(sessionCwd);
        const items = orders
          .map((o: any) => ({
            value: o.orderId,
            label: o.orderId,
            description: o.currentVersion
              ? `current: ${o.currentVersion} · ${(o.resultCount ?? 0)} result(s)`
              : `${o.resultCount ?? 0} result(s)`,
          }))
          .filter((item: any) => item.value.startsWith(prefix));
        return items.length ? items : null;
      } catch {
        return null;
      }
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await openOrderPanel(ctx, args.trim() || undefined);
    },
  });
}

async function openOrderPanel(ctx: ExtensionCommandContext, initialOrderId?: string): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/order_panel requires Pi interactive TUI mode.", "warning");
    return;
  }

  patchCapabilitiesForWarp();

  let data = await loadBrowserData(ctx.cwd);

  const overlayMode = process.env.REPOCHAN_PANEL_OVERLAY === "1";
  const inlineImages = !overlayMode && process.env.REPOCHAN_PANEL_INLINE_IMAGES !== "0";

  const panelFactory = (tui: { requestRender: (force?: boolean) => void }, theme: Theme, _keybindings: unknown, done: (value: void) => void) => {
    queueMicrotask(() => tui.requestRender(true));

    const panel = new RepoChanOrderPanel({
      cwd: ctx.cwd,
      data,
      initialOrderId,
      theme,
      inlineImages,
      requestRender: () => tui.requestRender(),
      onClose: () => done(undefined),
      onRefresh: async () => {
        data = await loadBrowserData(ctx.cwd);
        return data;
      },
      onSetCurrent: async (orderId, versionId) => {
        await setCurrentOrderResult(ctx.cwd, orderId, versionId);
        data = await loadBrowserData(ctx.cwd);
        return data;
      },
    });
    return panel;
  };

  if (overlayMode) {
    await ctx.ui.custom<void>(panelFactory, {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "88%",
        minWidth: 60,
        maxHeight: "95%",
        margin: 0.5,
      },
    });
    return;
  }

  await ctx.ui.custom<void>(panelFactory);
}

// ---------------------------------------------------------------------------
// Panel component
// ---------------------------------------------------------------------------

class RepoChanOrderPanel implements Component {
  private mode: PanelMode = "list";
  private selectedOrderIndex = 0;
  private selectedVersionIndex = 0;
  private statusMessage = "";
  private busy = false;

  constructor(
    private readonly opts: {
      cwd: string;
      data: BrowserData;
      initialOrderId?: string;
      theme: Theme;
      inlineImages: boolean;
      requestRender: () => void;
      onClose: () => void;
      onRefresh: () => Promise<BrowserData>;
      onSetCurrent: (orderId: string, versionId: string) => Promise<BrowserData>;
    },
  ) {
    if (opts.initialOrderId) {
      const index = opts.data.orders.findIndex((o) => o.orderId === opts.initialOrderId);
      if (index >= 0) {
        this.selectedOrderIndex = index;
        this.mode = "detail";
        this.selectCurrentVersion();
      } else {
        this.statusMessage = `Order not found: ${opts.initialOrderId}`;
      }
    }
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (this.busy) return;

    if (data === "q" || matchesKey(data, Key.ctrl("c"))) {
      this.opts.onClose();
      return;
    }
    if (matchesKey(data, Key.escape)) {
      if (this.mode === "detail") this.mode = "list";
      else if (this.mode === "meta") this.mode = "detail";
      else this.opts.onClose();
      this.opts.requestRender();
      return;
    }
    if (data === "r" || data === "R") {
      void this.refresh();
      return;
    }

    if (this.mode === "list") {
      this.handleListInput(data);
      return;
    }
    if (this.mode === "detail") {
      this.handleDetailInput(data);
      return;
    }
    this.handleMetaInput(data);
  }

  render(width: number): string[] {
    try {
      const w = Math.max(24, width);
      const lines: string[] = [];
      lines.push(this.rule(w, "accent"));
      lines.push(this.titleLine(w));
      lines.push(this.rule(w, "borderMuted"));

      if (this.opts.data.error) {
        lines.push(this.color("error", `Error: ${this.opts.data.error}`, w));
      }

      if (this.opts.data.orders.length === 0) {
        lines.push(this.color("muted", "No .repochan orders with results found in this workspace.", w));
        lines.push(this.color("dim", "Use /skill:repochan-art-director to create orders, then /skill:repochan-painter to execute them.", w));
        lines.push("");
        lines.push(this.help(w, "r refresh · q/esc close"));
        lines.push(this.rule(w, "accent"));
        return lines;
      }

      if (this.mode === "list") lines.push(...this.renderList(w));
      else if (this.mode === "detail") lines.push(...this.renderDetail(w));
      else lines.push(...this.renderMeta(w));

      if (this.statusMessage) {
        lines.push(this.rule(w, "borderMuted"));
        lines.push(this.color(this.statusMessage.startsWith("Error") ? "error" : "dim", this.statusMessage, w));
      }
      lines.push(this.rule(w, "accent"));
      return lines;
    } catch (error) {
      const w = Math.max(24, width);
      return [
        this.color("error", "RepoChan order panel render failed (safe fallback).", w),
        this.color("dim", String(error), w),
        this.rule(w, "accent"),
      ];
    }
  }

  private handleListInput(data: string): void {
    if (matchesKey(data, Key.up)) this.moveOrder(-1);
    else if (matchesKey(data, Key.down)) this.moveOrder(1);
    else if (matchesKey(data, Key.enter) || matchesKey(data, Key.right)) {
      this.mode = "detail";
      this.selectCurrentVersion();
    } else if (data === "o" || data === "O") {
      this.openCurrentImage();
      return;
    } else return;
    this.opts.requestRender();
  }

  private handleDetailInput(data: string): void {
    const order = this.selectedOrder();
    if (!order) return;
    if (matchesKey(data, Key.left) || matchesKey(data, Key.backspace)) this.mode = "list";
    else if (matchesKey(data, Key.up)) this.moveVersion(-1);
    else if (matchesKey(data, Key.down)) this.moveVersion(1);
    else if (data === "m" || data === "M") this.mode = "meta";
    else if (data === "s" || data === "S") void this.setCurrentVersion();
    else if (data === "o" || data === "O") {
      this.openCurrentImage();
      return;
    } else return;
    this.opts.requestRender();
  }

  private handleMetaInput(data: string): void {
    if (matchesKey(data, Key.left) || matchesKey(data, Key.backspace) || data === "m" || data === "M") {
      this.mode = "detail";
      this.opts.requestRender();
    } else if (data === "o" || data === "O") {
      this.openCurrentImage();
    }
  }

  private moveOrder(delta: number): void {
    const total = this.opts.data.orders.length;
    if (!total) return;
    this.selectedOrderIndex = (this.selectedOrderIndex + delta + total) % total;
    this.selectCurrentVersion();
  }

  private moveVersion(delta: number): void {
    const versions = this.selectedOrder()?.versions ?? [];
    if (!versions.length) return;
    this.selectedVersionIndex = (this.selectedVersionIndex + delta + versions.length) % versions.length;
  }

  private selectedOrder(): BrowserOrder | undefined {
    return this.opts.data.orders[this.selectedOrderIndex];
  }

  private selectedVersion(): BrowserVersion | undefined {
    return this.selectedOrder()?.versions[this.selectedVersionIndex];
  }

  private selectCurrentVersion(): void {
    const order = this.selectedOrder();
    if (!order?.versions.length) {
      this.selectedVersionIndex = 0;
      return;
    }
    const currentIndex = order.versions.findIndex((v) => v.isCurrent);
    this.selectedVersionIndex = currentIndex >= 0 ? currentIndex : 0;
  }

  private openCurrentImage(): void {
    const img = this.selectedVersion()?.image;
    if (img?.absPath) {
      this.openExternal(img.absPath);
      this.statusMessage = `Opened ${img.filename} externally`;
    } else {
      this.statusMessage = "No image to open for current selection.";
    }
    this.opts.requestRender();
  }

  private async refresh(): Promise<void> {
    this.busy = true;
    this.statusMessage = "Refreshing orders…";
    this.opts.requestRender();
    const selectedId = this.selectedOrder()?.orderId;
    try {
      this.opts.data = await this.opts.onRefresh();
      if (selectedId) {
        const nextIndex = this.opts.data.orders.findIndex((o) => o.orderId === selectedId);
        this.selectedOrderIndex = Math.max(0, nextIndex);
      }
      this.selectedOrderIndex = Math.min(this.selectedOrderIndex, Math.max(0, this.opts.data.orders.length - 1));
      this.selectCurrentVersion();
      this.statusMessage = `Refreshed ${this.opts.data.orders.length} order(s).`;
    } catch (error) {
      this.statusMessage = `Error refreshing orders: ${messageFromError(error)}`;
    } finally {
      this.busy = false;
      this.opts.requestRender();
    }
  }

  private async setCurrentVersion(): Promise<void> {
    const order = this.selectedOrder();
    const version = this.selectedVersion();
    if (!order || !version) return;
    if (version.isCurrent) {
      this.statusMessage = `${version.versionId} is already current.`;
      this.opts.requestRender();
      return;
    }
    this.busy = true;
    this.statusMessage = `Setting ${version.versionId} as current…`;
    this.opts.requestRender();
    try {
      this.opts.data = await this.opts.onSetCurrent(order.orderId, version.versionId);
      const nextOrder = this.opts.data.orders.findIndex((o) => o.orderId === order.orderId);
      if (nextOrder >= 0) this.selectedOrderIndex = nextOrder;
      this.selectCurrentVersion();
      this.statusMessage = `Set ${order.orderId} currentVersion to ${version.versionId}.`;
    } catch (error) {
      this.statusMessage = `Error setting current version: ${messageFromError(error)}`;
    } finally {
      this.busy = false;
      this.opts.requestRender();
    }
  }

  private openExternal(filePath: string): void {
    const escaped = filePath.replace(/"/g, '\\"');
    let cmd: string;
    if (process.platform === "darwin") cmd = `open "${escaped}"`;
    else if (process.platform === "win32") cmd = `start "" "${escaped}"`;
    else cmd = `xdg-open "${escaped}"`;
    exec(cmd, () => { /* fire-and-forget */ });
  }

  private renderList(width: number): string[] {
    const order = this.selectedOrder();
    const lines: string[] = [];
    const maxVisible = 10;
    const start = scrollStart(this.selectedOrderIndex, this.opts.data.orders.length, maxVisible);
    const end = Math.min(start + maxVisible, this.opts.data.orders.length);

    lines.push(this.color("muted", `Orders (${this.opts.data.orders.length})`, width));
    for (let i = start; i < end; i++) {
      const item = this.opts.data.orders[i]!;
      const selected = i === this.selectedOrderIndex;
      const badge = statusBadge(item.status);
      const current = item.currentVersion ? `current ${item.currentVersion}` : "no current";
      const row = `${selected ? "❯" : " "} ${badge} ${item.orderId}  ·  ${item.assetType ?? "?"}  ·  ${current}  ·  ${item.versions.length} result(s)`;
      lines.push(this.row(row, width, selected));
    }
    if (start > 0 || end < this.opts.data.orders.length) {
      lines.push(this.color("dim", `${this.selectedOrderIndex + 1}/${this.opts.data.orders.length}`, width));
    }

    if (order) {
      lines.push("");
      if (order.intent) lines.push(this.color("dim", `intent: ${order.intent}`, width));
      const currentVersion = order.versions.find((v) => v.isCurrent) ?? order.versions[0];
      if (currentVersion) {
        lines.push(this.color("accent", `Preview: ${order.orderId}`, width));
        lines.push(...this.renderPreview(currentVersion, width, 60, 22));
      }
    }

    lines.push("");
    lines.push(this.help(width, "↑↓ select · enter detail · r refresh · o open · q/esc close"));
    return lines;
  }

  private renderDetail(width: number): string[] {
    const order = this.selectedOrder();
    if (!order) return [];
    const version = this.selectedVersion();
    const lines: string[] = [];
    lines.push(this.color("accent", this.opts.theme.bold(order.orderId), width));
    if (order.error) lines.push(this.color("error", order.error, width));
    lines.push(this.color("dim", `status: ${order.status ?? "?"} · assetType: ${order.assetType ?? "?"}`, width));
    lines.push("");

    if (version) {
      lines.push(...this.renderPreview(version, width, Math.min(160, width - 4), 38));
    }

    lines.push("");
    lines.push(this.color("muted", `Result versions (${order.versions.length})`, width));
    const start = scrollStart(this.selectedVersionIndex, order.versions.length, 6);
    const end = Math.min(start + 6, order.versions.length);
    for (let i = start; i < end; i++) {
      const item = order.versions[i]!;
      const selected = i === this.selectedVersionIndex;
      const current = item.isCurrent ? " *current" : "";
      const file = item.image ? ` · ${item.image.relPath}` : (item.files?.[0] ? ` · ${shorten(item.files[0], 36)}` : "");
      const tool = item.tool ? ` · ${shorten(item.tool, 24)}` : "";
      lines.push(this.row(`${selected ? "❯" : " "} ${item.versionId}${current}${tool}${file}`, width, selected));
    }

    lines.push("");
    lines.push(this.help(width, "↑↓ versions · s set current · m meta · o open · ←/esc back · r refresh · q close"));
    return lines;
  }

  private renderMeta(width: number): string[] {
    const order = this.selectedOrder();
    const version = this.selectedVersion();
    const lines: string[] = [];
    lines.push(this.color("accent", `Meta: ${order?.orderId ?? ""} / ${version?.versionId ?? ""}`, width));
    if (!version) {
      lines.push(this.color("warning", "No version selected.", width));
    } else {
      const meta = {
        versionId: version.versionId,
        createdAt: version.createdAt,
        tool: version.tool,
        files: version.files,
        promptBrief: version.promptBrief,
        generationPrompt: version.generationPrompt,
        revisedPrompt: version.revisedPrompt,
        notes: version.notes,
        provenance: version.provenance,
        meta: version.meta,
      };
      const jsonLines = JSON.stringify(meta, null, 2).split("\n");
      for (const line of jsonLines.slice(0, 28)) lines.push(this.color("text", line, width));
      if (jsonLines.length > 28) lines.push(this.color("dim", `… ${jsonLines.length - 28} more line(s)`, width));
    }
    lines.push("");
    lines.push(this.help(width, "m/←/esc back · o open · r refresh · q close"));
    return lines;
  }

  private renderPreview(version: BrowserVersion, width: number, maxWidthCells: number, maxHeightCells: number): string[] {
    if (!version.image) {
      const info = version.files?.length
        ? `No image preview · ${version.files.map((f) => path.basename(f)).join(", ")}`
        : "No image preview available";
      return this.renderImagePlaceholder(width, maxWidthCells, maxHeightCells, info);
    }

    if (!this.opts.inlineImages) {
      return [
        this.color("dim", `${version.versionId} · ${version.image.relPath}`, width),
        this.color("warning", "Inline preview disabled (overlay mode). Press 'o' to open externally.", width),
        ...this.renderImagePlaceholder(width, maxWidthCells, maxHeightCells, `${version.image.filename}  •  press 'o'`),
      ];
    }

    try {
      const image = new Image(
        version.image.base64,
        version.image.mimeType,
        { fallbackColor: (text: string) => this.opts.theme.fg("dim", text) },
        { maxWidthCells, maxHeightCells, filename: version.image.filename },
      );
      const rawImgLines = image.render(width);
      const imgLines: string[] = Array.isArray(rawImgLines)
        ? rawImgLines.filter((l): l is string => typeof l === "string")
        : [];
      const hasImageProtocol = imgLines.some((l) => l.includes("\x1b_G") || l.includes("\x1b]1337;File="));
      const looksLikeFallback = imgLines.some((l) => l.includes("[Image:") || l.includes("image/"));
      if (!hasImageProtocol && looksLikeFallback) {
        return [
          this.color("dim", `${version.versionId} · ${version.image.relPath}`, width),
          ...this.renderImagePlaceholder(width, maxWidthCells, maxHeightCells, `${version.image.filename}  •  press 'o'`),
        ];
      }
      return [this.color("dim", `${version.versionId} · ${version.image.relPath}`, width), ...imgLines];
    } catch (error) {
      return [
        this.color("warning", `Preview failed: ${messageFromError(error)}`, width),
        this.color("accent", "Press 'o' to open externally.", width),
      ];
    }
  }

  private renderImagePlaceholder(width: number, maxW: number, maxH: number, info: string): string[] {
    const boxW = Math.max(20, Math.min(maxW, width - 4));
    const boxH = Math.max(4, maxH);
    const lines: string[] = [];
    lines.push(this.color("dim", "┌" + "─".repeat(boxW) + "┐", width));
    const midH = boxH - 2;
    const infoLine = truncateToWidth(info, boxW, "…");
    for (let i = 0; i < midH; i++) {
      let content = " ".repeat(boxW);
      if (i === Math.floor(midH / 2)) {
        const pad = Math.max(0, Math.floor((boxW - visibleWidth(infoLine)) / 2));
        content = " ".repeat(pad) + infoLine + " ".repeat(Math.max(0, boxW - pad - visibleWidth(infoLine)));
      }
      lines.push(this.color("dim", "│" + content + "│", width));
    }
    lines.push(this.color("dim", "└" + "─".repeat(boxW) + "┘", width));
    return lines;
  }

  private titleLine(width: number): string {
    const left = this.opts.theme.fg("accent", this.opts.theme.bold("RepoChan Orders"));
    const mode = this.mode;
    const right = this.opts.theme.fg("dim", `${mode} · ${this.opts.data.loadedAt.toLocaleTimeString()}`);
    const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
    return truncateToWidth(left + " ".repeat(gap) + right, width, "");
  }

  private rule(width: number, color: "accent" | "borderMuted"): string {
    return this.opts.theme.fg(color, "─".repeat(Math.max(1, width)));
  }

  private color(color: Parameters<Theme["fg"]>[0], text: string, width: number): string {
    return truncateToWidth(this.opts.theme.fg(color, text), width, "…");
  }

  private row(text: string, width: number, selected: boolean): string {
    const line = truncateToWidth(text, width, "…");
    const padded = line + " ".repeat(Math.max(0, width - visibleWidth(line)));
    if (!selected) return this.opts.theme.fg("text", padded);
    return this.opts.theme.bg("selectedBg", this.opts.theme.fg("accent", padded));
  }

  private help(width: number, text: string): string {
    return this.color("dim", text, width);
  }
}

// ---------------------------------------------------------------------------
// Data loading (order-centric model)
// ---------------------------------------------------------------------------

async function loadBrowserData(cwd: string): Promise<BrowserData> {
  try {
    const { orders } = await listOrders(cwd);
    const browserOrders = await Promise.all(
      (orders as any[]).map((summary) => loadOrder(cwd, summary.orderId, summary)),
    );
    // Only show orders that have at least one result version, or all if none have any.
    const withResults = browserOrders.filter((o) => o.versions.length > 0);
    const visible = withResults.length > 0 ? withResults : browserOrders;
    return { orders: visible, loadedAt: new Date() };
  } catch (error) {
    return { orders: [], loadedAt: new Date(), error: messageFromError(error) };
  }
}

async function loadOrder(cwd: string, orderId: string, summary: any): Promise<BrowserOrder> {
  try {
    const { results, currentVersion } = await listOrderResults(cwd, orderId);
    const versions = await Promise.all(
      (results ?? []).map((version: OrderResultVersion) =>
        loadVersion(cwd, orderId, version, version.versionId === (currentVersion ?? summary.currentVersion)),
      ),
    );
    // listOrders summary lacks brief.intent; read it from the order file for display.
    const orderFile = await readJsonIfExists(path.join(protocolRoot(cwd), "orders", orderId, "order.json"));
    const intent = (orderFile as any)?.brief?.intent;
    return {
      orderId,
      status: summary.status,
      assetType: summary.assetType,
      intent,
      currentVersion: currentVersion ?? summary.currentVersion,
      resultCount: versions.length,
      versions,
    };
  } catch (error) {
    return {
      orderId,
      status: summary.status,
      assetType: summary.assetType,
      resultCount: 0,
      versions: [],
      error: messageFromError(error),
    };
  }
}

async function loadVersion(cwd: string, orderId: string, version: OrderResultVersion, isCurrent: boolean): Promise<BrowserVersion> {
  const dir = orderVersionDir(cwd, orderId, version.versionId);
  const imagePath = await findPreviewImage(dir, version.files ?? []);
  const image = imagePath ? await readPreviewImage(cwd, imagePath) : undefined;
  return { ...version, isCurrent, image };
}

async function findPreviewImage(versionDir: string, files: string[]): Promise<string | undefined> {
  for (const file of files) {
    const abs = path.isAbsolute(file) ? file : path.resolve(versionDir, file);
    if (isSupportedImage(abs) && (await fileExists(abs))) return abs;
  }
  // Fallback: scan version dir for first image
  try {
    const entries = (await fs.readdir(versionDir)).sort();
    for (const entry of entries) {
      if (isSupportedImage(entry)) return path.join(versionDir, entry);
    }
  } catch {
    // dir may not exist
  }
  return undefined;
}

async function readPreviewImage(cwd: string, file: string): Promise<PreviewImage | undefined> {
  const mimeType = IMAGE_EXT_TO_MIME[path.extname(file).toLowerCase()];
  if (!mimeType) return undefined;
  try {
    const buffer = await fs.readFile(file);
    return {
      absPath: file,
      relPath: relativeProtocolPath(cwd, file),
      mimeType,
      base64: buffer.toString("base64"),
      filename: path.basename(file),
    };
  } catch {
    return undefined;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function isSupportedImage(file: string): boolean {
  return Boolean(IMAGE_EXT_TO_MIME[path.extname(file).toLowerCase()]);
}

function statusBadge(status?: string): string {
  switch (status) {
    case "approved": return "[approved]";
    case "in_progress": return "[working]";
    case "delivered": return "[done]";
    case "needs_revision": return "[revision]";
    case "cancelled": return "[cancelled]";
    default: return `[${status ?? "draft"}]`;
  }
}

function scrollStart(selected: number, total: number, maxVisible: number): number {
  if (total <= maxVisible) return 0;
  return Math.max(0, Math.min(selected - Math.floor(maxVisible / 2), total - maxVisible));
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

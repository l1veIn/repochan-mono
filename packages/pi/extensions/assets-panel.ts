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
} from "@earendil-works/pi-tui";
import {
  type AssetManifest,
  type AssetOrder,
  type VersionEntry,
  assetManifestPath,
  exists,
  protocolRoot,
  readJson,
  relativeProtocolPath,
  setCurrentAsset,
  validateAssetId,
} from "@repochan/core";

type AssetSummary = { assetId: string; currentVersion?: string; versionCount: number };

type PreviewImage = {
  path: string;
  relPath: string;
  mimeType: string;
  base64: string;
  filename: string;
};

type BrowserVersion = VersionEntry & {
  image?: PreviewImage;
  resolvedFiles: string[];
};

type OrderSummary = Pick<AssetOrder, "orderId" | "status" | "assetType"> & { intent?: string };

type BrowserAsset = AssetSummary & {
  manifest?: AssetManifest;
  versions: BrowserVersion[];
  orders: OrderSummary[];
  error?: string;
};

type BrowserData = {
  assets: BrowserAsset[];
  loadedAt: Date;
  error?: string;
};

type PanelMode = "list" | "detail" | "manifest";

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export function registerRepoChanPanel(pi: ExtensionAPI) {
  let sessionCwd = process.cwd();

  pi.on("session_start", async (_event, ctx) => {
    sessionCwd = ctx.cwd;
  });

  pi.registerCommand("repochan_panel", {
    description: "Open the RepoChan .repochan asset browser panel (/repochan_panel [asset-id])",
    getArgumentCompletions: async (prefix: string) => {
      try {
        const assets = await listBrowserAssetSummaries(sessionCwd);
        const items = assets
          .map((asset: AssetSummary) => ({
            value: asset.assetId,
            label: asset.assetId,
            description: asset.currentVersion
              ? `current: ${asset.currentVersion} · ${asset.versionCount} version(s)`
              : `${asset.versionCount} version(s)`,
          }))
          .filter((item) => item.value.startsWith(prefix));
        return items.length ? items : null;
      } catch {
        return null;
      }
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await openRepoChanPanel(ctx, args.trim() || undefined);
    },
  });
}

async function openRepoChanPanel(ctx: ExtensionCommandContext, initialAssetId?: string): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/repochan_panel requires Pi interactive TUI mode.", "warning");
    return;
  }

  let data = await loadBrowserData(ctx.cwd);
  if (initialAssetId) {
    try {
      validateAssetId(initialAssetId);
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      return;
    }
  }

  const overlayMode = process.env.REPOCHAN_PANEL_OVERLAY === "1";
  const inlineImages = !overlayMode && process.env.REPOCHAN_PANEL_INLINE_IMAGES !== "0";

  const panelFactory = (tui: { requestRender: (force?: boolean) => void }, theme: Theme, _keybindings: unknown, done: (value: void) => void) => {
    // Drop pi-tui's previousLines cache before showing the panel. This clears stale
    // terminal-image diff state; it cannot remove image messages from the session history,
    // so overlay mode still remains opt-in until upstream pi-tui guards isImageLine().
    queueMicrotask(() => tui.requestRender(true));

    const panel = new RepoChanAssetPanel({
      cwd: ctx.cwd,
      data,
      initialAssetId,
      theme,
      inlineImages,
      requestRender: () => tui.requestRender(),
      onClose: () => done(undefined),
      onRefresh: async () => {
        data = await loadBrowserData(ctx.cwd);
        return data;
      },
      onSetCurrent: async (assetId, versionId) => {
        await setCurrentAsset(ctx.cwd, assetId, versionId);
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
        // Overlay mode is opt-in because pi-tui 0.79.x can crash while composing overlays
        // over prior terminal-image history (isImageLine(undefined) in compositeLineAt).
        anchor: "center",
        width: "88%",
        minWidth: 60,
        maxHeight: "95%",
        margin: 0.5,
      },
    });
    return;
  }

  // Default to non-overlay custom UI. This avoids pi-tui's overlay compositor entirely,
  // which is the crash path reported when opening /repochan_panel after image output.
  await ctx.ui.custom<void>(panelFactory);
}

class RepoChanAssetPanel implements Component {
  private mode: PanelMode = "list";
  private selectedAssetIndex = 0;
  private selectedVersionIndex = 0;
  private statusMessage = "";
  private busy = false;

  constructor(
    private readonly opts: {
      cwd: string;
      data: BrowserData;
      initialAssetId?: string;
      theme: Theme;
      inlineImages: boolean;
      requestRender: () => void;
      onClose: () => void;
      onRefresh: () => Promise<BrowserData>;
      onSetCurrent: (assetId: string, versionId: string) => Promise<BrowserData>;
    },
  ) {
    if (opts.initialAssetId) {
      const index = opts.data.assets.findIndex((asset) => asset.assetId === opts.initialAssetId);
      if (index >= 0) {
        this.selectedAssetIndex = index;
        this.mode = "detail";
        this.selectCurrentVersion();
      } else {
        this.statusMessage = `Asset not found: ${opts.initialAssetId}`;
      }
    }
  }

  invalidate(): void {
    // Stateless render; Image components are recreated to pick up theme/capability changes.
  }

  handleInput(data: string): void {
    if (this.busy) return;

    if (data === "q" || matchesKey(data, Key.ctrl("c"))) {
      this.opts.onClose();
      return;
    }
    if (matchesKey(data, Key.escape)) {
      if (this.mode === "detail") this.mode = "list";
      else if (this.mode === "manifest") this.mode = "detail";
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
    this.handleManifestInput(data);
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

      if (this.opts.data.assets.length === 0) {
        lines.push(this.color("muted", "No .repochan assets found in this workspace.", w));
        lines.push(this.color("dim", "Use repochan asset.create_version after creating analysis/persona/orders.", w));
        lines.push("");
        lines.push(this.help(w, "r refresh · q/esc close"));
        lines.push(this.rule(w, "accent"));
        return lines.filter((l): l is string => typeof l === "string");
      }

      if (this.mode === "list") lines.push(...this.renderList(w));
      else if (this.mode === "detail") lines.push(...this.renderDetail(w));
      else lines.push(...this.renderManifest(w));

      if (this.statusMessage) {
        lines.push(this.rule(w, "borderMuted"));
        lines.push(this.color(this.statusMessage.startsWith("Error") ? "error" : "dim", this.statusMessage, w));
      }
      lines.push(this.rule(w, "accent"));
      return lines.filter((l): l is string => typeof l === "string");
    } catch (error) {
      const w = Math.max(24, width);
      return [
        this.color("error", "RepoChan Assets panel render failed (safe fallback).", w),
        this.color("dim", String(error), w),
        this.rule(w, "accent"),
      ];
    }
  }

  private handleListInput(data: string): void {
    if (matchesKey(data, Key.up)) this.moveAsset(-1);
    else if (matchesKey(data, Key.down)) this.moveAsset(1);
    else if (matchesKey(data, Key.enter) || matchesKey(data, Key.right)) {
      this.mode = "detail";
      this.selectCurrentVersion();
    } else if (data === "o" || data === "O") {
      const img = this.selectedVersion()?.image;
      if (img?.path) {
        this.openExternal(img.path);
        this.statusMessage = `Opened ${img.filename} externally`;
        this.opts.requestRender();
      } else {
        this.statusMessage = "No image to open for current selection.";
        this.opts.requestRender();
      }
      return;
    } else {
      return;
    }
    this.opts.requestRender();
  }

  private handleDetailInput(data: string): void {
    const asset = this.selectedAsset();
    if (!asset) return;
    if (matchesKey(data, Key.left) || matchesKey(data, Key.backspace)) this.mode = "list";
    else if (matchesKey(data, Key.up)) this.moveVersion(-1);
    else if (matchesKey(data, Key.down)) this.moveVersion(1);
    else if (data === "m" || data === "M") this.mode = "manifest";
    else if (data === "s" || data === "S") void this.setCurrentVersion();
    else if (data === "o" || data === "O") {
      const img = this.selectedVersion()?.image;
      if (img?.path) {
        this.openExternal(img.path);
        this.statusMessage = `Opened ${img.filename} externally`;
        this.opts.requestRender();
      } else {
        this.statusMessage = "No image to open for current selection.";
        this.opts.requestRender();
      }
      return;
    } else return;
    this.opts.requestRender();
  }

  private handleManifestInput(data: string): void {
    if (matchesKey(data, Key.left) || matchesKey(data, Key.backspace) || data === "m" || data === "M") {
      this.mode = "detail";
      this.opts.requestRender();
    } else if (data === "o" || data === "O") {
      const img = this.selectedVersion()?.image;
      if (img?.path) {
        this.openExternal(img.path);
        this.statusMessage = `Opened ${img.filename} externally`;
        this.opts.requestRender();
      } else {
        this.statusMessage = "No image to open for current selection.";
        this.opts.requestRender();
      }
      return;
    }
  }

  private moveAsset(delta: number): void {
    const total = this.opts.data.assets.length;
    if (!total) return;
    this.selectedAssetIndex = (this.selectedAssetIndex + delta + total) % total;
    this.selectCurrentVersion();
  }

  private moveVersion(delta: number): void {
    const versions = this.selectedAsset()?.versions ?? [];
    if (!versions.length) return;
    this.selectedVersionIndex = (this.selectedVersionIndex + delta + versions.length) % versions.length;
  }

  private selectedAsset(): BrowserAsset | undefined {
    return this.opts.data.assets[this.selectedAssetIndex];
  }

  private selectedVersion(): BrowserVersion | undefined {
    return this.selectedAsset()?.versions[this.selectedVersionIndex];
  }

  private selectCurrentVersion(): void {
    const asset = this.selectedAsset();
    if (!asset?.versions.length) {
      this.selectedVersionIndex = 0;
      return;
    }
    const currentIndex = asset.versions.findIndex((version) => version.versionId === asset.currentVersion);
    this.selectedVersionIndex = currentIndex >= 0 ? currentIndex : 0;
  }

  private async refresh(): Promise<void> {
    this.busy = true;
    this.statusMessage = "Refreshing assets…";
    this.opts.requestRender();
    const selectedId = this.selectedAsset()?.assetId;
    try {
      this.opts.data = await this.opts.onRefresh();
      if (selectedId) {
        const nextIndex = this.opts.data.assets.findIndex((asset) => asset.assetId === selectedId);
        this.selectedAssetIndex = Math.max(0, nextIndex);
      }
      this.selectedAssetIndex = Math.min(this.selectedAssetIndex, Math.max(0, this.opts.data.assets.length - 1));
      this.selectCurrentVersion();
      this.statusMessage = `Refreshed ${this.opts.data.assets.length} asset(s).`;
    } catch (error) {
      this.statusMessage = `Error refreshing assets: ${messageFromError(error)}`;
    } finally {
      this.busy = false;
      this.opts.requestRender();
    }
  }

  private async setCurrentVersion(): Promise<void> {
    const asset = this.selectedAsset();
    const version = this.selectedVersion();
    if (!asset?.manifest || !version) return;
    if (asset.currentVersion === version.versionId) {
      this.statusMessage = `${version.versionId} is already current.`;
      this.opts.requestRender();
      return;
    }
    this.busy = true;
    this.statusMessage = `Setting ${version.versionId} as current…`;
    this.opts.requestRender();
    try {
      this.opts.data = await this.opts.onSetCurrent(asset.assetId, version.versionId);
      const nextAsset = this.opts.data.assets.findIndex((candidate) => candidate.assetId === asset.assetId);
      if (nextAsset >= 0) this.selectedAssetIndex = nextAsset;
      this.selectCurrentVersion();
      this.statusMessage = `Set ${asset.assetId} currentVersion to ${version.versionId}.`;
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
    if (process.platform === "darwin") {
      cmd = `open "${escaped}"`;
    } else if (process.platform === "win32") {
      cmd = `start "" "${escaped}"`;
    } else {
      cmd = `xdg-open "${escaped}"`;
    }
    exec(cmd, () => {
      // fire-and-forget; errors are non-fatal for UX
    });
  }

  private renderList(width: number): string[] {
    const asset = this.selectedAsset();
    const lines: string[] = [];
    const maxVisible = 10;
    const start = scrollStart(this.selectedAssetIndex, this.opts.data.assets.length, maxVisible);
    const end = Math.min(start + maxVisible, this.opts.data.assets.length);

    lines.push(this.color("muted", `Assets (${this.opts.data.assets.length})`, width));
    for (let i = start; i < end; i++) {
      const item = this.opts.data.assets[i]!;
      const selected = i === this.selectedAssetIndex;
      const current = item.currentVersion ? `current ${item.currentVersion}` : "no current";
      const row = `${selected ? "❯" : " "} ${item.assetId}  ·  ${current}  ·  ${item.versionCount} version(s)`;
      lines.push(this.row(row, width, selected));
    }
    if (start > 0 || end < this.opts.data.assets.length) {
      lines.push(this.color("dim", `${this.selectedAssetIndex + 1}/${this.opts.data.assets.length}`, width));
    }

    if (asset) {
      lines.push("");
      lines.push(this.color("accent", `Preview: ${asset.assetId}`, width));
      lines.push(...this.renderPreview(asset, asset.versions.find((v) => v.versionId === asset.currentVersion) ?? asset.versions[0], width, 60, 22));
      lines.push(...this.assetSummaryLines(asset, width));
    }

    lines.push("");
    lines.push(this.help(width, "↑↓ select · enter detail · r refresh · o open externally · q/esc close"));
    return lines;
  }

  private renderDetail(width: number): string[] {
    const asset = this.selectedAsset();
    if (!asset) return [];
    const version = this.selectedVersion();
    const lines: string[] = [];
    lines.push(this.color("accent", this.opts.theme.bold(asset.assetId), width));
    if (asset.error) lines.push(this.color("error", asset.error, width));
    lines.push("");
    lines.push(...this.renderPreview(asset, version, width, Math.min(160, width - 4), 38));

    lines.push("");
    lines.push(...this.assetSummaryLines(asset, width));
    lines.push("");
    lines.push(this.color("muted", `Versions (${asset.versions.length})`, width));
    const start = scrollStart(this.selectedVersionIndex, asset.versions.length, 6);
    const end = Math.min(start + 6, asset.versions.length);
    for (let i = start; i < end; i++) {
      const item = asset.versions[i]!;
      const selected = i === this.selectedVersionIndex;
      const current = item.versionId === asset.currentVersion ? " *current" : "";
      const file = item.image ? ` · ${item.image.relPath}` : item.resolvedFiles[0] ? ` · ${shorten(item.resolvedFiles[0], 36)}` : "";
      lines.push(this.row(`${selected ? "❯" : " "} ${item.versionId}${current}${file}`, width, selected));
    }

    if (asset.orders.length) {
      lines.push("");
      lines.push(this.color("muted", "Linked orders", width));
      for (const order of asset.orders.slice(0, 4)) {
        const text = `${order.orderId} · ${order.status ?? "?"} · ${order.assetType ?? "asset"}${order.intent ? ` · ${order.intent}` : ""}`;
        lines.push(this.color("dim", text, width));
      }
    }

    lines.push("");
    lines.push(this.help(width, "↑↓ versions · s set current · m manifest · o open · ←/esc back · r refresh · q close"));
    return lines;
  }

  private renderManifest(width: number): string[] {
    const asset = this.selectedAsset();
    const lines: string[] = [];
    lines.push(this.color("accent", `Manifest: ${asset?.assetId ?? ""}`, width));
    const manifest = asset?.manifest;
    if (!manifest) {
      lines.push(this.color("warning", "No manifest loaded.", width));
    } else {
      const jsonLines = JSON.stringify(manifest, null, 2).split("\n");
      for (const line of jsonLines.slice(0, 28)) lines.push(this.color("text", line, width));
      if (jsonLines.length > 28) lines.push(this.color("dim", `… ${jsonLines.length - 28} more line(s)`, width));
    }
    lines.push("");
    lines.push(this.help(width, "m/←/esc back · o open · r refresh · q close"));
    return lines;
  }

  private renderPreview(asset: BrowserAsset, version: BrowserVersion | undefined, width: number, maxWidthCells: number, maxHeightCells: number): string[] {
    if (!version) return [this.color("dim", "No versions recorded.", width)];
    if (!version.image) {
      return this.renderImagePlaceholder(width, maxWidthCells, maxHeightCells,
        version.resolvedFiles.length
          ? `No image • ${version.resolvedFiles.map(f => path.basename(f)).join(", ")}`
          : "No image preview available");
    }

    if (!this.opts.inlineImages) {
      return [
        this.color("dim", `${version.versionId} · ${version.image.relPath}`, width),
        this.color("muted", `File: ${version.image.filename}  (${version.image.mimeType})`, width),
        this.color("warning", "Inline image preview disabled for overlay mode (pi-tui compositor bug).", width),
        this.color("accent", "Press 'o' (or 'O') to open the actual PNG externally.", width),
        ...this.renderImagePlaceholder(width, maxWidthCells, maxHeightCells,
          "Image on disk (use 'o' to view full size in Preview/Finder/etc.)")
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
      const hasImageProtocol = imgLines.some(
        (l) => l.includes("\x1b_G") || l.includes("\x1b]1337;File=")
      );
      const looksLikeFallback = imgLines.some((l) => l.includes("[Image:") || l.includes("image/"));
      if (!hasImageProtocol && looksLikeFallback) {
        return [
          this.color("dim", `${version.versionId} · ${version.image.relPath}`, width),
          ...this.renderImagePlaceholder(width, maxWidthCells, maxHeightCells,
            `${version.image.filename}  •  press 'o' to open externally`)
        ];
      }
      return [this.color("dim", `${version.versionId} · ${version.image.relPath}`, width), ...imgLines];
    } catch (error) {
      return [
        this.color("warning", `Preview failed for ${asset.assetId}: ${messageFromError(error)}`, width),
        this.color("accent", "Press 'o' to open externally, or set REPOCHAN_PANEL_INLINE_IMAGES=0 to disable previews.", width),
      ];
    }
  }

  private renderImagePlaceholder(width: number, maxW: number, maxH: number, info: string): string[] {
    const boxW = Math.max(20, Math.min(maxW, width - 4));
    const boxH = Math.max(4, maxH);
    const lines: string[] = [];
    const top = "┌" + "─".repeat(boxW) + "┐";
    lines.push(this.color("dim", top, width));
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
    const bottom = "└" + "─".repeat(boxW) + "┘";
    lines.push(this.color("dim", bottom, width));
    return lines;
  }

  private assetSummaryLines(asset: BrowserAsset, width: number): string[] {
    const orders = asset.manifest?.orderIds?.length ? asset.manifest.orderIds.join(", ") : "none";
    return [
      this.color("dim", `currentVersion: ${asset.currentVersion ?? "none"}`, width),
      this.color("dim", `versions: ${asset.versionCount} · orders: ${orders}`, width),
    ];
  }

  private titleLine(width: number): string {
    const left = this.opts.theme.fg("accent", this.opts.theme.bold("RepoChan Assets"));
    const mode = this.mode === "list" ? "list" : this.mode === "detail" ? "detail" : "manifest";
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

async function loadBrowserData(cwd: string): Promise<BrowserData> {
  try {
    const listed = await listBrowserAssetSummaries(cwd);
    const assets = await Promise.all(listed.map((asset) => loadAsset(cwd, asset)));
    return { assets, loadedAt: new Date() };
  } catch (error) {
    return { assets: [], loadedAt: new Date(), error: messageFromError(error) };
  }
}

async function listBrowserAssetSummaries(cwd: string): Promise<AssetSummary[]> {
  const assetsDir = path.join(protocolRoot(cwd), "assets");
  try {
    const names = (await fs.readdir(assetsDir)).sort();
    const assets: AssetSummary[] = [];
    for (const name of names) {
      const manifestPath = path.join(assetsDir, name, "manifest.json");
      if (!(await exists(manifestPath))) continue;
      try {
        const manifest = (await readJson(manifestPath)) as AssetManifest;
        assets.push({
          assetId: manifest.assetId ?? name,
          currentVersion: manifest.currentVersion,
          versionCount: manifest.versions?.length ?? 0,
        });
      } catch {
        assets.push({ assetId: name, versionCount: 0 });
      }
    }
    return assets;
  } catch {
    return [];
  }
}

async function loadAsset(cwd: string, summary: AssetSummary): Promise<BrowserAsset> {
  try {
    const manifest = (await readJson(assetManifestPath(cwd, summary.assetId))) as AssetManifest;
    const versions = await Promise.all((manifest.versions ?? []).map((version) => loadVersion(cwd, manifest.assetId, manifest, version)));
    const orders = await Promise.all((manifest.orderIds ?? []).map((orderId) => loadOrderSummary(cwd, orderId)));
    return {
      ...summary,
      currentVersion: manifest.currentVersion,
      versionCount: manifest.versions?.length ?? summary.versionCount,
      manifest,
      versions,
      orders: orders.filter((order): order is OrderSummary => Boolean(order)),
    };
  } catch (error) {
    return { ...summary, versions: [], orders: [], error: messageFromError(error) };
  }
}

async function loadVersion(cwd: string, assetId: string, manifest: AssetManifest, version: VersionEntry): Promise<BrowserVersion> {
  const resolvedFiles = resolveVersionFiles(cwd, assetId, version);
  const imagePath = await findPreviewImage(cwd, assetId, manifest, version, resolvedFiles);
  const image = imagePath ? await readPreviewImage(cwd, imagePath) : undefined;
  return { ...version, resolvedFiles, image };
}

function resolveVersionFiles(cwd: string, assetId: string, version: VersionEntry): string[] {
  const assetDir = path.join(protocolRoot(cwd), "assets", assetId);
  return (version.files ?? [])
    .filter((file): file is string => typeof file === "string" && file.length > 0)
    .map((file) => {
      if (path.isAbsolute(file)) return file;
      if (file.startsWith(".repochan/") || file.startsWith(".repochan" + path.sep)) return path.resolve(cwd, file);
      return path.resolve(assetDir, file);
    });
}

async function findPreviewImage(
  cwd: string,
  assetId: string,
  manifest: AssetManifest,
  version: VersionEntry,
  resolvedFiles: string[],
): Promise<string | undefined> {
  if (manifest.currentVersion === version.versionId) {
    const current = await firstImageInDir(path.join(protocolRoot(cwd), "assets", assetId, "current"));
    if (current) return current;
  }
  for (const file of resolvedFiles) {
    if (isSupportedImage(file) && (await exists(file))) return file;
  }
  return firstImageInDir(path.join(protocolRoot(cwd), "assets", assetId, "versions", version.versionId));
}

async function firstImageInDir(dir: string): Promise<string | undefined> {
  try {
    const entries = (await fs.readdir(dir)).sort();
    for (const entry of entries) {
      const file = path.join(dir, entry);
      if (isSupportedImage(file) && (await exists(file))) return file;
    }
  } catch {
    // Directory is optional.
  }
  return undefined;
}

async function readPreviewImage(cwd: string, file: string): Promise<PreviewImage | undefined> {
  const mimeType = IMAGE_EXT_TO_MIME[path.extname(file).toLowerCase()];
  if (!mimeType) return undefined;
  try {
    const buffer = await fs.readFile(file);
    return {
      path: file,
      relPath: relativeProtocolPath(cwd, file),
      mimeType,
      base64: buffer.toString("base64"),
      filename: path.basename(file),
    };
  } catch {
    return undefined;
  }
}

async function loadOrderSummary(cwd: string, orderId: string): Promise<OrderSummary | undefined> {
  try {
    const order = (await readJson(path.join(protocolRoot(cwd), "orders", `${orderId}.json`))) as AssetOrder;
    return {
      orderId: order.orderId,
      status: order.status,
      assetType: order.assetType,
      intent: order.brief?.intent,
    };
  } catch {
    return undefined;
  }
}

function isSupportedImage(file: string): boolean {
  return Boolean(IMAGE_EXT_TO_MIME[path.extname(file).toLowerCase()]);
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

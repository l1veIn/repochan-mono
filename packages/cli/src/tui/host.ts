import path from "node:path";

import {
  DefaultPackageManager,
  getAgentDir,
  SettingsManager,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, ProcessTerminal, TUI, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import {
  assetManifestPath,
  inspectProtocol,
  listAssets,
  listOrders,
  protocolRoot,
  readJson,
  setCurrentAsset,
  validateProtocol,
  type ProtocolValidationProblem,
} from "@repochan/core";

import { buildInstallPiPackagePlan, parseInstallPiPackageArgs, type InstallPiPackagePlan } from "../app/install-pi-package.js";
import { createGuidedRuntime, DEFAULT_GUIDED_INITIAL_MESSAGE, type RunGuidedOptions } from "../app/run-guided.js";
import { buildRunPhaseInitialMessage, buildRunPhaseConductorNote, createRunPhaseRuntime, parseRunPhaseArgs, type RepoChanRunPhase, type RunPhaseArgs } from "../app/run-phase.js";
import { createRepoChanRuntime, type RepoChanRuntimeResult, type RepoChanSessionMode } from "../app/pi-runtime.js";

import { createCliTheme } from "./theme.js";
import { InstallScreen } from "./screens/install.js";
import { PhaseTaskScreen } from "./screens/phase-task.js";
import { SettingsScreen } from "./screens/settings.js";
import { messageFromError, safeJson } from "./utils.js";

export type TuiCommand =
  | { kind: "overview" }
  | { kind: "wizard"; newSession?: boolean; initialMessage?: string }
  | { kind: "guided"; newSession?: boolean }
  | { kind: "run"; args: string[]; newSession?: boolean }
  | { kind: "inspect" }
  | { kind: "validate" }
  | { kind: "orders"; args: string[] }
  | { kind: "assets"; args: string[] }
  | { kind: "install"; args: string[] }
  | { kind: "settings" };

export type LaunchRepoChanTuiOptions = {
  cwd?: string;
  command?: TuiCommand;
};

type HostScreen =
  | "overview"
  | "assets"
  | "orders"
  | "validate"
  | "inspect"
  | "settings"
  | "help"
  | "install"
  | "phase"
  | "palette";

type RuntimeTask =
  | { type: "guided"; options: RunGuidedOptions }
  | { type: "phase"; args: RunPhaseArgs };

export async function launchRepoChanTui(options: LaunchRepoChanTuiOptions = {}) {
  const cliTheme = createCliTheme();
  const cwd = options.cwd ?? process.cwd();
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    tui.stop();
  };

  const host = new RepoChanTuiHost({ cwd, theme: cliTheme, requestRender: () => tui.requestRender(), onClose: finish });
  tui.addChild(host);
  tui.setFocus(host);
  tui.start();
  tui.requestRender(true);
  terminal.setTitle(`RepoChan · ${path.basename(cwd) || cwd}`);

  try {
    await host.applyCommand(options.command ?? { kind: "overview" });
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (done) {
          clearInterval(timer);
          resolve();
        }
      }, 40);
    });
  } finally {
    await host.dispose();
    try {
      await terminal.drainInput(120, 20);
    } catch {
      // Best-effort terminal cleanup.
    }
  }
}

export class RepoChanTuiHost implements Component {
  private screen: HostScreen = "overview";
  private previousScreen: HostScreen = "overview";
  private selectedMenu = 0;
  private paletteIndex = 0;
  private status = "ready";
  private overview: Awaited<ReturnType<typeof loadOverview>> | undefined;
  private validation: Awaited<ReturnType<typeof validateProtocol>> | undefined;
  private orders: Awaited<ReturnType<typeof listOrders>> | undefined;
  private assets: Awaited<ReturnType<typeof listAssets>> | undefined;
  private selectedOrderIndex = 0;
  private selectedAssetIndex = 0;
  private inspectSummary: Awaited<ReturnType<typeof inspectProtocol>> | undefined;
  private installScreen: InstallScreen | undefined;
  private phaseScreen: PhaseTaskScreen | undefined;
  private settingsScreen: SettingsScreen | undefined;

  constructor(
    private readonly opts: {
      cwd: string;
      theme: Theme;
      requestRender: () => void;
      onClose: () => void;
    },
  ) {
    void this.refreshAll();
  }

  async dispose() {
    await this.phaseScreen?.dispose();
    await this.settingsScreen?.dispose();
  }

  invalidate(): void {
    this.phaseScreen?.invalidate();
    this.installScreen?.invalidate();
    this.settingsScreen?.invalidate();
  }

  async applyCommand(command: TuiCommand) {
    if (command.kind === "overview") return;
    if (command.kind === "wizard") {
      this.startGuided(command.newSession ?? false, command.initialMessage, "overview");
      return;
    }
    if (command.kind === "guided") {
      this.startGuided(command.newSession ?? false);
      return;
    }
    if (command.kind === "run") {
      const args = parseRunPhaseArgs(command.args, { newSession: command.newSession });
      this.startPhase(args);
      return;
    }
    if (command.kind === "inspect") this.switchScreen("inspect");
    else if (command.kind === "validate") this.switchScreen("validate");
    else if (command.kind === "orders") this.switchScreen("orders");
    else if (command.kind === "assets") this.switchScreen("assets");
    else if (command.kind === "settings") this.switchScreen("settings");
    else if (command.kind === "install") this.openInstall(command.args);
    this.opts.requestRender();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.ctrl("c")) || data === "q") {
      this.opts.onClose();
      return;
    }

    if (this.screen === "phase") {
      this.phaseScreen?.handleInput(data);
      return;
    }
    if (this.screen === "install") {
      this.installScreen?.handleInput(data);
      return;
    }
    if (this.screen === "settings") {
      this.settingsScreen?.handleInput(data);
      if (matchesKey(data, Key.escape)) this.switchScreen("overview");
      return;
    }
    if (this.screen === "palette") {
      this.handlePaletteInput(data);
      return;
    }

    if (data === "/" || data === ":") {
      this.previousScreen = this.screen;
      this.screen = "palette";
      this.opts.requestRender();
      return;
    }
    if (data === "r" || data === "R") {
      void this.refreshAll();
      return;
    }
    if (matchesKey(data, Key.escape)) {
      if (this.screen === "overview") this.opts.onClose();
      else this.switchScreen("overview");
      return;
    }

    const menuHit = MENU.findIndex((item) => item.key === data);
    if (menuHit >= 0) {
      this.selectedMenu = menuHit;
      this.switchScreen(MENU[menuHit]!.screen);
      return;
    }

    if (matchesKey(data, Key.left)) this.moveMenu(-1);
    else if (matchesKey(data, Key.right)) this.moveMenu(1);
    else if (matchesKey(data, Key.enter)) this.switchScreen(MENU[this.selectedMenu]!.screen);
    else if (data === "g" || data === "G") this.startGuided(false);
    else if (data === "a" || data === "A") this.startPhase({ phase: "analysis", newSession: false });
    else if (data === "p" || data === "P") this.startPhase({ phase: "persona", newSession: false });
    else if (data === "v" || data === "V") this.switchScreen("validate");
    else if (data === "i" || data === "I") this.switchScreen("inspect");
    else if (data === "o" || data === "O") this.switchScreen("orders");
    else if (data === "b" || data === "B") this.switchScreen("assets");
    else this.handleCurrentScreenInput(data);
  }

  render(width: number): string[] {
    const w = Math.max(40, width);
    const lines: string[] = [];
    lines.push(this.rule(w, "accent"));
    lines.push(this.header(w));
    lines.push(this.menu(w));
    lines.push(this.rule(w, "borderMuted"));

    if (this.screen === "palette") lines.push(...this.renderPalette(w));
    else if (this.screen === "overview") lines.push(...this.renderOverview(w));
    else if (this.screen === "assets") lines.push(...this.renderAssets(w));
    else if (this.screen === "orders") lines.push(...this.renderOrders(w));
    else if (this.screen === "validate") lines.push(...this.renderValidate(w));
    else if (this.screen === "inspect") lines.push(...this.renderInspect(w));
    else if (this.screen === "settings") lines.push(...(this.settingsScreen?.render(w) ?? [this.dim("Loading settings…", w)]));
    else if (this.screen === "install") lines.push(...(this.installScreen?.render(w) ?? [this.dim("Loading installer…", w)]));
    else if (this.screen === "phase") lines.push(...(this.phaseScreen?.render(w) ?? [this.dim("Starting phase…", w)]));
    else lines.push(...this.renderHelp(w));

    lines.push(this.rule(w, "borderMuted"));
    lines.push(this.footer(w));
    lines.push(this.rule(w, "accent"));
    return lines.map((line) => truncateToWidth(line, w, "…"));
  }

  private async refreshAll() {
    this.status = "refreshing";
    this.opts.requestRender();
    try {
      const [overview, validation, orders, assets, inspectSummary] = await Promise.all([
        loadOverview(this.opts.cwd),
        validateProtocol(this.opts.cwd),
        listOrders(this.opts.cwd).catch(() => ({ files: [], orders: [] })),
        listAssets(this.opts.cwd).catch(() => ({ assets: [] })),
        inspectProtocol(this.opts.cwd),
      ]);
      this.overview = overview;
      this.validation = validation;
      this.orders = orders;
      this.assets = assets;
      this.inspectSummary = inspectSummary;
      this.status = "refreshed";
    } catch (error) {
      this.status = `refresh error: ${messageFromError(error)}`;
    } finally {
      this.opts.requestRender();
    }
  }

  private switchScreen(screen: HostScreen) {
    this.screen = screen;
    const menuIndex = MENU.findIndex((item) => item.screen === screen);
    if (menuIndex >= 0) this.selectedMenu = menuIndex;
    if (screen === "settings" && !this.settingsScreen) {
      this.settingsScreen = new SettingsScreen({ cwd: this.opts.cwd, theme: this.opts.theme, requestRender: this.opts.requestRender });
    }
    this.opts.requestRender();
  }

  private moveMenu(delta: number) {
    this.selectedMenu = (this.selectedMenu + delta + MENU.length) % MENU.length;
    this.opts.requestRender();
  }

  private handleCurrentScreenInput(data: string) {
    if (this.screen === "orders") {
      const total = this.orders?.orders.length ?? 0;
      if (!total) return;
      if (matchesKey(data, Key.up)) this.selectedOrderIndex = (this.selectedOrderIndex - 1 + total) % total;
      if (matchesKey(data, Key.down)) this.selectedOrderIndex = (this.selectedOrderIndex + 1) % total;
      this.opts.requestRender();
    }
    if (this.screen === "assets") {
      const total = this.assets?.assets.length ?? 0;
      if (!total) return;
      if (matchesKey(data, Key.up)) this.selectedAssetIndex = (this.selectedAssetIndex - 1 + total) % total;
      if (matchesKey(data, Key.down)) this.selectedAssetIndex = (this.selectedAssetIndex + 1) % total;
      if (data === "s" || data === "S") void this.setCurrentAssetVersion();
      this.opts.requestRender();
    }
  }

  private handlePaletteInput(data: string) {
    const actions = this.paletteActions();
    if (matchesKey(data, Key.escape)) {
      this.screen = this.previousScreen;
      this.opts.requestRender();
      return;
    }
    if (matchesKey(data, Key.up)) this.paletteIndex = (this.paletteIndex - 1 + actions.length) % actions.length;
    else if (matchesKey(data, Key.down)) this.paletteIndex = (this.paletteIndex + 1) % actions.length;
    else if (matchesKey(data, Key.enter)) actions[this.paletteIndex]?.run();
    this.opts.requestRender();
  }

  private startGuided(newSession: boolean, initialMessage?: string, afterDoneScreen: "overview" | "assets" = "overview") {
    this.phaseScreen = new PhaseTaskScreen({
      cwd: this.opts.cwd,
      theme: this.opts.theme,
      requestRender: this.opts.requestRender,
      onClose: () => this.switchScreen("overview"),
      onDone: () => {
        void this.refreshAll().then(() => this.switchScreen(afterDoneScreen));
      },
      task: { type: "guided", options: { cwd: this.opts.cwd, newSession, initialMessage } },
    });
    this.switchScreen("phase");
    void this.phaseScreen.start();
  }

  private startPhase(args: RunPhaseArgs) {
    this.phaseScreen = new PhaseTaskScreen({
      cwd: this.opts.cwd,
      theme: this.opts.theme,
      requestRender: this.opts.requestRender,
      onClose: () => this.switchScreen("overview"),
      onDone: () => void this.refreshAll(),
      task: { type: "phase", args: { ...args, newSession: args.newSession ?? false } },
    });
    this.switchScreen("phase");
    void this.phaseScreen.start();
  }

  private openInstall(args: string[]) {
    this.installScreen = new InstallScreen({
      cwd: this.opts.cwd,
      theme: this.opts.theme,
      requestRender: this.opts.requestRender,
      onClose: () => this.switchScreen("overview"),
      args,
    });
    this.switchScreen("install");
  }

  private async setCurrentAssetVersion() {
    const asset = this.assets?.assets[this.selectedAssetIndex] as Record<string, unknown> | undefined;
    const assetId = typeof asset?.assetId === "string" ? asset.assetId : undefined;
    if (!assetId) return;
    try {
      const manifest = await readJson(assetManifestPath(this.opts.cwd, assetId));
      const versions = Array.isArray(manifest.versions) ? manifest.versions : [];
      const latest = versions.at(-1)?.versionId;
      if (typeof latest === "string" && latest !== manifest.currentVersion) {
        await setCurrentAsset(this.opts.cwd, assetId, latest);
        this.status = `set ${assetId} currentVersion=${latest}`;
        await this.refreshAll();
      } else {
        this.status = `${assetId} already current`;
      }
    } catch (error) {
      this.status = `asset error: ${messageFromError(error)}`;
    }
    this.opts.requestRender();
  }

  private paletteActions() {
    return [
      { label: "Run guided workflow", run: () => this.startGuided(false) },
      { label: "Run analysis phase", run: () => this.startPhase({ phase: "analysis", newSession: false }) },
      { label: "Run persona phase", run: () => this.startPhase({ phase: "persona", newSession: false }) },
      { label: "Open assets panel", run: () => this.switchScreen("assets") },
      { label: "Validate protocol", run: () => this.switchScreen("validate") },
      { label: "Inspect protocol", run: () => this.switchScreen("inspect") },
      { label: "Settings / login / model", run: () => this.switchScreen("settings") },
      { label: "Install repo chan Pi package", run: () => this.openInstall([]) },
      { label: "Help", run: () => this.switchScreen("help") },
    ];
  }

  private header(width: number) {
    const model = this.settingsScreen?.modelLabel() ?? "model: auto";
    const left = this.opts.theme.fg("accent", this.opts.theme.bold("RepoChan"));
    const middle = this.opts.theme.fg("dim", ` ${path.basename(this.opts.cwd) || this.opts.cwd}`);
    const right = this.opts.theme.fg("muted", `${model} · ${this.status}`);
    return joinLeftRight(left + middle, right, width);
  }

  private menu(width: number) {
    const parts = MENU.map((item, i) => {
      const label = `${item.key} ${item.label}`;
      return i === this.selectedMenu ? this.opts.theme.bg("selectedBg", this.opts.theme.fg("accent", ` ${label} `)) : this.opts.theme.fg("muted", ` ${label} `);
    });
    return truncateToWidth(parts.join(" "), width, "…");
  }

  private renderOverview(width: number): string[] {
    const o = this.overview;
    if (!o) return [this.dim("Loading Repo Wiki overview…", width)];
    const lines: string[] = [];
    lines.push(this.title("Repo Wiki / Overview", width));
    lines.push(this.dim("A zread-like table of contents for this workspace.", width));
    lines.push("");
    lines.push(...this.kv(width, ".repochan", o.protocol.exists ? "yes" : "no"));
    lines.push(...this.kv(width, "analysis", o.protocol.analysis ? ".repochan/analysis.json" : "missing"));
    lines.push(...this.kv(width, "persona", o.protocol.persona ? ".repochan/persona/current.json" : "missing"));
    lines.push(...this.kv(width, "orders", String(o.orderCount)));
    lines.push(...this.kv(width, "assets", String(o.assetCount)));
    lines.push("");
    lines.push(this.title("Next actions", width));
    for (const action of nextActions(o)) lines.push(this.row(`• ${action}`, width, false));
    lines.push("");
    lines.push(this.dim("Shortcuts: g guided · a analysis · p persona · o orders · b assets · v validate · / palette", width));
    return lines;
  }

  private renderAssets(width: number): string[] {
    const assets = this.assets?.assets ?? [];
    const lines = [this.title("Assets", width)];
    if (!assets.length) {
      lines.push(this.dim("No .repochan assets found. Run orders + painter to populate the brand kit.", width));
      return lines;
    }
    assets.forEach((asset, i) => {
      const row = asset as Record<string, unknown>;
      lines.push(this.row(`${i === this.selectedAssetIndex ? "❯" : " "} ${row.assetId ?? "unknown"} · current ${row.currentVersion ?? "none"} · ${row.versionCount ?? 0} version(s)`, width, i === this.selectedAssetIndex));
    });
    const selected = assets[this.selectedAssetIndex] as Record<string, unknown> | undefined;
    if (selected) {
      lines.push("");
      lines.push(this.title(`Asset detail: ${selected.assetId ?? "unknown"}`, width));
      lines.push(...this.kv(width, "currentVersion", String(selected.currentVersion ?? "none")));
      lines.push(...this.kv(width, "versions", String(selected.versionCount ?? 0)));
      lines.push(this.dim(`manifest: .repochan/assets/${selected.assetId}/manifest.json`, width));
    }
    lines.push("");
    lines.push(this.dim("↑↓ select · s set latest version current · r refresh · esc back", width));
    return lines;
  }

  private renderOrders(width: number): string[] {
    const orders = this.orders?.orders ?? [];
    const lines = [this.title("Orders", width)];
    if (!orders.length) {
      lines.push(this.dim("No orders found. Press / then choose an orders phase from the command palette.", width));
      return lines;
    }
    orders.forEach((order, i) => {
      const row = order as Record<string, unknown>;
      lines.push(this.row(`${i === this.selectedOrderIndex ? "❯" : " "} ${row.orderId ?? row.file ?? "unknown"} · ${row.status ?? "?"} · ${row.assetType ?? "asset"}`, width, i === this.selectedOrderIndex));
    });
    const selected = orders[this.selectedOrderIndex] as Record<string, unknown> | undefined;
    if (selected) {
      lines.push("");
      lines.push(...this.kv(width, "priority", String(selected.priority ?? "normal")));
      lines.push(this.dim(`file: .repochan/orders/${selected.file ?? `${selected.orderId}.json`}`, width));
    }
    return lines;
  }

  private renderValidate(width: number): string[] {
    const result = this.validation;
    const lines = [this.title("Protocol validation", width)];
    if (!result) return [...lines, this.dim("Validating…", width)];
    lines.push(...this.kv(width, "status", result.ok ? "ok" : "needs attention"));
    lines.push(...this.kv(width, "orders checked", String(result.checked.orders)));
    lines.push(...this.kv(width, "assets checked", String(result.checked.assets)));
    lines.push("");
    lines.push(...this.issueList("Problems", result.problems, width, "error"));
    lines.push(...this.issueList("Warnings", result.warnings, width, "warning"));
    if (!result.problems.length && !result.warnings.length) lines.push(this.opts.theme.fg("success", "No protocol problems found."));
    lines.push("");
    lines.push(this.dim("r refresh · i inspect · esc overview", width));
    return lines;
  }

  private renderInspect(width: number): string[] {
    const s = this.inspectSummary;
    const lines = [this.title("Protocol inspect", width)];
    if (!s) return [...lines, this.dim("Inspecting…", width)];
    lines.push(...this.kv(width, "root", String(s.root)));
    lines.push(...this.kv(width, ".repochan", Boolean(s.exists) ? "yes" : "no"));
    lines.push(...this.kv(width, "analysis", Boolean(s.analysis) ? "yes" : "no"));
    lines.push(...this.kv(width, "persona", Boolean(s.persona) ? "yes" : "no"));
    lines.push(...this.kv(width, "analysis versions", String(asArray(s.analysisVersions).length)));
    lines.push(...this.kv(width, "persona versions", String(asArray(s.personaVersions).length)));
    lines.push(...this.kv(width, "orders", String(asArray(s.orders).length)));
    lines.push(...this.kv(width, "assets", String(asArray(s.assets).length)));
    return lines;
  }

  private renderHelp(width: number): string[] {
    return [
      this.title("Help", width),
      this.dim("Only `repochan chat` opens the full Pi InteractiveMode. This custom host owns all other commands.", width),
      "",
      this.row("g guided workflow · / command palette · 1-5 menu · r refresh", width, false),
      this.row("run phases: a analysis · p persona · orders/painter via palette or CLI args", width, false),
      this.row("deterministic: inspect/validate/order/asset screens use @repochan/core directly", width, false),
      this.row("q/esc/ctrl+c close", width, false),
    ];
  }

  private renderPalette(width: number): string[] {
    const actions = this.paletteActions();
    const lines = [this.title("Command palette", width), this.dim("↑↓ choose · enter run · esc back", width), ""];
    actions.forEach((action, i) => lines.push(this.row(`${i === this.paletteIndex ? "❯" : " "} ${action.label}`, width, i === this.paletteIndex)));
    return lines;
  }

  private issueList(title: string, issues: ProtocolValidationProblem[], width: number, tone: "error" | "warning") {
    if (!issues.length) return [];
    const lines = [this.opts.theme.fg(tone, title)];
    for (const issue of issues.slice(0, 8)) {
      lines.push(this.opts.theme.fg(tone, `- ${issue.code}: ${issue.message}`));
      if (issue.path) lines.push(this.dim(`  path: ${issue.path}`, width));
      if (issue.suggestion) lines.push(this.dim(`  suggestion: ${issue.suggestion}`, width));
    }
    if (issues.length > 8) lines.push(this.dim(`… ${issues.length - 8} more`, width));
    return lines;
  }

  private footer(width: number) {
    return this.dim("↑/↓ navigate · enter select · / palette · r refresh · q/esc quit", width);
  }

  private rule(width: number, color: "accent" | "borderMuted") {
    return this.opts.theme.fg(color, "─".repeat(Math.max(1, width)));
  }

  private title(text: string, width: number) {
    return truncateToWidth(this.opts.theme.fg("accent", this.opts.theme.bold(text)), width, "…");
  }

  private dim(text: string, width: number) {
    return truncateToWidth(this.opts.theme.fg("dim", text), width, "…");
  }

  private kv(width: number, key: string, value: string) {
    return [truncateToWidth(`${this.opts.theme.fg("muted", key.padEnd(18))} ${this.opts.theme.fg("text", value)}`, width, "…")];
  }

  private row(text: string, width: number, selected: boolean) {
    const line = truncateToWidth(text, width, "…");
    const padded = line + " ".repeat(Math.max(0, width - visibleWidth(line)));
    if (!selected) return this.opts.theme.fg("text", padded);
    return this.opts.theme.bg("selectedBg", this.opts.theme.fg("accent", padded));
  }
}

const MENU: Array<{ screen: HostScreen; label: string; key: string }> = [
  { screen: "overview", label: "Repo Wiki", key: "1" },
  { screen: "assets", label: "Assets", key: "2" },
  { screen: "validate", label: "Validate", key: "3" },
  { screen: "settings", label: "Settings", key: "4" },
  { screen: "help", label: "Help", key: "5" },
];

async function loadOverview(cwd: string) {
  const protocol = await inspectProtocol(cwd);
  const orders = protocol.exists ? await listOrders(cwd).catch(() => ({ orders: [] })) : { orders: [] };
  const assets = protocol.exists ? await listAssets(cwd).catch(() => ({ assets: [] })) : { assets: [] };
  return {
    protocol,
    orderCount: orders.orders.length,
    assetCount: assets.assets.length,
  };
}

function nextActions(overview: Awaited<ReturnType<typeof loadOverview>>) {
  if (!overview.protocol.exists || !overview.protocol.analysis) return ["Run analysis phase (press a) to create deterministic repository baseline."];
  if (!overview.protocol.persona) return ["Run persona phase (press p) after reviewing analysis."];
  if (overview.orderCount === 0) return ["Create asset orders for a concrete goal: `repochan run orders --goal ...`."];
  if (overview.assetCount === 0) return ["Review/approve orders, then run painter for a selected order."];
  return ["Browse Assets, validate protocol, and export/use the brand kit."];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function joinLeftRight(left: string, right: string, width: number) {
  const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
  return truncateToWidth(left + " ".repeat(gap) + right, width, "");
}

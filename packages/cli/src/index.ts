#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TUI, ProcessTerminal, matchesKey, Key, type Component } from "@earendil-works/pi-tui";

import { WizardHost } from "./pages/wizard.js";
import { ModelHost } from "./pages/model.js";
import { type TuiRef } from "./types.js";
import { t } from "./i18n.js";
import { runInit } from "./commands/init.js";
import { runStatus } from "./commands/status.js";
import { runInspect } from "./commands/inspect.js";
import { runValidate } from "./commands/validate.js";
import { runOrderCommand } from "./commands/order.js";
import { runAssetCommand } from "./commands/asset.js";
import { printError, UsageError } from "./commands/common.js";

const VERSION = "0.1.0";

type ParsedArgs = { positionals: string[]; json: boolean; help: boolean; version: boolean };

type Route =
  | { kind: "wizard"; directMode?: "model" }
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "init"; json: boolean }
  | { kind: "status"; json: boolean }
  | { kind: "inspect"; json: boolean }
  | { kind: "validate"; json: boolean }
  | { kind: "order"; args: string[]; json: boolean }
  | { kind: "asset"; args: string[]; json: boolean };

export async function launchWizard(directMode?: "model") {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  const { initLanguage } = await import("./i18n.js");
  await initLanguage();

  const tuiRef: TuiRef = {
    setFocus: (c: Component) => tui.setFocus(c),
    requestRender: () => tui.requestRender(),
    getTui: () => tui,
  };

  const wizard = new WizardHost(tuiRef);

  tui.addChild(wizard);
  tui.setFocus(wizard);

  if (directMode === "model") {
    const modelHost = new ModelHost(() => {
      tui.stop();
      process.exit(0);
    }, tui);
    tui.clear();
    tui.addChild(modelHost);
    tui.setFocus(modelHost);
  }

  tui.addInputListener((data) => {
    if (matchesKey(data, Key.ctrl("c")) || data === "q") {
      tui.stop();
      process.exit(0);
    }
    return undefined;
  });

  tui.start();
  if (directMode !== "model") console.log(t("launch.started"));
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { positionals: [], json: false, help: false, version: false };
  for (const arg of argv) {
    if (arg === "--json") parsed.json = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--version" || arg === "-v") parsed.version = true;
    else parsed.positionals.push(arg);
  }
  return parsed;
}

function resolveRoute(argv: string[]): Route {
  const parsed = parseArgs(argv);
  const [command, ...rest] = parsed.positionals;
  if (parsed.version) return { kind: "version" };
  if (parsed.help) return { kind: "help" };
  if (!command) return { kind: "wizard" };
  if (command === "model" || command === "login" || command === "settings") return { kind: "wizard", directMode: "model" };
  if (command === "init") return { kind: "init", json: parsed.json };
  if (command === "status") return { kind: "status", json: parsed.json };
  if (command === "inspect") return { kind: "inspect", json: parsed.json };
  if (command === "validate") return { kind: "validate", json: parsed.json };
  if (command === "order") return { kind: "order", args: rest, json: parsed.json };
  if (command === "asset") return { kind: "asset", args: rest, json: parsed.json };
  if (command === "app" || command === "tui" || command === "ui") return { kind: "wizard" };
  throw new UsageError(`Unknown command: ${command}.`, "Try: init, status, inspect, validate, order, asset, or no args for TUI.");
}

function printHelp() {
  console.log(`RepoChan CLI ${VERSION}

Usage:
  repochan                         Launch interactive TUI wizard
  repochan init [--json]           Initialize .repochan protocol directories
  repochan status [--json]         Print protocol overview
  repochan inspect [--json]        Print raw protocol inspection summary
  repochan validate [--json]       Validate protocol artifacts
  repochan order list [--json]
  repochan order get <order-id> [--json]
  repochan asset list [--json]
  repochan asset get <asset-id> [--json]
  repochan model                   Open model/login setup in TUI
`);
}

async function main(argv: string[]) {
  const route = resolveRoute(argv);
  const cwd = process.cwd();
  if (route.kind === "version") return console.log(VERSION);
  if (route.kind === "help") return printHelp();
  if (route.kind === "wizard") return launchWizard(route.directMode);
  if (route.kind === "init") return runInit(cwd, { json: route.json });
  if (route.kind === "status") return runStatus(cwd, { json: route.json });
  if (route.kind === "inspect") return runInspect(cwd, { json: route.json });
  if (route.kind === "validate") return runValidate(cwd, { json: route.json });
  if (route.kind === "order") return runOrderCommand(cwd, route.args, { json: route.json });
  if (route.kind === "asset") return runAssetCommand(cwd, route.args, { json: route.json });
}

export { ModelHost } from "./pages/model.js";
export { SettingsHost } from "./pages/settings.js";
export { WizardHost } from "./pages/wizard.js";
export { LanguageHost } from "./pages/language.js";
export { AnalysisPage } from "./pages/analysis.js";
export { PersonaPage } from "./pages/persona.js";
export { OrdersPage, OrdersHost } from "./pages/orders.js";
export { OrderDetailPage, OrderDetailHost } from "./pages/order-detail.js";
export { getRepoChanRuntime, clearRuntimeCache, OUR_AGENT_DIR, createRepoChanRuntime, startRoleSession } from "./lib/runtime.js";
export type { OnBack, TuiRef } from "./types.js";
export { AgentStatus } from "./components/agent-status.js";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    printError(error);
    process.exitCode = 1;
  });
}

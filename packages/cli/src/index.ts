#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TUI, ProcessTerminal, matchesKey, Key, type Component } from "@earendil-works/pi-tui";

import { WizardHost } from "./pages/wizard.js";
import { ModelHost } from "./pages/model.js";
import { AnalysisPage } from "./pages/analysis.js";
import { PersonaPage } from "./pages/persona.js";
import { FoundationPage } from "./pages/foundation.js";
import { PaintPage } from "./pages/paint.js";
import { type TuiRef } from "./types.js";
import { t } from "./i18n.js";
import { runInit } from "./commands/init.js";
import { runSetup } from "./commands/setup.js";
import { runStatus } from "./commands/status.js";
import { runInspect } from "./commands/inspect.js";
import { runValidate } from "./commands/validate.js";
import { runOrderCommand } from "./commands/order.js";
import { printError, UsageError } from "./commands/common.js";

const VERSION = "0.1.0";

type ParsedArgs = { positionals: string[]; json: boolean; help: boolean; version: boolean };

type Route =
  | { kind: "wizard"; directMode?: "model" }
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "init"; json: boolean }
  | { kind: "setup"; json: boolean }
  | { kind: "status"; json: boolean }
  | { kind: "inspect"; json: boolean }
  | { kind: "validate"; json: boolean }
  | { kind: "order"; args: string[]; json: boolean }
  | { kind: "analyze" }
  | { kind: "persona" }
  | { kind: "foundation" }
  | { kind: "paint"; orderId?: string };

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

type DirectPageKind = "analyze" | "persona" | "foundation" | "paint";

export async function launchDirectPage(kind: DirectPageKind, paintOrderId?: string) {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  const { initLanguage } = await import("./i18n.js");
  await initLanguage();

  const tuiRef: TuiRef = {
    setFocus: (c: Component) => tui.setFocus(c),
    requestRender: () => tui.requestRender(),
    getTui: () => tui,
  };

  const quit = () => {
    tui.stop();
    process.exit(0);
  };

  let page: Component;
  if (kind === "analyze") {
    page = new AnalysisPage(quit, tuiRef);
  } else if (kind === "persona") {
    page = new PersonaPage(quit, tuiRef);
  } else if (kind === "foundation") {
    page = new FoundationPage(quit, tuiRef);
  } else {
    page = new PaintPage(quit, tuiRef, paintOrderId);
  }

  tui.addChild(page);
  tui.setFocus(page);

  tui.addInputListener((data) => {
    if (matchesKey(data, Key.ctrl("c"))) {
      tui.stop();
      process.exit(0);
    }
    return undefined;
  });

  tui.start();
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
  if (command === "setup") return { kind: "setup", json: parsed.json };
  if (command === "status") return { kind: "status", json: parsed.json };
  if (command === "inspect") return { kind: "inspect", json: parsed.json };
  if (command === "validate") return { kind: "validate", json: parsed.json };
  if (command === "order") return { kind: "order", args: rest, json: parsed.json };
  if (command === "analyze" || command === "analysis") return { kind: "analyze" };
  if (command === "persona") return { kind: "persona" };
  if (command === "foundation") return { kind: "foundation" };
  if (command === "paint") return { kind: "paint", orderId: rest[0] };

  if (command === "app" || command === "tui" || command === "ui") return { kind: "wizard" };
  throw new UsageError(`Unknown command: ${command}.`, "Try: init, status, inspect, validate, order, or no args for TUI.");
}

function printHelp() {
  console.log(`RepoChan CLI ${VERSION}

Usage:
  repochan                         Launch interactive TUI wizard
  repochan analyze                 Run Analyst (analysis phase)
  repochan persona                 Run Creative Writer (persona phase)
  repochan foundation              Run Art Director (foundation sheet)
  repochan paint [order-id]        Run Painter for an order
  repochan setup [--json]          Install bundled pi packages to ~/.repochan/pi/
  repochan init [--json]           Initialize .repochan protocol directories
  repochan status [--json]         Print protocol overview
  repochan inspect [--json]        Print raw protocol inspection summary
  repochan validate [--json]       Validate protocol artifacts
  repochan order list [--json]
  repochan order get <order-id> [--json]
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
  if (route.kind === "setup") return runSetup({ json: route.json });
  if (route.kind === "status") return runStatus(cwd, { json: route.json });
  if (route.kind === "inspect") return runInspect(cwd, { json: route.json });
  if (route.kind === "validate") return runValidate(cwd, { json: route.json });
  if (route.kind === "order") return runOrderCommand(cwd, route.args, { json: route.json });
  if (route.kind === "analyze") return launchDirectPage("analyze");
  if (route.kind === "persona") return launchDirectPage("persona");
  if (route.kind === "foundation") return launchDirectPage("foundation");
  if (route.kind === "paint") return launchDirectPage("paint", route.orderId);
}

export { ModelHost } from "./pages/model.js";
export { SettingsHost } from "./pages/settings.js";
export { WizardHost } from "./pages/wizard.js";
export { LanguageHost } from "./pages/language.js";
export { AnalysisPage } from "./pages/analysis.js";
export { PersonaPage } from "./pages/persona.js";
export { FoundationPage } from "./pages/foundation.js";
export { PaintPage } from "./pages/paint.js";
export { ConfirmList } from "./components/confirm-list.js";
export { checkPreconditions } from "./lib/precondition.js";
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

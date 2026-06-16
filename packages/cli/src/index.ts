#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runAssetCommand } from "./commands/asset.js";
import { runInspect } from "./commands/inspect.js";
import { runOrderCommand } from "./commands/order.js";
import { runValidate } from "./commands/validate.js";
import { runChat } from "./app/run-chat.js";
import { runInstallPiPackage } from "./app/install-pi-package.js";
import { createRepoChanRuntime } from "./app/pi-runtime.js";
import { loadRepoChanSettings } from "./app/settings.js";
import {
  buildWizardInitialMessage,
  chooseGenerateStep,
  formatWizardSummary,
  inspectWizardSnapshot,
} from "./app/wizard.js";
import { printError, UsageError } from "./ui/errors.js";
import { launchRepoChanTui } from "./tui/host.js";
import { launchPiSetupTui } from "./tui/pi-setup-host.js";

const VERSION = "0.1.0";

export type ParsedArgs = {
  positionals: string[];
  json: boolean;
  help: boolean;
  version: boolean;
  newSession: boolean;
};

export type CliRoute =
  | { kind: "version" }
  | { kind: "help" }
  | { kind: "wizard"; newSession: boolean }
  | { kind: "status"; json: boolean }
  | { kind: "app"; args: string[]; parsed: ParsedArgs }
  | { kind: "guided"; newSession: boolean }
  | { kind: "inspect"; json: boolean }
  | { kind: "validate"; json: boolean }
  | { kind: "order"; args: string[]; json: boolean }
  | { kind: "asset"; args: string[]; json: boolean }
  | { kind: "chat"; newSession: boolean }
  | { kind: "phase"; args: string[]; newSession: boolean }
  | { kind: "generate"; newSession: boolean }
  | { kind: "setup"; args: string[] }
  | { kind: "piSetup"; mode: "login" | "model" | "settings" }
  | { kind: "panel"; args: string[] };

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    positionals: [],
    json: false,
    help: false,
    version: false,
    newSession: false,
  };

  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--json") parsed.json = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--version" || arg === "-v") parsed.version = true;
    else if (arg === "--new") parsed.newSession = true;
    else parsed.positionals.push(arg);
  }

  return parsed;
}

function printHelp() {
  console.log(`RepoChan CLI ${VERSION}

Usage:
  repochan
  repochan analyze [--new]
  repochan persona [--new]
  repochan generate [--new]
  repochan browse
  repochan status [--json]
  repochan guided [--new]
  repochan guide [--new]
  repochan chat [--new]
  repochan phase analysis [--new]
  repochan phase persona [--new]
  repochan phase orders --goal <goal> [--new]
  repochan phase painter --order <order-id> [--new]
  repochan inspect [--json]
  repochan validate [--json]
  repochan setup [--local]
  repochan app [overview|inspect|validate|orders|assets|install|settings]
  repochan settings | login | model | panel
  repochan order list [--json]
  repochan order get <order-id> [--json]
  repochan asset list [--json]
  repochan asset get <asset-id> [--json]

Common commands print normal CLI output by default; add --json for machine-readable output.
No-argument repochan starts the RepoChan first-run wizard in an interactive terminal.
Use app/tui/panel/guided/chat/phase when you want a specific RepoChan app view or agent session.
Use login/model/settings for standalone Pi auth and model setup.
Validate is read-only. Setup asks for confirmation before installing RepoChan resources into the normal Pi user environment.
Phase starts a constrained single-phase agent session; run is kept as a compatibility alias:
  repochan phase analysis
  repochan phase orders --goal "README hero and icon set"
  repochan phase painter --order ord-hero-001 --new

Future:
  richer order/asset repair helpers and non-interactive CI validation policies`);
}

async function launchAppCommand(cwd: string, args: string[], parsed: ParsedArgs) {
  const [screen = "overview", ...rest] = args;

  if (screen === "overview" || screen === "home") {
    await launchRepoChanTui({ cwd, command: { kind: "overview" } });
    return;
  }

  if (screen === "guided" || screen === "guide") {
    await launchRepoChanTui({ cwd, command: { kind: "guided", newSession: parsed.newSession } });
    return;
  }

  if (screen === "inspect" || screen === "status") {
    await launchRepoChanTui({ cwd, command: { kind: "inspect" } });
    return;
  }

  if (screen === "validate") {
    await launchRepoChanTui({ cwd, command: { kind: "validate" } });
    return;
  }

  if (screen === "orders" || screen === "order") {
    await launchRepoChanTui({ cwd, command: { kind: "orders", args: rest } });
    return;
  }

  if (screen === "assets" || screen === "asset" || screen === "panel") {
    await launchRepoChanTui({ cwd, command: { kind: "assets", args: rest } });
    return;
  }

  if (screen === "install" || screen === "setup") {
    await launchRepoChanTui({ cwd, command: { kind: "install", args: rest } });
    return;
  }

  if (screen === "settings" || screen === "login" || screen === "model") {
    await launchRepoChanTui({ cwd, command: { kind: "settings" } });
    return;
  }

  throw new UsageError(
    `Unknown app screen: ${screen}.`,
    "Use: repochan app [overview|guided|inspect|validate|orders|assets|install|settings].",
  );
}

export function resolveCliRoute(argv: string[]): CliRoute {
  const parsed = parseArgs(argv);
  const [command, ...rest] = parsed.positionals;

  if (parsed.version) return { kind: "version" };
  if (parsed.help) return { kind: "help" };
  if (!command) return { kind: "wizard", newSession: parsed.newSession };
  if (command === "status") return { kind: "status", json: parsed.json };
  if (command === "app" || command === "tui" || command === "ui") return { kind: "app", args: rest, parsed };
  if (command === "browse") return { kind: "app", args: rest.length ? rest : ["overview"], parsed };
  if (command === "guided" || command === "guide") return { kind: "guided", newSession: parsed.newSession };
  if (command === "analyze") return { kind: "phase", args: ["analysis", ...rest], newSession: parsed.newSession };
  if (command === "persona") return { kind: "phase", args: ["persona", ...rest], newSession: parsed.newSession };
  if (command === "generate") return { kind: "generate", newSession: parsed.newSession };
  if (command === "inspect") return { kind: "inspect", json: parsed.json };
  if (command === "validate") return { kind: "validate", json: parsed.json };
  if (command === "order") return { kind: "order", args: rest, json: parsed.json };
  if (command === "asset") return { kind: "asset", args: rest, json: parsed.json };
  if (command === "chat") return { kind: "chat", newSession: parsed.newSession };
  if (command === "phase" || command === "run") return { kind: "phase", args: rest, newSession: parsed.newSession };
  if (command === "setup" || command === "install-pi-package") return { kind: "setup", args: rest };
  if (command === "login" || command === "model" || command === "settings") return { kind: "piSetup", mode: command };
  if (command === "panel") return { kind: "panel", args: rest };

  throw new UsageError(
    `Unknown command: ${command}.`,
    "Try one of: status, app, guided, chat, phase, inspect, validate, order, asset, setup.",
  );
}

async function maybeRunPiSetupPreflight(cwd: string) {
  const result = await createRepoChanRuntime({ cwd, initialSession: "memory", appendConductorPrompt: false });
  try {
    if (result.diagnostics.availableModelCount > 0) return;
  } finally {
    await result.runtime.dispose();
  }
  console.error("RepoChan needs a configured Pi model for the guided wizard.");
  console.error("Opening Pi-native login, then model selection. You can quit either screen and run `repochan login` or `repochan model` later.");
  await launchPiSetupTui({ cwd, mode: "login" });
  await launchPiSetupTui({ cwd, mode: "model" });
}

async function runWizard(cwd: string, newSession: boolean) {
  const settings = await loadRepoChanSettings();
  const snapshot = await inspectWizardSnapshot(cwd);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(formatWizardSummary(snapshot, settings));
    return;
  }

  await maybeRunPiSetupPreflight(cwd);
  await launchRepoChanTui({
    cwd,
    command: {
      kind: "wizard",
      newSession: newSession || settings.sessionPolicy === "new",
      initialMessage: buildWizardInitialMessage(snapshot, settings),
    },
  });
}

async function runGenerate(cwd: string, newSession: boolean) {
  const settings = await loadRepoChanSettings();
  const snapshot = await inspectWizardSnapshot(cwd);
  const next = chooseGenerateStep(snapshot, settings);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(formatWizardSummary(snapshot, settings));
    return;
  }

  await maybeRunPiSetupPreflight(cwd);
  if (next.kind === "phase") {
    await launchRepoChanTui({ cwd, command: { kind: "run", args: next.args, newSession } });
  } else if (next.kind === "guided") {
    await launchRepoChanTui({ cwd, command: { kind: "wizard", newSession, initialMessage: next.initialMessage } });
  } else if (next.screen === "assets") {
    await launchRepoChanTui({ cwd, command: { kind: "assets", args: [] } });
  } else if (next.screen === "orders") {
    await launchRepoChanTui({ cwd, command: { kind: "orders", args: [] } });
  } else {
    await launchRepoChanTui({ cwd, command: { kind: "overview" } });
  }
}

async function main(argv: string[]) {
  const route = resolveCliRoute(argv);
  const cwd = process.cwd();

  if (route.kind === "version") {
    console.log(VERSION);
    return;
  }

  if (route.kind === "help") {
    printHelp();
    return;
  }

  if (route.kind === "wizard") {
    await runWizard(cwd, route.newSession);
    return;
  }

  if (route.kind === "status") {
    await runInspect(cwd, { json: route.json });
    return;
  }

  if (route.kind === "app") {
    await launchAppCommand(cwd, route.args, route.parsed);
    return;
  }

  if (route.kind === "guided") {
    await launchRepoChanTui({ cwd, command: { kind: "guided", newSession: route.newSession } });
    return;
  }

  if (route.kind === "inspect") {
    await runInspect(cwd, { json: route.json });
    return;
  }

  if (route.kind === "validate") {
    await runValidate(cwd, { json: route.json });
    return;
  }

  if (route.kind === "order") {
    await runOrderCommand(cwd, route.args, { json: route.json });
    return;
  }

  if (route.kind === "asset") {
    await runAssetCommand(cwd, route.args, { json: route.json });
    return;
  }

  if (route.kind === "chat") {
    await runChat({ cwd, newSession: route.newSession });
    return;
  }

  if (route.kind === "phase") {
    await launchRepoChanTui({ cwd, command: { kind: "run", args: route.args, newSession: route.newSession } });
    return;
  }

  if (route.kind === "generate") {
    await runGenerate(cwd, route.newSession);
    return;
  }

  if (route.kind === "setup") {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      await runInstallPiPackage(route.args, { cwd });
    } else {
      await launchRepoChanTui({ cwd, command: { kind: "install", args: route.args } });
    }
    return;
  }

  if (route.kind === "piSetup") {
    await launchPiSetupTui({ cwd, mode: route.mode });
    return;
  }

  if (route.kind === "panel") {
    await launchRepoChanTui({ cwd, command: { kind: "assets", args: route.args } });
    return;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    printError(error);
    process.exitCode = 1;
  });
}

#!/usr/bin/env node
import { runAssetCommand } from "./commands/asset.js";
import { runInspect } from "./commands/inspect.js";
import { runOrderCommand } from "./commands/order.js";
import { runValidate } from "./commands/validate.js";
import { runChat } from "./app/run-chat.js";
import { runInstallPiPackage } from "./app/install-pi-package.js";
import { printError, UsageError } from "./ui/errors.js";
import { launchRepoChanTui } from "./tui/host.js";

const VERSION = "0.1.0";

type ParsedArgs = {
  positionals: string[];
  json: boolean;
  help: boolean;
  version: boolean;
  newSession: boolean;
};

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
  repochan [--new]
  repochan guided [--new]
  repochan guide [--new]
  repochan chat [--new]
  repochan run analysis [--new]
  repochan run persona [--new]
  repochan run orders --goal <goal> [--new]
  repochan run painter --order <order-id> [--new]
  repochan inspect [--json]
  repochan validate [--json]
  repochan install-pi-package [--local]
  repochan settings | login | model | panel
  repochan order list [--json]
  repochan order get <order-id> [--json]
  repochan asset list [--json]
  repochan asset get <asset-id> [--json]

Default guided mode opens the custom RepoChan TUI host, continues the latest session by default, and uses --new to force a fresh guided session.
Only chat delegates to full Pi InteractiveMode. All other non-JSON commands stay inside the custom zread-like RepoChan UI.
Validate is a read-only deterministic protocol check; use --json for machine-readable output.
Install asks for confirmation in the custom UI before installing the repochan-pi package into the normal Pi user environment.
Run starts a constrained single-phase agent session in the custom status/result screen; examples:
  repochan run analysis
  repochan run orders --goal "README hero and icon set"
  repochan run painter --order ord-hero-001 --new

Future:
  richer order/asset repair helpers and non-interactive CI validation policies`);
}

async function main(argv: string[]) {
  const parsed = parseArgs(argv);
  const cwd = process.cwd();
  const [command, ...rest] = parsed.positionals;

  if (parsed.version) {
    console.log(VERSION);
    return;
  }

  if (parsed.help) {
    printHelp();
    return;
  }

  if (!command) {
    await launchRepoChanTui({ cwd, command: { kind: "overview" } });
    return;
  }

  if (command === "guided" || command === "guide") {
    await launchRepoChanTui({ cwd, command: { kind: "guided", newSession: parsed.newSession } });
    return;
  }

  if (command === "inspect") {
    if (parsed.json) await runInspect(cwd, { json: true });
    else await launchRepoChanTui({ cwd, command: { kind: "inspect" } });
    return;
  }

  if (command === "validate") {
    if (parsed.json) await runValidate(cwd, { json: true });
    else await launchRepoChanTui({ cwd, command: { kind: "validate" } });
    return;
  }

  if (command === "order") {
    if (parsed.json) await runOrderCommand(cwd, rest, { json: true });
    else await launchRepoChanTui({ cwd, command: { kind: "orders", args: rest } });
    return;
  }

  if (command === "asset") {
    if (parsed.json) await runAssetCommand(cwd, rest, { json: true });
    else await launchRepoChanTui({ cwd, command: { kind: "assets", args: rest } });
    return;
  }

  if (command === "chat") {
    await runChat({ cwd, newSession: parsed.newSession });
    return;
  }

  if (command === "run") {
    await launchRepoChanTui({ cwd, command: { kind: "run", args: rest, newSession: parsed.newSession } });
    return;
  }

  if (command === "install-pi-package") {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      await runInstallPiPackage(rest, { cwd });
    } else {
      await launchRepoChanTui({ cwd, command: { kind: "install", args: rest } });
    }
    return;
  }

  if (command === "settings" || command === "login" || command === "model") {
    await launchRepoChanTui({ cwd, command: { kind: "settings" } });
    return;
  }

  if (command === "panel") {
    await launchRepoChanTui({ cwd, command: { kind: "assets", args: rest } });
    return;
  }

  throw new UsageError(
    `Unknown command: ${command}.`,
    "Try one of: guided, chat, run, inspect, validate, order, asset, install-pi-package.",
  );
}

main(process.argv.slice(2)).catch((error: unknown) => {
  printError(error);
  process.exitCode = 1;
});

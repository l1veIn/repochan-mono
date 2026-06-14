import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import type { Readable, Writable } from "node:stream";

import { DefaultPackageManager, getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";
import pc from "picocolors";
import { UsageError } from "../ui/errors.js";

export type InstallPiPackageArgs = {
  useLocalWorkspace: boolean;
};

export type InstallPiPackageOptions = {
  cwd?: string;
  agentDir?: string;
  input?: Readable;
  output?: Writable;
};

export type InstallPiPackagePlan = {
  source: string;
  sourceLabel: string;
  settingsScope: "user";
  localWorkspacePath?: string;
  detectedWorkspacePath?: string;
};

function readPackageName(packageDir: string) {
  try {
    const packageJson = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8")) as { name?: unknown };
    return typeof packageJson.name === "string" ? packageJson.name : undefined;
  } catch {
    return undefined;
  }
}

export function findWorkspaceRepoChanPiPackage() {
  const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const candidate = path.resolve(cliRoot, "..", "pi");
  return readPackageName(candidate) === "repochan-pi" ? candidate : undefined;
}

export function parseInstallPiPackageArgs(args: string[]): InstallPiPackageArgs {
  let useLocalWorkspace = false;

  for (const arg of args) {
    if (arg === "--local") {
      useLocalWorkspace = true;
      continue;
    }
    throw new UsageError(
      `Unknown install-pi-package option: ${arg}.`,
      "Use: repochan install-pi-package [--local]",
    );
  }

  return { useLocalWorkspace };
}

export function buildInstallPiPackagePlan(args: InstallPiPackageArgs): InstallPiPackagePlan {
  const detectedWorkspacePath = findWorkspaceRepoChanPiPackage();

  if (args.useLocalWorkspace) {
    if (!detectedWorkspacePath || !existsSync(detectedWorkspacePath)) {
      throw new UsageError(
        "--local was requested, but the workspace package repochan-pi was not found next to packages/cli.",
        "Run this from a RepoChan monorepo checkout or omit --local to install from npm.",
      );
    }

    return {
      source: detectedWorkspacePath,
      sourceLabel: `local workspace repochan-pi at ${detectedWorkspacePath}`,
      settingsScope: "user",
      localWorkspacePath: detectedWorkspacePath,
      detectedWorkspacePath,
    };
  }

  return {
    source: "npm:repochan-pi",
    sourceLabel: "repochan-pi from npm",
    settingsScope: "user",
    detectedWorkspacePath,
  };
}

async function confirm(question: string, input: Readable, output: Writable) {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

export async function runInstallPiPackage(args: string[], options: InstallPiPackageOptions = {}) {
  const parsed = parseInstallPiPackageArgs(args);
  const plan = buildInstallPiPackagePlan(parsed);
  const cwd = options.cwd ?? process.cwd();
  const agentDir = options.agentDir ?? getAgentDir();
  const input = options.input ?? defaultInput;
  const output = options.output ?? defaultOutput;

  console.log(pc.bold("Install RepoChan Pi package"));
  console.log(
    "This will install the 'repochan-pi' package, which provides the RepoChan Pi extension and skills, into your normal Pi user environment so plain `pi` can use them.",
  );
  console.log(`Source: ${plan.sourceLabel}`);
  console.log(`Pi agent dir: ${agentDir}`);
  console.log("Settings change after confirmation: install the package source and add it to Pi user settings.");
  if (plan.detectedWorkspacePath && !parsed.useLocalWorkspace) {
    console.log(pc.dim(`Local development package detected at ${plan.detectedWorkspacePath}; pass --local to install that checkout instead of npm.`));
  }
  console.log(pc.dim("No install or settings change will happen unless you answer yes."));

  const approved = await confirm("Proceed with installation? (y/N) ", input, output);
  if (!approved) {
    console.log("Installation cancelled. No Pi settings were changed.");
    return { installed: false, source: plan.source };
  }

  const settingsManager = SettingsManager.create(cwd, agentDir);
  const packageManager = new DefaultPackageManager({ cwd, agentDir, settingsManager });
  packageManager.setProgressCallback((event) => {
    if (event.type === "start" && event.message) console.log(pc.dim(event.message));
    if (event.type === "error" && event.message) console.error(pc.red(event.message));
  });

  try {
    await packageManager.install(plan.source);
    packageManager.addSourceToSettings(plan.source);
    await settingsManager.flush();
    console.log(pc.green(`Installed and persisted ${plan.sourceLabel}.`));
    console.log("RepoChan resources should now be discoverable by plain `pi`.");
    return { installed: true, source: plan.source };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UsageError(
      `Failed to install repochan-pi from ${plan.sourceLabel}: ${message}`,
      "Check your network, permissions, or try `pi install repochan-pi` directly.",
    );
  }
}

import { checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import {
  ALL_TARGETS,
  detectAll,
  getTarget,
  listTargetIds,
  pickPrimaryAgent,
  resolveAgentFlag,
} from "./agents/registry.js";
import {
  installTarget,
  resolveSkillSourceDir,
  uninstallTarget,
  fileExists,
} from "./agents/shared.js";
import type { AgentId, AgentTarget, InstallResult } from "./agents/types.js";
import { emitResult, type OutputOptions, UsageError, dim, heading, bullet } from "../../lib/output.js";
import { maybeConfigureImageDuringSetup } from "../image-configure.js";

export type SetupOptions = OutputOptions & {
  /** Comma-separated agent ids, or `auto` / `all`. Alias of historical --agent. */
  agent?: string;
  list?: boolean;
  remove?: boolean;
  /**
   * Non-interactive defaults:
   *   install → one primary detected agent
   *   remove  → all currently configured agents
   */
  yes?: boolean;
};

/**
 * `repochan setup`
 *
 * Interactive (default): detect installed agents → multiselect → install skills.
 * If image generation is not configured, offers OpenAI / custom / skip.
 *
 * Does **not** run `repochan init` — protocol init is left to the agent (or an
 * explicit `repochan init`). Flags: --agent / --yes / --list / --remove
 */
export async function runSetup(cwd: string, options: SetupOptions = {}) {
  if (options.list) return runList(cwd, options);

  const skillSrc = await resolveSkillSourceDir();
  if (!(await fileExists(skillSrc))) {
    throw new UsageError(
      `Bundled skills not found at ${skillSrc}.`,
      "Ensure @repochan/skill is installed with the CLI package.",
    );
  }

  const detected = await detectAll(cwd);
  const detectedIds = detected.filter((d) => d.detection.installed).map((d) => d.target.id);
  const configuredIds = detected.filter((d) => d.detection.alreadyConfigured).map((d) => d.target.id);

  if (options.remove) {
    const targets = await resolveTargetsForRemove(options, configuredIds, detected);
    if (targets.length === 0) {
      return void emitResult(options, "No agents selected to remove.", { removed: [] });
    }
    const results: InstallResult[] = [];
    for (const t of targets) {
      results.push(await uninstallTarget(cwd, t));
    }
    return reportResults(options, "remove", results);
  }

  // Install path (agent skills only — no init)
  const targets = await resolveTargetsForInstall(options, detectedIds, detected);
  if (targets.length === 0) {
    return void emitResult(options, "No agents selected — nothing to do.", { installed: [] });
  }

  const results: InstallResult[] = [];
  for (const t of targets) {
    results.push(await installTarget(cwd, t, skillSrc));
  }
  reportResults(options, "install", results);

  // Image key: only when missing; skip is a first-class option.
  await maybeConfigureImageDuringSetup(cwd, { yes: options.yes, json: options.json });
}

// ---------------------------------------------------------------------------
// --list
// ---------------------------------------------------------------------------

async function runList(cwd: string, options: OutputOptions) {
  const rows = await detectAll(cwd);
  const payload = rows.map(({ target, detection }) => ({
    id: target.id,
    name: target.displayName,
    installed: detection.installed,
    configured: detection.alreadyConfigured,
    skillDir: target.skillDir,
    instructionFile: target.instructionFile,
  }));

  if (options.json) {
    return void emitResult(options, "", { agents: payload });
  }

  heading("RepoChan setup — agents");
  for (const row of payload) {
    const inst = row.installed ? chalk.green("detected") : dim("not found");
    const conf = row.configured ? chalk.cyan("configured") : dim("—");
    console.log(`  ${chalk.bold(row.id.padEnd(12))} ${row.name}`);
    console.log(`    ${inst}  ${conf}`);
    console.log(dim(`    skills → ${row.skillDir ?? ".repochan/skills (fallback)"}`));
    console.log(dim(`    instr  → ${row.instructionFile}`));
  }
  console.log();
  console.log(dim("Run `repochan setup` (picks one by default), or `repochan setup --agent all`."));
}

// ---------------------------------------------------------------------------
// target resolution
// ---------------------------------------------------------------------------

async function resolveTargetsForInstall(
  options: SetupOptions,
  detectedIds: AgentId[],
  detected: Awaited<ReturnType<typeof detectAll>>,
): Promise<AgentTarget[]> {
  if (options.agent) {
    try {
      return resolveAgentFlag(options.agent, detectedIds);
    } catch (e) {
      throw new UsageError(e instanceof Error ? e.message : String(e));
    }
  }
  if (options.yes) {
    return resolveAgentFlag("auto", detectedIds);
  }

  // Interactive multiselect — default-check ONE primary agent only.
  // Users rarely wire every agent into one project; they can still multi-select.
  if (!process.stdin.isTTY) {
    throw new UsageError(
      "No --agent / --yes and stdin is not a TTY.",
      `Usage: repochan setup --yes\n       repochan setup --agent <${listTargetIds().join("|")}|auto|all>`,
    );
  }

  const primary = pickPrimaryAgent(detectedIds);
  const choices = detected.map(({ target, detection }) => {
    const flag = detection.installed ? "(detected)" : "(not found)";
    const conf = detection.alreadyConfigured ? " — already configured" : "";
    const pref = target.id === primary.id ? " ★ default" : "";
    return {
      name: `${target.displayName} ${flag}${conf}${pref}`,
      value: target.id,
      checked: target.id === primary.id,
    };
  });

  const selected = await checkbox<AgentId>({
    message: "Which agent(s) should RepoChan configure? (usually just one)",
    choices,
    required: false,
  });

  return selected.map((id) => getTarget(id)!).filter(Boolean);
}

async function resolveTargetsForRemove(
  options: SetupOptions,
  configuredIds: AgentId[],
  detected: Awaited<ReturnType<typeof detectAll>>,
): Promise<AgentTarget[]> {
  if (options.agent) {
    try {
      return resolveAgentFlag(options.agent, configuredIds);
    } catch (e) {
      throw new UsageError(e instanceof Error ? e.message : String(e));
    }
  }
  if (options.yes) {
    // Remove everything currently configured in this project.
    return ALL_TARGETS.filter((t) => configuredIds.includes(t.id));
  }

  if (!process.stdin.isTTY) {
    throw new UsageError(
      "No --agent / --yes for remove and stdin is not a TTY.",
      "Usage: repochan setup --remove --yes\n       repochan setup --remove --agent <id>",
    );
  }

  if (configuredIds.length === 0) {
    return [];
  }

  const choices = detected
    .filter((d) => d.detection.alreadyConfigured)
    .map(({ target }) => ({
      name: `${target.displayName} (configured)`,
      value: target.id,
      checked: true,
    }));

  const selected = await checkbox<AgentId>({
    message: "Remove RepoChan setup for which agents?",
    choices,
    required: false,
  });

  return selected.map((id) => getTarget(id)!).filter(Boolean);
}

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

function reportResults(
  options: SetupOptions,
  mode: "install" | "remove",
  results: InstallResult[],
) {
  if (options.json) {
    return void emitResult(options, "", { mode, results });
  }

  heading(mode === "install" ? "RepoChan setup" : "RepoChan setup — remove");
  for (const r of results) {
    if (mode === "install") {
      bullet(r.displayName, `${r.instructionAction} · skills → ${r.skillDir} (${r.skillFiles} files)`);
      console.log(dim(`    ${r.instructionFile}`));
    } else {
      bullet(r.displayName, r.instructionAction);
    }
    for (const n of r.notes ?? []) console.log(dim(`    ${n}`));
  }

  if (mode === "install") {
    const names = results.map((r) => r.displayName).join(", ");
    console.log();
    console.log(`Next: open ${names} and say "generate all assets and deploy".`);
    console.log(dim("The agent will run `repochan init` if .repochan/ is missing."));
  } else {
    const removed = results.filter((r) => r.instructionAction === "removed");
    console.log();
    console.log(
      removed.length
        ? `Removed setup for ${removed.map((r) => r.displayName).join(", ")}.`
        : "Nothing was configured — no changes.",
    );
  }
}

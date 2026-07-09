import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentId, AgentTarget, DetectionResult } from "./types.js";
import { isConfigured } from "./shared.js";

function home(...parts: string[]): string {
  return path.join(os.homedir(), ...parts);
}

function exists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function xdgConfig(...parts: string[]): string {
  const base =
    process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.trim()
      ? process.env.XDG_CONFIG_HOME
      : path.join(os.homedir(), ".config");
  return path.join(base, ...parts);
}

function hermesHome(): string {
  return process.env.HERMES_HOME
    ? path.resolve(process.env.HERMES_HOME)
    : home(".hermes");
}

/**
 * Full agent registry.
 * Order = multiselect display + primary pick priority (first detected wins).
 * Prefer: Codex → Claude Code → Hermes → others.
 * Detect probes mirror CodeGraph's home-dir heuristics (+ Pi).
 */
export const ALL_TARGETS: readonly AgentTarget[] = Object.freeze([
  {
    id: "codex",
    displayName: "Codex CLI",
    skillDir: ".codex/skills",
    instructionFile: "AGENTS.md",
    instructionMode: "marker",
    detectInstalled: () => exists(home(".codex")),
  },
  {
    id: "claude",
    displayName: "Claude Code",
    skillDir: ".claude/skills",
    instructionFile: "CLAUDE.md",
    instructionMode: "marker",
    detectInstalled: () => exists(home(".claude")) || exists(home(".claude.json")),
  },
  {
    id: "hermes",
    displayName: "Hermes Agent",
    skillDir: null,
    instructionFile: "AGENTS.md",
    instructionMode: "marker",
    detectInstalled: () => exists(hermesHome()),
  },
  {
    id: "cursor",
    displayName: "Cursor",
    skillDir: ".cursor/skills",
    instructionFile: ".cursor/rules/repochan.mdc",
    instructionMode: "owned-file",
    detectInstalled: () => exists(home(".cursor")),
    // Pre-rewrite installs put a marker in .cursorrules
    legacyCleanupPaths: (cwd) => [path.join(cwd, ".cursorrules")],
  },
  {
    id: "pi",
    displayName: "Pi",
    skillDir: "skills",
    instructionFile: "AGENTS.md",
    instructionMode: "marker",
    detectInstalled: () => exists(home(".pi")) || exists(path.join(process.cwd(), ".pi")),
  },
  {
    id: "opencode",
    displayName: "opencode",
    skillDir: null, // no native skills dir → .repochan/skills
    instructionFile: "AGENTS.md",
    instructionMode: "marker",
    detectInstalled: () =>
      exists(xdgConfig("opencode")) ||
      exists(path.join(process.cwd(), "opencode.jsonc")) ||
      exists(path.join(process.cwd(), "opencode.json")),
  },
  {
    id: "gemini",
    displayName: "Gemini CLI",
    skillDir: null,
    instructionFile: "GEMINI.md",
    instructionMode: "marker",
    detectInstalled: () => exists(home(".gemini")),
  },
  {
    id: "kiro",
    displayName: "Kiro",
    skillDir: null,
    instructionFile: ".kiro/steering/repochan.md",
    instructionMode: "owned-file",
    detectInstalled: () => exists(home(".kiro")),
  },
  {
    id: "antigravity",
    displayName: "Antigravity IDE",
    skillDir: null,
    // Shares project GEMINI.md with Gemini CLI — marker upsert is idempotent.
    instructionFile: "GEMINI.md",
    instructionMode: "marker",
    detectInstalled: () =>
      exists(home(".gemini", "antigravity")) ||
      exists(home(".gemini", "config")) ||
      exists(home(".gemini", "config", "mcp_config.json")),
  },
]);

export function getTarget(id: string): AgentTarget | undefined {
  return ALL_TARGETS.find((t) => t.id === id);
}

export function listTargetIds(): AgentId[] {
  return ALL_TARGETS.map((t) => t.id);
}

export async function detectAll(cwd: string): Promise<
  Array<{ target: AgentTarget; detection: DetectionResult }>
> {
  return Promise.all(
    ALL_TARGETS.map(async (target) => ({
      target,
      detection: {
        installed: target.detectInstalled(),
        alreadyConfigured: await isConfigured(cwd, target),
      },
    })),
  );
}

/**
 * Pick a single default agent.
 *
 * Most people only use one coding agent; pre-checking every detected home-dir
 * floods the project with skill copies. Registry order is the priority
 * (Codex → Claude → Hermes → …): first detected match wins, else Codex.
 */
export function pickPrimaryAgent(detectedIds: AgentId[]): AgentTarget {
  for (const t of ALL_TARGETS) {
    if (detectedIds.includes(t.id)) return t;
  }
  return getTarget("codex") ?? ALL_TARGETS[0];
}

/**
 * Resolve `--agent` flag:
 *   auto | all | csv ids
 *
 * `auto` = one primary detected agent (not every detected agent).
 * `all`  = every known agent (power-user / CI explicit opt-in).
 */
export function resolveAgentFlag(value: string, detectedIds: AgentId[]): AgentTarget[] {
  const v = value.trim().toLowerCase();
  if (v === "all") return [...ALL_TARGETS];
  if (v === "auto") return [pickPrimaryAgent(detectedIds)];

  const ids = v.split(",").map((s) => s.trim()).filter(Boolean);
  const resolved: AgentTarget[] = [];
  const unknown: string[] = [];
  for (const id of ids) {
    const t = getTarget(id);
    if (t) resolved.push(t);
    else unknown.push(id);
  }
  if (unknown.length > 0) {
    throw new Error(
      `Unknown agent id(s): ${unknown.join(", ")}. Known: ${listTargetIds().join(", ")}, plus 'auto' / 'all'.`,
    );
  }
  return resolved;
}

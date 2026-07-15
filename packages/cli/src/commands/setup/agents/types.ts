/**
 * Agent target abstraction for `repochan setup`.
 *
 * RepoChan does not write MCP configs — it copies bundled skills into each
 * agent's convention directory (when one exists) and injects a short
 * reference block into the agent's instructions file. Detection is a
 * best-effort home-dir probe (same idea as CodeGraph's installer).
 */

export type AgentId =
  | "claude"
  | "codex"
  | "cursor"
  | "pi"
  | "opencode"
  | "gemini"
  | "kiro"
  | "hermes"
  | "antigravity";

/** How instructions are written on disk. */
export type InstructionMode =
  /** Marker-fenced section inside a shared file (CLAUDE.md / AGENTS.md / …). */
  | "marker"
  /** We own the whole file (Cursor rules, Kiro steering). */
  | "owned-file";

export interface DetectionResult {
  /** Agent config dir / app appears present on this machine. */
  installed: boolean;
  /** RepoChan already configured for this project. */
  alreadyConfigured: boolean;
}

export interface InstallResult {
  agent: AgentId;
  displayName: string;
  skillDir: string;
  skillFiles: number;
  instructionFile: string;
  instructionAction: "created" | "updated" | "unchanged" | "removed" | "not-found";
  notes?: string[];
}

export interface AgentTarget {
  readonly id: AgentId;
  readonly displayName: string;
  /** Project-relative skill destination. */
  readonly skillDir: string;
  /**
   * Home-relative skill destination for global install. Defaults to `skillDir`
   * when omitted. Only set when the global path differs from the project path
   * (e.g. Pi: project `.pi/skills` vs global `~/.pi/agent/skills`).
   */
  readonly globalSkillDir?: string;
  /** Project-relative instructions path. */
  readonly instructionFile: string;
  readonly instructionMode: InstructionMode;
  /** Absolute paths that signal "this agent is installed" when any exist. */
  detectInstalled(): boolean;
}

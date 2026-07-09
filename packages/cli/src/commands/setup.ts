import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { emitResult, type OutputOptions, UsageError } from "../lib/output.js";

// ---------------------------------------------------------------------------
// repochan setup --agent <codex|claude|pi>
//
// ADR §15: install the bundled skills (from @repochan/skill) into each agent's
// convention location, and inject a reference block into the top-level
// instruction file (AGENTS.md / CLAUDE.md). Idempotent: re-running detects an
// existing reference block and skips/updates instead of duplicating.
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);

type AgentId = "codex" | "claude" | "pi" | "cursor";

const AGENTS: Record<AgentId, { skillDir: string; instructionFile: string; label: string }> = {
  codex: { skillDir: ".codex/skills", instructionFile: "AGENTS.md", label: "Codex" },
  claude: { skillDir: ".claude/skills", instructionFile: "CLAUDE.md", label: "Claude Code" },
  pi: { skillDir: "skills", instructionFile: "AGENTS.md", label: "Pi" },
  cursor: { skillDir: ".cursor/skills", instructionFile: ".cursorrules", label: "Cursor" },
};

// The reference block injected into the instruction file. Marked with stable
// anchors so re-runs can detect and replace it idempotently.
const BEGIN = "<!-- repochan:setup begin -->";
const END = "<!-- repochan:setup end -->";

function referenceBlock(agent: AgentId): string {
  const skillPath = AGENTS[agent].skillDir;
  return [
    BEGIN,
    "",
    "## RepoChan",
    "",
    "This project uses the RepoChan creative pipeline. Artifacts live in `.repochan/`.",
    "Before starting, read the bundled skills:",
    "",
    `- [RepoChan wizard](${skillPath}/repochan/SKILL.md) — default one-shot full pipeline with checkpoints`,
    `- [Team skills](${skillPath}/) — analysis, persona, painter, ... (advanced, per-step)`,
    "",
    "Want the full thing? Just say: \"generate all assets and deploy\".",
    "",
    END,
  ].join("\n");
}

/** Locate the bundled skills directory inside the @repochan/skill package. */
function resolveSkillSourceDir(): string {
  const pkgJsonPath = require.resolve("@repochan/skill/package.json");
  const pkgDir = path.dirname(pkgJsonPath);
  const skillsDir = path.join(pkgDir, "skills");
  return skillsDir;
}

async function copyDir(src: string, dest: string): Promise<number> {
  let count = 0;
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) { count += await copyDir(s, d); }
    else { await fs.copyFile(s, d); count++; }
  }
  return count;
}

async function injectReference(cwd: string, instructionFile: string, block: string): Promise<"created" | "updated" | "unchanged"> {
  const file = path.join(cwd, instructionFile);
  let content = "";
  if (await fileExists(file)) content = await fs.readFile(file, "utf8");
  const regex = new RegExp(`${escapeRegex(BEGIN)}[\\s\\S]*?${escapeRegex(END)}`, "g");
  const existing = regex.exec(content);
  if (existing) {
    if (existing[0] === block) return "unchanged";
    content = content.replace(regex, block);
    await fs.writeFile(file, content, "utf8");
    return "updated";
  }
  // Append (with a separating newline if the file has content).
  const sep = content && !content.endsWith("\n") ? "\n\n" : content ? "\n" : "";
  await fs.writeFile(file, content + sep + block + "\n", "utf8");
  return "created";
}

async function removeReference(cwd: string, instructionFile: string): Promise<boolean> {
  const file = path.join(cwd, instructionFile);
  if (!(await fileExists(file))) return false;
  const content = await fs.readFile(file, "utf8");
  const regex = new RegExp(`${escapeRegex(BEGIN)}[\\s\\S]*?${escapeRegex(END)}\\n?`, "g");
  if (!regex.test(content)) return false;
  await fs.writeFile(file, content.replace(regex, ""), "utf8");
  return true;
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function runSetup(cwd: string, options: OutputOptions & { agent?: string; list?: boolean; remove?: boolean }) {
  // --list: show which agents are configured (reference block present)
  if (options.list) {
    const configured: string[] = [];
    for (const [id, cfg] of Object.entries(AGENTS)) {
      const file = path.join(cwd, cfg.instructionFile);
      if (await fileExists(file)) {
        const content = await fs.readFile(file, "utf8");
        if (content.includes(BEGIN)) configured.push(id);
      }
    }
    return void emitResult(options, `Configured agents: ${configured.length ? configured.join(", ") : "(none)"}`, { configured });
  }

  const agent = options.agent as AgentId | undefined;
  if (!agent || !(agent in AGENTS)) {
    throw new UsageError("Missing or unknown --agent.", "Usage: repochan setup --agent <codex|claude|pi|cursor>");
  }
  const cfg = AGENTS[agent];

  if (options.remove) {
    const removed = await removeReference(cwd, cfg.instructionFile);
    const skillDest = path.join(cwd, cfg.skillDir);
    if (await fileExists(skillDest)) await fs.rm(skillDest, { recursive: true, force: true }).catch(() => {});
    return void emitResult(options, removed ? `Removed RepoChan setup for ${cfg.label}.` : `No RepoChan setup found for ${cfg.label}.`, { agent, removed });
  }

  // 1. Copy bundled skills into the agent's convention dir.
  const skillSrc = resolveSkillSourceDir();
  if (!(await fileExists(skillSrc))) throw new UsageError(`Bundled skills not found at ${skillSrc}. Ensure @repochan/skill is installed.`);
  const skillDest = path.join(cwd, cfg.skillDir);
  const fileCount = await copyDir(skillSrc, skillDest);

  // 2. Inject the reference block (idempotent).
  const action = await injectReference(cwd, cfg.instructionFile, referenceBlock(agent));

  const human =
    `Set up RepoChan for ${cfg.label}.\n` +
    `  skills → ${cfg.skillDir} (${fileCount} files)\n` +
    `  reference → ${cfg.instructionFile} (${action})\n` +
    `\nNext: open ${cfg.label} and say "generate all assets and deploy".`;
  emitResult(options, human, { agent, skillDir: cfg.skillDir, instructionFile: cfg.instructionFile, files: fileCount, referenceAction: action });
}

import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { AgentId, AgentTarget, InstallResult } from "./types.js";

const require = createRequire(import.meta.url);

/**
 * Marker anchors — per-agent so multiple agents can share one instruction
 * file (e.g. AGENTS.md for codex + pi + opencode) without clobbering each
 * other. Legacy unscoped markers (`repochan:setup begin`) are still stripped
 * on cleanup for upgrades from the pre-multi-agent setup.
 */
export function markers(agentId: AgentId): { begin: string; end: string } {
  return {
    begin: `<!-- repochan:setup:${agentId} begin -->`,
    end: `<!-- repochan:setup:${agentId} end -->`,
  };
}

/** Pre-rewrite unscoped markers (single-agent setup). */
export const LEGACY_BEGIN = "<!-- repochan:setup begin -->";
export const LEGACY_END = "<!-- repochan:setup end -->";

/** Fallback skill dir for agents without a native skills convention. */
export const FALLBACK_SKILL_DIR = ".repochan/skills";

export function skillDestFor(target: AgentTarget): string {
  return target.skillDir ?? FALLBACK_SKILL_DIR;
}

/** Markdown body (with per-agent markers) injected into instruction files. */
export function referenceBlock(agentId: AgentId, skillPath: string): string {
  const { begin, end } = markers(agentId);
  return [
    begin,
    "",
    `## RepoChan (${agentId})`,
    "",
    "This project uses the RepoChan creative pipeline. Artifacts live in `.repochan/`.",
    "Before starting, read the bundled skills:",
    "",
    `- [RepoChan wizard](${skillPath}/repochan/SKILL.md) — default one-shot full pipeline with checkpoints`,
    `- [Team skills](${skillPath}/) — analysis, persona, painter, ... (advanced, per-step)`,
    "",
    "Want the full thing? Just say: \"generate all assets and deploy\".",
    "",
    end,
  ].join("\n");
}

/** Cursor `.mdc` rules wrap the same body with alwaysApply frontmatter. */
export function cursorRulesFile(agentId: AgentId, skillPath: string): string {
  return [
    "---",
    "description: RepoChan creative pipeline — mascot, assets, landing page",
    "alwaysApply: true",
    "---",
    "",
    referenceBlock(agentId, skillPath),
    "",
  ].join("\n");
}

/** Kiro steering owns the whole file (no shared sections). */
export function kiroSteeringFile(agentId: AgentId, skillPath: string): string {
  return referenceBlock(agentId, skillPath) + "\n";
}
export async function resolveSkillSourceDir(): Promise<string> {
  const pkgJsonPath = require.resolve("@repochan/skill/package.json");
  return path.join(path.dirname(pkgJsonPath), "skills");
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function pathExistsAny(paths: string[]): Promise<boolean> {
  for (const p of paths) {
    if (await fileExists(p)) return true;
  }
  return false;
}

export async function copyDir(src: string, dest: string): Promise<number> {
  let count = 0;
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) count += await copyDir(s, d);
    else {
      await fs.copyFile(s, d);
      count++;
    }
  }
  return count;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function hasRepoChanMarker(filePath: string, agentId?: AgentId): Promise<boolean> {
  if (!(await fileExists(filePath))) return false;
  const content = await fs.readFile(filePath, "utf8");
  if (agentId) {
    const { begin } = markers(agentId);
    if (content.includes(begin)) return true;
  }
  // Any repochan setup marker (scoped or legacy) counts as "something configured".
  return content.includes("repochan:setup");
}

/**
 * Upsert a per-agent marker-delimited section.
 */
export async function injectMarkerSection(
  filePath: string,
  agentId: AgentId,
  block: string,
): Promise<"created" | "updated" | "unchanged"> {
  let content = "";
  const existed = await fileExists(filePath);
  if (existed) content = await fs.readFile(filePath, "utf8");

  const { begin, end } = markers(agentId);
  const regex = new RegExp(`${escapeRegex(begin)}[\\s\\S]*?${escapeRegex(end)}`, "g");
  const match = regex.exec(content);
  if (match) {
    if (match[0] === block) return "unchanged";
    content = content.replace(regex, block);
    await atomicWrite(filePath, content.endsWith("\n") ? content : content + "\n");
    return "updated";
  }

  // Upgrade path: drop legacy unscoped block once when writing scoped ones.
  content = stripLegacyMarkers(content);

  if (!existed || content.trim() === "") {
    await atomicWrite(filePath, block + "\n");
    return "created";
  }
  const sep = content && !content.endsWith("\n") ? "\n\n" : content ? "\n" : "";
  await atomicWrite(filePath, content + sep + block + "\n");
  return "created";
}

export async function removeMarkerSection(filePath: string, agentId?: AgentId): Promise<boolean> {
  if (!(await fileExists(filePath))) return false;
  let content = await fs.readFile(filePath, "utf8");
  let changed = false;

  if (agentId) {
    const { begin, end } = markers(agentId);
    const regex = new RegExp(`${escapeRegex(begin)}[\\s\\S]*?${escapeRegex(end)}\\n?`, "g");
    if (regex.test(content)) {
      content = content.replace(regex, "");
      changed = true;
    }
  } else {
    // Remove all scoped + legacy blocks.
    const before = content;
    content = content.replace(
      /<!-- repochan:setup:[a-z]+ begin -->[\s\S]*?<!-- repochan:setup:[a-z]+ end -->\n?/g,
      "",
    );
    content = stripLegacyMarkers(content);
    if (content !== before) changed = true;
  }

  // Also strip legacy when removing a specific agent (upgrade hygiene).
  const beforeLegacy = content;
  content = stripLegacyMarkers(content);
  if (content !== beforeLegacy) changed = true;

  if (!changed) return false;
  if (content.trim() === "") {
    await fs.unlink(filePath).catch(() => {});
  } else {
    await atomicWrite(filePath, content);
  }
  return true;
}

function stripLegacyMarkers(content: string): string {
  const legacy = new RegExp(
    `${escapeRegex(LEGACY_BEGIN)}[\\s\\S]*?${escapeRegex(LEGACY_END)}\\n?`,
    "g",
  );
  return content.replace(legacy, "");
}

/** Write an owned file (Cursor rules / Kiro steering); byte-equal → unchanged. */
export async function writeOwnedFile(
  filePath: string,
  body: string,
): Promise<"created" | "updated" | "unchanged"> {
  if (await fileExists(filePath)) {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing === body || existing === body + "\n") return "unchanged";
    await atomicWrite(filePath, body.endsWith("\n") ? body : body + "\n");
    return "updated";
  }
  await atomicWrite(filePath, body.endsWith("\n") ? body : body + "\n");
  return "created";
}

export async function removeOwnedFile(filePath: string): Promise<boolean> {
  if (!(await fileExists(filePath))) return false;
  // Only delete if it looks like ours (contains marker) — don't clobber user files.
  const content = await fs.readFile(filePath, "utf8");
  if (!content.includes("repochan:setup")) return false;
  await fs.unlink(filePath);
  return true;
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, filePath);
}

export async function isConfigured(cwd: string, target: AgentTarget): Promise<boolean> {
  const instr = path.join(cwd, target.instructionFile);
  if (!(await fileExists(instr))) return false;
  const content = await fs.readFile(instr, "utf8");
  const { begin } = markers(target.id);
  if (content.includes(begin)) return true;
  // Owned files may only contain our content under the scoped marker.
  if (target.instructionMode === "owned-file" && content.includes("repochan:setup")) return true;
  return false;
}

export async function installTarget(
  cwd: string,
  target: AgentTarget,
  skillSrc: string,
): Promise<InstallResult> {
  const skillRel = skillDestFor(target);
  const skillAbs = path.join(cwd, skillRel);
  const skillFiles = await copyDir(skillSrc, skillAbs);

  const instrAbs = path.join(cwd, target.instructionFile);
  let instructionAction: InstallResult["instructionAction"];

  if (target.instructionMode === "owned-file") {
    const body =
      target.id === "cursor"
        ? cursorRulesFile(target.id, skillRel)
        : target.id === "kiro"
          ? kiroSteeringFile(target.id, skillRel)
          : referenceBlock(target.id, skillRel) + "\n";
    instructionAction = await writeOwnedFile(instrAbs, body);
  } else {
    instructionAction = await injectMarkerSection(
      instrAbs,
      target.id,
      referenceBlock(target.id, skillRel),
    );
  }

  // Best-effort: strip legacy marker from old paths (e.g. .cursorrules).
  const notes: string[] = [];
  for (const legacy of target.legacyCleanupPaths?.(cwd) ?? []) {
    if (await removeMarkerSection(legacy)) {
      notes.push(`cleaned legacy marker in ${path.relative(cwd, legacy) || legacy}`);
    }
  }

  return {
    agent: target.id,
    displayName: target.displayName,
    skillDir: skillRel,
    skillFiles,
    instructionFile: target.instructionFile,
    instructionAction,
    notes: notes.length ? notes : undefined,
  };
}

export async function uninstallTarget(cwd: string, target: AgentTarget): Promise<InstallResult> {
  const instrAbs = path.join(cwd, target.instructionFile);
  let instructionAction: InstallResult["instructionAction"] = "not-found";

  if (target.instructionMode === "owned-file") {
    instructionAction = (await removeOwnedFile(instrAbs)) ? "removed" : "not-found";
  } else {
    instructionAction = (await removeMarkerSection(instrAbs, target.id)) ? "removed" : "not-found";
  }

  // Remove skill tree only if it looks like ours (contains repochan wizard skill).
  // Don't delete shared fallback if other agents still use it — only remove
  // agent-specific skill dirs, or fallback when no other configured agent uses it.
  const skillRel = skillDestFor(target);
  if (target.skillDir !== null) {
    const skillAbs = path.join(cwd, skillRel);
    const wizard = path.join(skillAbs, "repochan", "SKILL.md");
    if (await fileExists(wizard)) {
      await fs.rm(skillAbs, { recursive: true, force: true }).catch(() => {});
    }
  }

  for (const legacy of target.legacyCleanupPaths?.(cwd) ?? []) {
    await removeMarkerSection(legacy);
  }

  return {
    agent: target.id,
    displayName: target.displayName,
    skillDir: skillRel,
    skillFiles: 0,
    instructionFile: target.instructionFile,
    instructionAction,
  };
}

export function formatAgentIds(ids: AgentId[]): string {
  return ids.join(", ");
}

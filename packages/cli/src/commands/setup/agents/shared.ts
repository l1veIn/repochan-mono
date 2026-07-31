import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { removeRecursive, renameReplacing, unlinkFile } from "@repochan/core";
import type { AgentId, AgentTarget, InstallResult } from "./types.js";
import { cliVersion } from "../../../lib/register.js";

const require = createRequire(import.meta.url);

/** Marker anchors for multiple agents sharing one instruction file. */
export function markers(agentId: AgentId): { begin: string; end: string } {
  return {
    begin: `<!-- repochan:setup:${agentId} begin -->`,
    end: `<!-- repochan:setup:${agentId} end -->`,
  };
}

export function skillDestFor(target: AgentTarget, scope: "global" | "project" = "project"): string {
  if (scope === "global") {
    return target.globalSkillDir ?? target.skillDir;
  }
  return target.skillDir;
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
    `- [RepoChan wizard](${skillPath}/repochan/SKILL.md) — guided full pipeline by default; stops at 3 checkpoints for user confirmation. Only runs end-to-end without stopping when the user explicitly says "yolo".`,
    `- [Team skills](${skillPath}/) — analysis, persona, painter, ... (advanced, per-step)`,
    "",
    "Run `/repochan` to start in guided mode, or say \"generate all assets and deploy\" for the full pipeline (still guided unless you add \"yolo\").",
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

/**
 * Stamp the skill directory with a `.repochan-version` marker recording the
 * CLI version that installed these skills. Lets the installed skill set
 * self-describe its version (independent of ~/.repochan/register.json) so
 * `repochan status` can detect skill/cli drift.
 */
export async function stampSkillVersion(skillDirAbs: string): Promise<void> {
  await atomicWrite(path.join(skillDirAbs, ".repochan-version"), `${cliVersion()}\n`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    // Remove all scoped RepoChan blocks.
    const before = content;
    content = content.replace(
      /<!-- repochan:setup:[a-z]+ begin -->[\s\S]*?<!-- repochan:setup:[a-z]+ end -->\n?/g,
      "",
    );
    if (content !== before) changed = true;
  }

  if (!changed) return false;
  if (content.trim() === "") {
    await unlinkFile(filePath).catch(() => {});
  } else {
    await atomicWrite(filePath, content);
  }
  return true;
}

async function assertOwnedFileWritable(
  filePath: string,
  body: string,
  overwrite: boolean,
): Promise<void> {
  if (!(await fileExists(filePath))) return;
  const existing = await fs.readFile(filePath, "utf8");
  if (existing === body || existing === body + "\n") return;
  const ownerMarker = body.match(/<!-- repochan:setup:[a-z]+ begin -->/)?.[0];
  if (ownerMarker && existing.includes(ownerMarker)) return;
  if (overwrite) return;
  throw new Error(
    `Refusing to overwrite existing non-RepoChan instruction file: ${filePath}. ` +
    "Move it, merge it manually, or re-run setup with --overwrite.",
  );
}

function ownedInstructionBody(target: AgentTarget, skillRel: string): string | undefined {
  if (target.instructionMode !== "owned-file") return undefined;
  return target.id === "cursor"
    ? cursorRulesFile(target.id, skillRel)
    : target.id === "kiro"
      ? kiroSteeringFile(target.id, skillRel)
      : referenceBlock(target.id, skillRel) + "\n";
}

/** Read-only collision check used to make a multi-target setup fail before any target writes. */
export async function preflightTargetInstall(
  cwd: string,
  target: AgentTarget,
  scope: "global" | "project" = "project",
  overwrite = false,
  skillSrc?: string,
): Promise<void> {
  const skillRel = skillDestFor(target, scope);
  const body = ownedInstructionBody(target, skillRel);
  if (body !== undefined) {
    await assertOwnedFileWritable(path.join(cwd, target.instructionFile), body, overwrite);
  }

  const skillAbs = path.join(cwd, skillRel);
  if (await fileExists(path.join(skillAbs, ".repochan-version"))) return;
  const source = skillSrc ?? await resolveSkillSourceDir();
  const entries = await fs.readdir(source, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const destination = path.join(skillAbs, entry.name);
    if (await fileExists(destination)) {
      if (overwrite) continue;
      throw new Error(
        `Refusing to overwrite existing non-RepoChan skill path: ${destination}. ` +
        "Move it, merge it manually, or re-run setup with --overwrite.",
      );
    }
  }
}

/**
 * Write an owned file (Cursor rules / Kiro steering); byte-equal → unchanged.
 * Existing non-RepoChan content is preserved unless overwrite is explicit.
 */
export async function writeOwnedFile(
  filePath: string,
  body: string,
  overwrite = false,
): Promise<"created" | "updated" | "unchanged"> {
  if (await fileExists(filePath)) {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing === body || existing === body + "\n") return "unchanged";
    await assertOwnedFileWritable(filePath, body, overwrite);
    await atomicWrite(filePath, body.endsWith("\n") ? body : body + "\n");
    return "updated";
  }
  await atomicWrite(filePath, body.endsWith("\n") ? body : body + "\n");
  return "created";
}

function hasExactOwnedFileEnvelope(content: string, expectedBody: string): boolean {
  const begin = expectedBody.match(/<!-- repochan:setup:[a-z]+ begin -->/)?.[0];
  if (!begin) return false;
  const end = begin.replace(" begin -->", " end -->");
  const expectedPrefix = expectedBody.slice(0, expectedBody.indexOf(begin)).replace(/\r\n/g, "\n");
  const normalized = content.replace(/\r\n/g, "\n");
  const beginAt = normalized.indexOf(begin);
  const endAt = normalized.indexOf(end, beginAt + begin.length);
  if (beginAt < 0 || endAt < 0) return false;
  if (normalized.indexOf(begin, beginAt + begin.length) >= 0) return false;
  if (normalized.indexOf(end, endAt + end.length) >= 0) return false;
  if (normalized.slice(0, beginAt) !== expectedPrefix) return false;
  return normalized.slice(endAt + end.length).trim() === "";
}

export async function removeOwnedFile(filePath: string, expectedBody: string): Promise<boolean> {
  if (!(await fileExists(filePath))) return false;
  // Delete only the exact target-owned envelope. A user file merely mentioning
  // `repochan:setup` (or containing a partial marker) is not ours.
  const content = await fs.readFile(filePath, "utf8");
  if (!hasExactOwnedFileEnvelope(content, expectedBody)) return false;
  await unlinkFile(filePath);
  return true;
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}`;
  await fs.writeFile(tmp, content, "utf8");
  await renameReplacing(tmp, filePath);
}

export async function isConfigured(cwd: string, target: AgentTarget): Promise<boolean> {
  const instr = path.join(cwd, target.instructionFile);
  if (!(await fileExists(instr))) return false;
  const content = await fs.readFile(instr, "utf8");
  if (target.instructionMode === "owned-file") {
    const expectedBody = ownedInstructionBody(target, skillDestFor(target, "project"));
    return expectedBody ? hasExactOwnedFileEnvelope(content, expectedBody) : false;
  }
  const { begin } = markers(target.id);
  return content.includes(begin);
}

export async function installTarget(
  cwd: string,
  target: AgentTarget,
  skillSrc: string,
  scope: "global" | "project" = "project",
  overwrite = false,
): Promise<InstallResult> {
  const skillRel = skillDestFor(target, scope);
  const skillAbs = path.join(cwd, skillRel);
  const instrAbs = path.join(cwd, target.instructionFile);
  let instructionAction: InstallResult["instructionAction"];
  const ownedBody = ownedInstructionBody(target, skillRel);

  // Retain the local guard for direct installTarget callers. runProject also
  // preflights the complete target set before its first mutation.
  await preflightTargetInstall(cwd, target, scope, overwrite, skillSrc);

  const skillFiles = await copyDir(skillSrc, skillAbs);
  await stampSkillVersion(skillAbs);

  if (ownedBody !== undefined) {
    instructionAction = await writeOwnedFile(instrAbs, ownedBody, overwrite);
  } else {
    instructionAction = await injectMarkerSection(
      instrAbs,
      target.id,
      referenceBlock(target.id, skillRel),
    );
  }

  return {
    agent: target.id,
    displayName: target.displayName,
    skillDir: skillRel,
    skillFiles,
    instructionFile: target.instructionFile,
    instructionAction,
  };
}

export async function uninstallTarget(
  cwd: string,
  target: AgentTarget,
  scope: "global" | "project" = "project",
  skillSrc?: string,
  preserveSkills = false,
): Promise<InstallResult> {
  const instrAbs = path.join(cwd, target.instructionFile);
  let instructionAction: InstallResult["instructionAction"] = "not-found";
  const skillRel = skillDestFor(target, scope);

  if (target.instructionMode === "owned-file") {
    const expectedBody = ownedInstructionBody(target, skillRel);
    instructionAction = expectedBody && await removeOwnedFile(instrAbs, expectedBody)
      ? "removed"
      : "not-found";
  } else {
    instructionAction = (await removeMarkerSection(instrAbs, target.id)) ? "removed" : "not-found";
  }

  // Remove only skill subdirectories shipped by @repochan/skill. Native skill
  // containers are shared with the user and must never be deleted recursively.
  if (!preserveSkills) {
    const skillAbs = path.join(cwd, skillRel);
    const versionStamp = path.join(skillAbs, ".repochan-version");
    // A matching directory name is not ownership. Without the setup-created
    // provenance stamp, preserve every skill even if it is named `repochan`.
    if (await fileExists(versionStamp)) {
      const source = skillSrc ?? await resolveSkillSourceDir();
      const entries = await fs.readdir(source, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const installed = path.join(skillAbs, entry.name);
        if (await fileExists(path.join(installed, "SKILL.md"))) {
          await removeRecursive(installed);
        }
      }
      await unlinkFile(versionStamp).catch(() => {});
      await fs.rmdir(skillAbs).catch(() => {}); // only succeeds when the shared container is empty
    }
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

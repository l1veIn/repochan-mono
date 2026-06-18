import { promises as fs } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import ignore from "ignore";
import { PROTOCOL_DIR } from "../protocol/index.js";
import type { WalkResult } from "./types.js";

export const HARD_IGNORE_DIRS = new Set([
  ".git",
  "__pycache__",
  "node_modules",
  ".venv",
  "venv",
  PROTOCOL_DIR,
  ".DS_Store",
  "dist",
  "build",
  ".egg-info",
  "target",
  ".next",
  ".nuxt",
  "coverage",
]);

export const TEXT_EXTS = new Set([
  ".py",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".css",
  ".scss",
  ".html",
  ".vue",
  ".svelte",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".md",
  ".txt",
  ".sh",
  ".bash",
  ".zig",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".scala",
]);

export function rel(projectRoot: string, file: string) {
  return path.relative(projectRoot, file).split(path.sep).join("/");
}

async function loadIgnore(projectRoot: string) {
  const ig = ignore();
  for (const dir of HARD_IGNORE_DIRS) ig.add([dir, `${dir}/**`, `**/${dir}`, `**/${dir}/**`]);
  ig.add([".*", "**/.*"]);
  try {
    const raw = await fs.readFile(path.join(projectRoot, ".gitignore"), "utf8");
    ig.add(raw);
  } catch {
    // no .gitignore
  }
  return ig;
}

function ignoredWithParents(relPath: string, ig: ReturnType<typeof ignore>) {
  const parts = relPath.split("/");
  for (let i = 1; i < parts.length; i += 1) {
    if (ig.ignores(parts.slice(0, i).join("/"))) return true;
  }
  return ig.ignores(relPath);
}

export async function walkProject(projectRoot: string): Promise<WalkResult> {
  const ig = await loadIgnore(projectRoot);
  const entries = await fg("**/*", {
    cwd: projectRoot,
    absolute: false,
    dot: true,
    onlyFiles: false,
    markDirectories: false,
    unique: true,
    followSymbolicLinks: false,
  });
  const dirs: string[] = [];
  const files: string[] = [];
  for (const entry of entries.sort()) {
    const normalized = entry.split(path.sep).join("/");
    const parts = normalized.split("/");
    if (parts.some((part) => HARD_IGNORE_DIRS.has(part))) continue;
    if (parts.some((part) => part.startsWith(".") && part !== PROTOCOL_DIR)) continue;
    if (ignoredWithParents(normalized, ig)) continue;
    const full = path.join(projectRoot, normalized);
    try {
      const st = await fs.stat(full);
      if (st.isDirectory()) dirs.push(full);
      else if (st.isFile()) files.push(full);
    } catch {
      // ignore transient/unreadable paths
    }
  }
  return { dirs, files };
}

export function collectLanguages(files: string[]) {
  const counts: Record<string, number> = {};
  for (const file of files) {
    const ext = path.extname(file).toLowerCase() || "(no ext)";
    counts[ext] = (counts[ext] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

export async function countLines(files: string[]) {
  let total = 0;
  for (const file of files) {
    if (!TEXT_EXTS.has(path.extname(file).toLowerCase())) continue;
    try {
      total += (await fs.readFile(file, "utf8")).split(/\r?\n/).length;
    } catch {
      // ignore binary/unreadable
    }
  }
  return total;
}

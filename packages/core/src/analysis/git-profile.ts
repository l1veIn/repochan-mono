import path from "node:path";
import { simpleGit } from "simple-git";
import { exists } from "../protocol/index.js";
import type { GitMeta, GitProfile, ParsedGitCommit } from "./types.js";

export async function analyzeGit(projectRoot: string): Promise<GitProfile> {
  if (!(await exists(path.join(projectRoot, ".git")))) return { has_git: false };
  const git = simpleGit({ baseDir: projectRoot, maxConcurrentProcesses: 4 });
  try {
    const [branch, remote, status, raw] = await Promise.all([
      git.raw(["rev-parse", "--abbrev-ref", "HEAD"]).then((s) => s.trim()).catch(() => ""),
      git.raw(["remote", "-v"]).then((s) => s.trim()).catch(() => ""),
      git.raw(["status", "--short"]).then((s) => s.trim()).catch(() => ""),
      git.raw(["log", "--all", "--numstat", "--format=%H|%an|%ai|%s", "--no-merges"]),
    ]);
    const commits = parseGitLog(raw);
    return computeGitProfile(commits, { branch, remote, status });
  } catch {
    return { has_git: true, total_commits: 0 };
  }
}

export function parseGitLog(raw: string): ParsedGitCommit[] {
  const commits: ParsedGitCommit[] = [];
  let current: ParsedGitCommit | undefined;
  for (const original of raw.trim().split(/\r?\n/)) {
    const line = original.trim();
    if (!line) continue;
    if (/^[0-9a-f]{40}\|/.test(line)) {
      if (current) commits.push(current);
      const parts = line.split("|");
      current = {
        hash: (parts[0] ?? "").slice(0, 8),
        author: parts[1] ?? "",
        date: parts[2] ?? "",
        message_summary: parts.slice(3).join("|").trim(),
        files_changed: 0,
        insertions: 0,
        deletions: 0,
        changed_files: [],
      };
    } else if (current && line.includes("\t")) {
      const [ins, del, file] = line.split("\t");
      current.files_changed += 1;
      current.insertions += ins === "-" ? 0 : Number.parseInt(ins ?? "", 10) || 0;
      current.deletions += del === "-" ? 0 : Number.parseInt(del ?? "", 10) || 0;
      if (file) current.changed_files.push(file);
    }
  }
  if (current) commits.push(current);
  return commits;
}

export function computeGitProfile(commits: ParsedGitCommit[], meta: GitMeta): GitProfile {
  const n = commits.length;
  const remotes = meta.remote.split(/\r?\n/).filter(Boolean);
  if (!n) return { has_git: true, total_commits: 0, branch: meta.branch, dirty: Boolean(meta.status), dirty_file_count: meta.status ? meta.status.split(/\r?\n/).filter(Boolean).length : 0, remotes };
  const authors = new Set(commits.map((c) => c.author).filter(Boolean));
  const dates = commits.map((c) => c.date).filter(Boolean).sort();
  const first = dates[0] ?? "";
  const last = dates[dates.length - 1] ?? "";
  const firstMs = Date.parse(first);
  const lastMs = Date.parse(last);
  const spanWeeks = Number.isFinite(firstMs) && Number.isFinite(lastMs) ? Math.max((lastMs - firstMs) / 86400000 / 7, 1) : 1;
  const hours = Array.from({ length: 24 }, () => 0);
  let night = 0;
  let weekend = 0;
  const fileChurn = new Map<string, { commits: number; lines: number }>();
  const messageThemes = new Map<string, number>();
  for (const c of commits) {
    const d = new Date(c.date);
    if (!Number.isNaN(d.getTime())) {
      const h = d.getHours();
      if (h >= 22 || h < 6) night += 1;
      if (d.getDay() === 0 || d.getDay() === 6) weekend += 1;
      hours[h] += 1;
    }
    const summary = String(c.message_summary ?? "").trim().toLowerCase();
    const theme = summary.includes(":") ? summary.split(":", 1)[0] : summary.split(/\s+/, 1)[0];
    if (theme) messageThemes.set(theme, (messageThemes.get(theme) ?? 0) + 1);
    for (const file of c.changed_files ?? []) {
      const current = fileChurn.get(file) ?? { commits: 0, lines: 0 };
      current.commits += 1;
      current.lines += (c.insertions ?? 0) + (c.deletions ?? 0);
      fileChurn.set(file, current);
    }
  }
  const totalFiles = commits.reduce((a, c) => a + c.files_changed, 0);
  const totalLines = commits.reduce((a, c) => a + c.insertions + c.deletions, 0);
  const mergeCount = commits.filter((c) => String(c.message_summary).includes("Merge")).length;
  return {
    has_git: true,
    branch: meta.branch,
    dirty: Boolean(meta.status),
    dirty_file_count: meta.status ? meta.status.split(/\r?\n/).filter(Boolean).length : 0,
    remotes,
    total_commits: n,
    total_authors: authors.size,
    first_commit_date: first,
    last_commit_date: last,
    commits_per_week: Number((n / spanWeeks).toFixed(1)),
    commits_per_author: Number((n / Math.max(authors.size, 1)).toFixed(1)),
    night_commit_ratio: Number((night / n).toFixed(2)),
    weekend_commit_ratio: Number((weekend / n).toFixed(2)),
    busiest_hour: hours.indexOf(Math.max(...hours)),
    avg_files_per_commit: Number((totalFiles / n).toFixed(1)),
    avg_lines_per_commit: Number((totalLines / n).toFixed(1)),
    merge_commit_ratio: Number((mergeCount / n).toFixed(2)),
    top_changed_files: [...fileChurn.entries()]
      .sort((a, b) => b[1].commits - a[1].commits || b[1].lines - a[1].lines)
      .slice(0, 15)
      .map(([file, value]) => ({ file, ...value })),
    commit_message_themes: Object.fromEntries([...messageThemes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)),
    recent_commits: commits.slice(0, 12).map((c) => ({ hash: c.hash, date: c.date, message_summary: c.message_summary })),
  };
}

import { describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { analyzeGit, computeGitProfile, parseGitLog } from "../src/analysis/git-profile.js";
import type { ParsedGitCommit } from "../src/analysis/types.js";

const rawLog = `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa||Ada|2024-01-06 23:00:00 +0000|feat: add app
10	2	src/app.ts
1	0	README.md
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|Ben|2024-01-08 14:00:00 +0000|fix: patch bug
-	-	image.png
`;

describe("git profile helpers", () => {
  it("parses git log numstat output", () => {
    const commits = parseGitLog(rawLog);

    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({ hash: "aaaaaaaa", author: "Ada", files_changed: 2, insertions: 11, deletions: 2 });
    expect(commits[0].changed_files).toEqual(["src/app.ts", "README.md"]);
    expect(commits[1]).toMatchObject({ hash: "bbbbbbbb", files_changed: 1, insertions: 0, deletions: 0 });
    expect(commits[0].parents).toEqual([]);
    expect(commits[1].parents).toEqual(["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]);
  });

  it("computes night and weekend ratios", () => {
    const commits: ParsedGitCommit[] = [
      {
        hash: "one",
        author: "Ada",
        date: "2024-01-06 23:00:00 +0800",
        message_summary: "feat: night weekend",
        files_changed: 1,
        insertions: 10,
        deletions: 1,
        changed_files: ["src/app.ts"],
      },
      {
        hash: "two",
        author: "Ben",
        date: "2024-01-08 14:00:00 -0500",
        message_summary: "fix: weekday",
        files_changed: 1,
        insertions: 2,
        deletions: 3,
        changed_files: ["src/app.ts"],
      },
    ];

    const profile = computeGitProfile(commits, { branch: "main", remote: "origin\thttps://example.com/repo.git (fetch)", status: " M src/app.ts" });

    expect(profile.total_commits).toBe(2);
    expect(profile.night_commit_ratio).toBe(0.5);
    expect(profile.weekend_commit_ratio).toBe(0.5);
    expect(profile.dirty).toBe(true);
    expect(profile.top_changed_files?.[0]).toEqual({ file: "src/app.ts", commits: 2, lines: 16 });
  });

  it("keeps author-local night and weekend statistics identical across scanner timezones", () => {
    const commits = parseGitLog(rawLog.replace("2024-01-06 23:00:00 +0000", "2024-01-06 23:00:00 -0500"));
    try {
      vi.stubEnv("TZ", "UTC");
      const utc = computeGitProfile(commits, { branch: "main", remote: "", status: "" });
      vi.stubEnv("TZ", "Asia/Shanghai");
      const asia = computeGitProfile(commits, { branch: "main", remote: "", status: "" });
      expect(asia).toEqual(utc);
      expect(utc.night_commit_ratio).toBe(0.5);
      expect(utc.weekend_commit_ratio).toBe(0.5);
      expect(utc.busiest_hour).toBe(14);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("counts real merge topology, including merges with a custom subject", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-git-profile-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.test",
      GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.test",
    } });
    try {
      git("init", "-b", "main");
      git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "Merge documentation examples");
      git("checkout", "-b", "feature");
      git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "feature");
      git("checkout", "main");
      git("-c", "commit.gpgsign=false", "merge", "--no-ff", "feature", "-m", "Integrate feature");
      const profile = await analyzeGit(root);
      expect(profile.total_commits).toBe(3);
      expect(profile.merge_commit_ratio).toBe(0.33);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

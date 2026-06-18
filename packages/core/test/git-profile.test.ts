import { describe, expect, it } from "vitest";
import { computeGitProfile, parseGitLog } from "../src/analysis/git-profile.js";
import type { ParsedGitCommit } from "../src/analysis/types.js";

const rawLog = `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|Ada|2024-01-06 23:00:00 +0000|feat: add app
10	2	src/app.ts
1	0	README.md
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb|Ben|2024-01-08 14:00:00 +0000|fix: patch bug
-	-	image.png
`;

describe("git profile helpers", () => {
  it("parses git log numstat output", () => {
    const commits = parseGitLog(rawLog);

    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({ hash: "aaaaaaaa", author: "Ada", files_changed: 2, insertions: 11, deletions: 2 });
    expect(commits[0].changed_files).toEqual(["src/app.ts", "README.md"]);
    expect(commits[1]).toMatchObject({ hash: "bbbbbbbb", files_changed: 1, insertions: 0, deletions: 0 });
  });

  it("computes night and weekend ratios", () => {
    const commits: ParsedGitCommit[] = [
      {
        hash: "one",
        author: "Ada",
        date: new Date(2024, 0, 6, 23, 0, 0).toString(),
        message_summary: "feat: night weekend",
        files_changed: 1,
        insertions: 10,
        deletions: 1,
        changed_files: ["src/app.ts"],
      },
      {
        hash: "two",
        author: "Ben",
        date: new Date(2024, 0, 8, 14, 0, 0).toString(),
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
});

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { gitSuffixForPackageDir, parseRegister } from "./register.js";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

async function createGitRepo(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  git(root, "init", "--quiet");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "RepoChan Test");
  return root;
}

describe("CLI version identity", () => {
  it("uses git identity only for the RepoChan source-checkout layout", async () => {
    const root = await createGitRepo("repochan-cli-version-source-");
    const packageDir = path.join(root, "packages", "cli");
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, "package.json"), "{}\n");
    git(root, "add", ".");
    git(root, "commit", "--quiet", "-m", "seed");

    expect(gitSuffixForPackageDir(packageDir)).toMatch(/^\+g[0-9a-f]+$/);

    await writeFile(path.join(root, "README.md"), "dirty\n");
    expect(gitSuffixForPackageDir(packageDir)).toMatch(/^\+g[0-9a-f]+-dirty$/);
  });

  it("ignores the host repository around a published package", async () => {
    const root = await createGitRepo("repochan-cli-version-host-");
    const packageDir = path.join(root, "node_modules", "repochan");
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, "package.json"), "{}\n");
    await writeFile(path.join(root, "README.md"), "host project\n");
    git(root, "add", ".");
    git(root, "commit", "--quiet", "-m", "seed");

    expect(gitSuffixForPackageDir(packageDir)).toBe("");

    await writeFile(path.join(root, "README.md"), "host project changed\n");
    expect(gitSuffixForPackageDir(packageDir)).toBe("");
  });
});

describe("register contract", () => {
  const timestamp = "2026-01-01T00:00:00.000Z";
  const valid = {
    version: 1,
    cliVersion: "0.3.0",
    updatedAt: timestamp,
    skills: {
      codex: { scope: "project", installedAt: timestamp, cliVersion: "0.3.0", skillCount: 9, path: ".codex/skills" },
    },
    projects: [{ path: path.resolve("/tmp/repochan-register-project"), initializedAt: timestamp, lastSeenAt: timestamp, cliVersion: "0.3.0" }],
  };

  it("accepts only the complete current register schema", () => {
    expect(parseRegister(JSON.stringify(valid))).toEqual(valid);
    expect(() => parseRegister("{bad-json")).toThrow(/Invalid register JSON/);
    expect(() => parseRegister(JSON.stringify({ ...valid, version: 2 }))).toThrow(/must declare "version": 1/);
    expect(() => parseRegister(JSON.stringify({ ...valid, skills: undefined }))).toThrow(/Missing: skills/);
    expect(() => parseRegister(JSON.stringify({ ...valid, removedField: true }))).toThrow(/unknown: removedField/);
    expect(() => parseRegister(JSON.stringify({ ...valid, updatedAt: "July 15, 2026" }))).toThrow(/canonical UTC ISO/);
    expect(() => parseRegister(JSON.stringify({ ...valid, updatedAt: "2026-07-15T00:00:00Z" }))).toThrow(/canonical UTC ISO/);
    expect(() => parseRegister(JSON.stringify({
      ...valid,
      skills: { codex: { ...valid.skills.codex, skillCount: "9" } },
    }))).toThrow(/skillCount must be a non-negative integer/);
  });

  it("rejects duplicate project identities", () => {
    expect(() => parseRegister(JSON.stringify({ ...valid, projects: [valid.projects[0], valid.projects[0]] })))
      .toThrow(/must not contain duplicate paths/);
  });
});

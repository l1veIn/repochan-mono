import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { gitSuffixForPackageDir } from "./register.js";

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

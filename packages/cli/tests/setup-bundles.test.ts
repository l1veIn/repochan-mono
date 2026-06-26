import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";

const cliRoot = path.resolve(__dirname, "..");

describe("repochan setup bundled Pi packages", () => {
  it("bundles ask_user_question so the interview skill can open structured questionnaires", async () => {
    const packageJson = JSON.parse(await readFile(path.join(cliRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const setupSource = await readFile(path.join(cliRoot, "src", "commands", "setup.ts"), "utf8");

    expect(packageJson.dependencies).toHaveProperty("@juicesharp/rpiv-ask-user-question");
    expect(setupSource).toContain('"@juicesharp/rpiv-ask-user-question"');
  });

  it("resolves and writes ask_user_question extension during setup", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "repochan-setup-home-"));
    try {
      const result = spawnSync(process.execPath, [path.join(cliRoot, "dist", "index.js"), "setup", "--json"], {
        cwd: cliRoot,
        env: { ...process.env, HOME: home },
        encoding: "utf8",
      });

      expect(result.status, result.stderr || result.stdout).toBe(0);
      const output = JSON.parse(result.stdout) as { settings: { extensions: string[] } };
      expect(output.settings.extensions.some((p) => p.includes("rpiv-ask-user-question"))).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

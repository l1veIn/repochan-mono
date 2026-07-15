import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  home: `${process.env.TMPDIR || "/tmp"}/repochan-global-shared-${process.pid}`,
}));

vi.mock("node:os", () => ({
  homedir: () => state.home,
  default: { homedir: () => state.home },
}));

import { runSetup } from "./index.js";
import { loadRegister } from "../../lib/register.js";

async function missing(filePath: string): Promise<void> {
  await expect(access(filePath)).rejects.toThrow();
}

describe("global shared skill destinations", () => {
  beforeEach(async () => {
    await rm(state.home, { recursive: true, force: true });
    await mkdir(state.home, { recursive: true });
  });

  it("keeps Gemini skills until Antigravity is also removed", async () => {
    const cwd = await mkdtemp(path.join(state.home, "project-"));
    const sharedWizard = path.join(state.home, ".gemini", "skills", "repochan", "SKILL.md");

    await runSetup(cwd, { global: true, yes: true, json: true, agent: "gemini,antigravity" });
    expect(await readFile(sharedWizard, "utf8")).toContain("# RepoChan");

    await runSetup(cwd, { global: true, remove: true, yes: true, json: true, agent: "gemini" });
    expect(await readFile(sharedWizard, "utf8")).toContain("# RepoChan");
    let register = await loadRegister();
    expect(register.skills.gemini).toBeUndefined();
    expect(register.skills.antigravity?.scope).toBe("global");

    await runSetup(cwd, { global: true, remove: true, yes: true, json: true, agent: "antigravity" });
    await missing(sharedWizard);
    register = await loadRegister();
    expect(register.skills.antigravity).toBeUndefined();
  });

  it("removes a shared destination when Gemini is its only registered owner", async () => {
    const cwd = await mkdtemp(path.join(state.home, "project-"));
    const sharedWizard = path.join(state.home, ".gemini", "skills", "repochan", "SKILL.md");
    await runSetup(cwd, { global: true, yes: true, json: true, agent: "gemini" });

    await runSetup(cwd, { global: true, remove: true, yes: true, json: true, agent: "gemini" });

    await missing(sharedWizard);
    expect((await loadRegister()).skills.gemini).toBeUndefined();
  });

  it("preserves a global same-named user skill without setup provenance", async () => {
    const cwd = await mkdtemp(path.join(state.home, "project-"));
    const userSkill = path.join(state.home, ".codex", "skills", "repochan", "SKILL.md");
    await mkdir(path.dirname(userSkill), { recursive: true });
    await writeFile(userSkill, "# User-owned global skill\n");

    await runSetup(cwd, { global: true, remove: true, yes: true, json: true, agent: "codex" });

    expect(await readFile(userSkill, "utf8")).toBe("# User-owned global skill\n");
  });

  it("rejects a global user skill collision and accepts explicit overwrite", async () => {
    const cwd = await mkdtemp(path.join(state.home, "project-"));
    const userSkill = path.join(state.home, ".codex", "skills", "repochan", "SKILL.md");
    const customSkill = path.join(state.home, ".codex", "skills", "my-custom", "SKILL.md");
    await mkdir(path.dirname(userSkill), { recursive: true });
    await mkdir(path.dirname(customSkill), { recursive: true });
    await writeFile(userSkill, "# User-owned global skill\n");
    await writeFile(customSkill, "# Keep global custom\n");

    await expect(runSetup(cwd, { global: true, yes: true, json: true, agent: "codex" }))
      .rejects.toThrow(/Refusing to overwrite existing non-RepoChan skill path/);
    expect(await readFile(userSkill, "utf8")).toBe("# User-owned global skill\n");
    expect((await loadRegister()).skills.codex).toBeUndefined();

    await runSetup(cwd, {
      global: true,
      yes: true,
      json: true,
      agent: "codex",
      overwrite: true,
    });
    expect(await readFile(userSkill, "utf8")).not.toBe("# User-owned global skill\n");
    expect(await readFile(customSkill, "utf8")).toBe("# Keep global custom\n");
    expect((await loadRegister()).skills.codex?.scope).toBe("global");
  });

  it("preflights every global target before an earlier target can write", async () => {
    const cwd = await mkdtemp(path.join(state.home, "project-"));
    const cursorSkill = path.join(state.home, ".cursor", "skills", "repochan", "SKILL.md");
    await mkdir(path.dirname(cursorSkill), { recursive: true });
    await writeFile(cursorSkill, "# Cursor user skill\n");

    await expect(runSetup(cwd, {
      global: true,
      yes: true,
      json: true,
      agent: "codex,cursor",
    })).rejects.toThrow(/Refusing to overwrite existing non-RepoChan skill path/);

    expect(await readFile(cursorSkill, "utf8")).toBe("# Cursor user skill\n");
    await missing(path.join(state.home, ".codex", "skills", "repochan", "SKILL.md"));
    expect(Object.keys((await loadRegister()).skills)).toEqual([]);
  });

  it("discovers a physical global install after a project record overwrites its register entry", async () => {
    const cwd = await mkdtemp(path.join(state.home, "project-"));
    const globalWizard = path.join(state.home, ".codex", "skills", "repochan", "SKILL.md");
    const projectWizard = path.join(cwd, ".codex", "skills", "repochan", "SKILL.md");
    await runSetup(cwd, { global: true, yes: true, json: true, agent: "codex" });
    await runSetup(cwd, { project: true, yes: true, json: true, agent: "codex" });
    expect((await loadRegister()).skills.codex?.scope).toBe("project");

    await runSetup(cwd, { global: true, remove: true, yes: true, json: true });

    await missing(globalWizard);
    expect(await readFile(projectWizard, "utf8")).toContain("# RepoChan");
    expect((await loadRegister()).skills.codex?.scope).toBe("project");
  });

  it("cleans an ambiguous shared global install when all possible owners are selected", async () => {
    const cwd = await mkdtemp(path.join(state.home, "project-"));
    const globalWizard = path.join(state.home, ".gemini", "skills", "repochan", "SKILL.md");
    const projectWizard = path.join(cwd, ".gemini", "skills", "repochan", "SKILL.md");
    await runSetup(cwd, { global: true, yes: true, json: true, agent: "gemini" });
    await runSetup(cwd, { project: true, yes: true, json: true, agent: "gemini" });
    expect((await loadRegister()).skills.gemini?.scope).toBe("project");

    await runSetup(cwd, { global: true, remove: true, yes: true, json: true });

    await missing(globalWizard);
    expect(await readFile(projectWizard, "utf8")).toContain("# RepoChan");
    expect((await loadRegister()).skills.gemini?.scope).toBe("project");
  });
});

import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const registerMocks = vi.hoisted(() => ({
  recordSkillInstall: vi.fn(),
  recordSkillRemove: vi.fn(),
}));

vi.mock("../../lib/register.js", async () => {
  const actual = await vi.importActual<typeof import("../../lib/register.js")>("../../lib/register.js");
  return { ...actual, ...registerMocks };
});

vi.mock("../image-configure.js", () => ({
  maybeConfigureImageDuringSetup: vi.fn(),
}));

import { runSetup } from "./index.js";
import { cliVersion } from "../../lib/register.js";

async function missing(filePath: string): Promise<void> {
  await expect(access(filePath)).rejects.toThrow();
}

describe("multi-target project setup preflight", () => {
  beforeEach(() => {
    registerMocks.recordSkillInstall.mockReset();
    registerMocks.recordSkillRemove.mockReset();
  });

  it.each([
    ["cursor", path.join(".cursor", "rules", "repochan.mdc")],
    ["kiro", path.join(".kiro", "steering", "repochan.md")],
  ])("rejects a later %s collision before Codex or the register is changed", async (agent, conflictPath) => {
    const root = await mkdtemp(path.join(os.tmpdir(), `repochan-setup-multi-${agent}-`));
    const conflict = path.join(root, conflictPath);
    const original = `user-owned ${agent} rule\n`;
    await mkdir(path.dirname(conflict), { recursive: true });
    await writeFile(conflict, original);

    await expect(runSetup(root, {
      project: true,
      yes: true,
      json: true,
      agent: `codex,${agent}`,
    })).rejects.toThrow(/Refusing to overwrite existing non-RepoChan instruction file/);

    expect(await readFile(conflict, "utf8")).toBe(original);
    await missing(path.join(root, "AGENTS.md"));
    await missing(path.join(root, ".codex", "skills"));
    const targetSkill = agent === "cursor"
      ? path.join(root, ".cursor", "skills", "repochan", "SKILL.md")
      : path.join(root, ".kiro", "steering", "repochan", "SKILL.md");
    await missing(targetSkill);
    expect(registerMocks.recordSkillInstall).not.toHaveBeenCalled();
    expect(registerMocks.recordSkillRemove).not.toHaveBeenCalled();
  });

  it("keeps Gemini shared skills while Antigravity remains configured", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-setup-shared-project-"));
    await runSetup(root, { project: true, yes: true, json: true, agent: "gemini,antigravity" });
    const sharedWizard = path.join(root, ".gemini", "skills", "repochan", "SKILL.md");
    const instructions = path.join(root, "GEMINI.md");

    await runSetup(root, { project: true, remove: true, yes: true, json: true, agent: "gemini" });

    expect(await readFile(sharedWizard, "utf8")).toContain("# RepoChan");
    const afterGemini = await readFile(instructions, "utf8");
    expect(afterGemini).not.toContain("repochan:setup:gemini begin");
    expect(afterGemini).toContain("repochan:setup:antigravity begin");

    await runSetup(root, { project: true, remove: true, yes: true, json: true, agent: "antigravity" });
    await missing(sharedWizard);
    await missing(instructions);
  });

  it("installs grok/zcode/cline together and shares AGENTS.md with per-agent markers", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-setup-new-agents-"));
    await runSetup(root, { project: true, yes: true, json: true, agent: "grok,zcode,cline" });

    const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
    for (const id of ["grok", "zcode", "cline"]) {
      expect(agents).toContain(`repochan:setup:${id} begin`);
      const skill = path.join(root, `.${id}`, "skills", "repochan", "SKILL.md");
      expect(await readFile(skill, "utf8")).toContain("# RepoChan");
    }

    // Removing one leaves the others' markers + skills in place.
    await runSetup(root, { project: true, remove: true, yes: true, json: true, agent: "grok" });
    const afterGrok = await readFile(path.join(root, "AGENTS.md"), "utf8");
    expect(afterGrok).not.toContain("repochan:setup:grok begin");
    expect(afterGrok).toContain("repochan:setup:zcode begin");
    expect(afterGrok).toContain("repochan:setup:cline begin");
    await missing(path.join(root, ".grok", "skills", "repochan"));
    expect(await readFile(path.join(root, ".zcode", "skills", "repochan", "SKILL.md"), "utf8"))
      .toContain("# RepoChan");
  });

  it("rejects an unowned same-named project skill before any setup write", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-setup-skill-collision-"));
    const userSkill = path.join(root, ".codex", "skills", "repochan", "SKILL.md");
    await mkdir(path.dirname(userSkill), { recursive: true });
    await writeFile(userSkill, "# User-owned\n");

    await expect(runSetup(root, { project: true, yes: true, json: true, agent: "codex" }))
      .rejects.toThrow(/Refusing to overwrite existing non-RepoChan skill path/);

    expect(await readFile(userSkill, "utf8")).toBe("# User-owned\n");
    await missing(path.join(root, ".codex", "skills", ".repochan-version"));
    await missing(path.join(root, "AGENTS.md"));
    expect(registerMocks.recordSkillInstall).not.toHaveBeenCalled();
  });

  it("explicitly takes over a project skill collision and stamped upgrades remain allowed", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-setup-skill-overwrite-"));
    const userSkill = path.join(root, ".codex", "skills", "repochan", "SKILL.md");
    const customSkill = path.join(root, ".codex", "skills", "my-custom", "SKILL.md");
    await mkdir(path.dirname(userSkill), { recursive: true });
    await mkdir(path.dirname(customSkill), { recursive: true });
    await writeFile(userSkill, "# User-owned\n");
    await writeFile(customSkill, "# Keep me\n");

    await runSetup(root, {
      project: true,
      yes: true,
      json: true,
      agent: "codex",
      overwrite: true,
    });
    expect(await readFile(userSkill, "utf8")).not.toBe("# User-owned\n");
    expect(await readFile(customSkill, "utf8")).toBe("# Keep me\n");
    expect(await readFile(path.join(root, ".codex", "skills", ".repochan-version"), "utf8"))
      .toContain(cliVersion());

    await writeFile(userSkill, "# Stale installed copy\n");
    await runSetup(root, { project: true, yes: true, json: true, agent: "codex" });
    expect(await readFile(userSkill, "utf8")).not.toBe("# Stale installed copy\n");
    expect(await readFile(customSkill, "utf8")).toBe("# Keep me\n");
  });
});

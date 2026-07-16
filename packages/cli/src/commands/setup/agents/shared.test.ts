import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTarget } from "./registry.js";
import { installTarget, isConfigured, uninstallTarget } from "./shared.js";

describe("setup owned instruction files", () => {
  it("preserves a conflicting user file and does not partially copy skills", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-setup-owned-"));
    const skillSrc = path.join(root, "bundled-skills");
    const instruction = path.join(root, ".cursor", "rules", "repochan.mdc");
    const original = "---\ndescription: my custom rule\n---\n\nDo not replace me.\n";
    await mkdir(path.join(skillSrc, "repochan"), { recursive: true });
    await writeFile(path.join(skillSrc, "repochan", "SKILL.md"), "# RepoChan\n");
    await mkdir(path.dirname(instruction), { recursive: true });
    await writeFile(instruction, original);

    const cursor = getTarget("cursor")!;
    await expect(installTarget(root, cursor, skillSrc, "project"))
      .rejects.toThrow(/Refusing to overwrite existing non-RepoChan instruction file/);

    expect(await readFile(instruction, "utf8")).toBe(original);
    await expect(access(path.join(root, ".cursor", "skills"))).rejects.toThrow();
  });

  it("replaces the collision only with explicit overwrite", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-setup-overwrite-"));
    const skillSrc = path.join(root, "bundled-skills");
    const instruction = path.join(root, ".cursor", "rules", "repochan.mdc");
    await mkdir(path.join(skillSrc, "repochan"), { recursive: true });
    await writeFile(path.join(skillSrc, "repochan", "SKILL.md"), "# RepoChan\n");
    await mkdir(path.dirname(instruction), { recursive: true });
    await writeFile(instruction, "custom\n");

    const result = await installTarget(root, getTarget("cursor")!, skillSrc, "project", true);

    expect(result.instructionAction).toBe("updated");
    expect(await readFile(instruction, "utf8")).toContain("<!-- repochan:setup:cursor begin -->");
    expect(await readFile(path.join(root, ".cursor", "skills", "repochan", "SKILL.md"), "utf8"))
      .toBe("# RepoChan\n");
  });

  it("is idempotent for its own file and removes only the owned setup", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-setup-idempotent-"));
    const skillSrc = path.join(root, "bundled-skills");
    await mkdir(path.join(skillSrc, "repochan"), { recursive: true });
    await writeFile(path.join(skillSrc, "repochan", "SKILL.md"), "# RepoChan\n");
    const cursor = getTarget("cursor")!;

    expect((await installTarget(root, cursor, skillSrc)).instructionAction).toBe("created");
    expect((await installTarget(root, cursor, skillSrc)).instructionAction).toBe("unchanged");
    expect((await uninstallTarget(root, cursor, "project", skillSrc)).instructionAction).toBe("removed");

    await expect(access(path.join(root, ".cursor", "rules", "repochan.mdc"))).rejects.toThrow();
    await expect(access(path.join(root, ".cursor", "skills"))).rejects.toThrow();
  });

  it("preserves custom skills in a native shared container", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-setup-mixed-skills-"));
    const skillSrc = path.join(root, "bundled-skills");
    await mkdir(path.join(skillSrc, "repochan"), { recursive: true });
    await writeFile(path.join(skillSrc, "repochan", "SKILL.md"), "# RepoChan\n");
    const codex = getTarget("codex")!;
    await installTarget(root, codex, skillSrc);
    const custom = path.join(root, ".codex", "skills", "my-custom", "SKILL.md");
    await mkdir(path.dirname(custom), { recursive: true });
    await writeFile(custom, "# Mine\n");

    expect((await uninstallTarget(root, codex, "project", skillSrc)).instructionAction).toBe("removed");

    expect(await readFile(custom, "utf8")).toBe("# Mine\n");
    await expect(access(path.join(root, ".codex", "skills", "repochan"))).rejects.toThrow();
    await expect(access(path.join(root, ".codex", "skills", ".repochan-version"))).rejects.toThrow();
    await expect(access(path.join(root, "AGENTS.md"))).rejects.toThrow();
  });

  it("preserves a same-named user skill when setup provenance is absent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-setup-unowned-same-name-"));
    const skillSrc = path.join(root, "bundled-skills");
    await mkdir(path.join(skillSrc, "repochan"), { recursive: true });
    await writeFile(path.join(skillSrc, "repochan", "SKILL.md"), "# Bundled\n");
    const userSkill = path.join(root, ".codex", "skills", "repochan", "SKILL.md");
    await mkdir(path.dirname(userSkill), { recursive: true });
    await writeFile(userSkill, "# User-owned RepoChan notes\n");

    expect((await uninstallTarget(root, getTarget("codex")!, "project", skillSrc)).instructionAction)
      .toBe("not-found");
    expect(await readFile(userSkill, "utf8")).toBe("# User-owned RepoChan notes\n");
  });

  it.each([
    ["cursor", path.join(".cursor", "rules", "repochan.mdc")],
    ["kiro", path.join(".kiro", "steering", "repochan.md")],
  ])("does not delete a %s file that merely mentions the marker text", async (agent, instructionRel) => {
    const root = await mkdtemp(path.join(os.tmpdir(), `repochan-setup-fake-${agent}-`));
    const skillSrc = path.join(root, "bundled-skills");
    await mkdir(path.join(skillSrc, "repochan"), { recursive: true });
    await writeFile(path.join(skillSrc, "repochan", "SKILL.md"), "# RepoChan\n");
    const instruction = path.join(root, instructionRel);
    const original = "My notes mention repochan:setup, but this is not an owned file.\n";
    await mkdir(path.dirname(instruction), { recursive: true });
    await writeFile(instruction, original);

    expect((await uninstallTarget(root, getTarget(agent)!, "project", skillSrc)).instructionAction)
      .toBe("not-found");
    expect(await readFile(instruction, "utf8")).toBe(original);
    expect(await isConfigured(root, getTarget(agent)!)).toBe(false);
  });
});

describe("setup marker-mode agents (grok/zcode/cline)", () => {
  // All three are marker agents sharing AGENTS.md — same contract as codex.
  // skillDir is the only per-agent variable (the .{id}/skills container).
  it.each([
    ["grok", ".grok"],
    ["zcode", ".zcode"],
    ["cline", ".cline"],
  ])("installs, is idempotent, and uninstalls cleanly for %s", async (agent, container) => {
    const root = await mkdtemp(path.join(os.tmpdir(), `repochan-setup-${agent}-`));
    const skillSrc = path.join(root, "bundled-skills");
    await mkdir(path.join(skillSrc, "repochan"), { recursive: true });
    await writeFile(path.join(skillSrc, "repochan", "SKILL.md"), "# RepoChan\n");
    const target = getTarget(agent)!;

    const first = await installTarget(root, target, skillSrc);
    expect(first.instructionAction).toBe("created");
    const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain(`<!-- repochan:setup:${agent} begin -->`);
    expect(agents).toContain(`<!-- repochan:setup:${agent} end -->`);
    expect(await readFile(path.join(root, container, "skills", "repochan", "SKILL.md"), "utf8"))
      .toBe("# RepoChan\n");
    expect(await isConfigured(root, target)).toBe(true);

    // Second install is a no-op.
    expect((await installTarget(root, target, skillSrc)).instructionAction).toBe("unchanged");

    // Custom user skill survives uninstall; AGENTS.md marker + skills removed.
    const custom = path.join(root, container, "skills", "my-custom", "SKILL.md");
    await mkdir(path.dirname(custom), { recursive: true });
    await writeFile(custom, "# Mine\n");

    expect((await uninstallTarget(root, target, "project", skillSrc)).instructionAction)
      .toBe("removed");
    expect(await readFile(custom, "utf8")).toBe("# Mine\n");
    await expect(access(path.join(root, container, "skills", "repochan"))).rejects.toThrow();
    await expect(access(path.join(root, container, "skills", ".repochan-version"))).rejects.toThrow();
    await expect(access(path.join(root, "AGENTS.md"))).rejects.toThrow();
    expect(await isConfigured(root, target)).toBe(false);
  });

  it("coexists with codex in the same AGENTS.md (shared instruction file)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-setup-shared-agents-"));
    const skillSrc = path.join(root, "bundled-skills");
    await mkdir(path.join(skillSrc, "repochan"), { recursive: true });
    await writeFile(path.join(skillSrc, "repochan", "SKILL.md"), "# RepoChan\n");

    const codex = getTarget("codex")!;
    const grok = getTarget("grok")!;
    await installTarget(root, codex, skillSrc);
    await installTarget(root, grok, skillSrc);

    const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain("repochan:setup:codex begin");
    expect(agents).toContain("repochan:setup:grok begin");

    // Removing one agent leaves the other's marker + skills intact.
    await uninstallTarget(root, codex, "project", skillSrc);
    const afterCodex = await readFile(path.join(root, "AGENTS.md"), "utf8");
    expect(afterCodex).not.toContain("repochan:setup:codex begin");
    expect(afterCodex).toContain("repochan:setup:grok begin");
    expect(await readFile(path.join(root, ".grok", "skills", "repochan", "SKILL.md"), "utf8"))
      .toBe("# RepoChan\n");
    expect(await isConfigured(root, grok)).toBe(true);
  });
});

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { performAnalysis } from "../src/analysis.js";

async function tempProject() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repochan-analysis-"));
  await mkdir(path.join(dir, "src"));
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ scripts: { test: "vitest" }, dependencies: { svelte: "latest" } }));
  await writeFile(path.join(dir, "README.md"), "# Sample\n\nA small sample project.\n");
  await writeFile(path.join(dir, "src", "index.ts"), "export const answer = 42;\n");
  await writeFile(path.join(dir, "src", "App.svelte"), "<h1>Sample</h1>\n");
  await mkdir(path.join(dir, ".repochan"));
  await writeFile(path.join(dir, ".repochan", "ignored.ts"), "export const ignored = true;\n");
  return dir;
}

describe("performAnalysis", () => {
  it("runs deterministic repository analysis without Pi context", async () => {
    const projectRoot = await tempProject();
    const analysis = await performAnalysis(projectRoot, { includeFileLists: true });

    expect(analysis.schemaVersion).toBe("repochan.analysis.v1");
    expect(analysis.context.basic.project_name).toBe(path.basename(projectRoot));
    expect(analysis.context.basic.readme_exists).toBe(true);
    expect(analysis.context.tech_stack.frameworks).toContain("Svelte");
    expect(analysis.context.file_structure.files).toContain("src/index.ts");
    expect(analysis.context.file_structure.files).not.toContain(".repochan/ignored.ts");
  });
});

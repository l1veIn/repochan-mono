import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeAnalysisArtifact } from "../src/analysis/write-artifact.js";

async function tempProject() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repochan-write-analysis-"));
  await mkdir(path.join(dir, "src"));
  await writeFile(path.join(dir, "README.md"), "# Project\n");
  await writeFile(path.join(dir, "src", "index.ts"), "export const value = 1;\n");
  return dir;
}

describe("writeAnalysisArtifact", () => {
  it("guards existing analysis unless overwrite is true", async () => {
    const projectRoot = await tempProject();
    await writeAnalysisArtifact(projectRoot, { includeFileLists: false });

    await expect(writeAnalysisArtifact(projectRoot, { includeFileLists: false })).rejects.toThrow(
      ".repochan/analysis.json already exists",
    );
  });

  it("archives previous analysis when overwriting by default", async () => {
    const projectRoot = await tempProject();
    const first = await writeAnalysisArtifact(projectRoot, { includeFileLists: false });
    const second = await writeAnalysisArtifact(projectRoot, { includeFileLists: false, overwrite: true, analysis: { analyst_note: "merged" } });

    expect(first.path).toBe(".repochan/analysis.json");
    expect(second.path).toBe(".repochan/analysis.json");
    expect(second.data).toMatchObject({ schemaVersion: "repochan.analysis.v1", analyst_note: "merged" });

    const versionsDir = path.join(projectRoot, ".repochan", "analysis.versions");
    const versions = (await readdir(versionsDir)).filter((file) => file.endsWith(".json"));
    expect(versions).toHaveLength(1);
    const archived = JSON.parse(await readFile(path.join(versionsDir, versions[0]), "utf8"));
    expect(archived.generatedAt).toBe(first.data.generatedAt);
  });
});

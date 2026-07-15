import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { enrichAnalysisArtifact, updateAnalysisArtifact, writeAnalysisArtifact } from "../src/analysis/write-artifact.js";

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
      ".repochan/analysis/current.json already exists",
    );
  });

  it("archives previous analysis when overwriting by default", async () => {
    const projectRoot = await tempProject();
    const first = await writeAnalysisArtifact(projectRoot, { includeFileLists: false });
    const second = await writeAnalysisArtifact(projectRoot, { includeFileLists: false, overwrite: true });

    expect(first.path).toBe(".repochan/analysis/current.json");
    expect(second.path).toBe(".repochan/analysis/current.json");
    expect(second.data).toMatchObject({ schemaVersion: "repochan.analysis.v1" });

    const versionsDir = path.join(projectRoot, ".repochan", "analysis", "versions");
    const versions = (await readdir(versionsDir)).filter((file) => file.endsWith(".json"));
    expect(versions).toHaveLength(1);
    const archived = JSON.parse(await readFile(path.join(versionsDir, versions[0]), "utf8"));
    expect(archived.generatedAt).toBe(first.data.generatedAt);
  });

  it("enriches analysis through the Core action and archives the prior artifact", async () => {
    const projectRoot = await tempProject();
    await writeAnalysisArtifact(projectRoot, { includeFileLists: false });
    const enriched = await enrichAnalysisArtifact(projectRoot, {
      preAnalysis: { productSummary: "A focused product summary" },
      abstract: { architecture: "A focused architecture summary" },
    });
    expect(enriched.data.preAnalysis).toEqual({ productSummary: "A focused product summary" });
    expect(enriched.data.abstract).toEqual({ architecture: "A focused architecture summary" });
    expect(enriched.data.enrichedAt).toBeTruthy();
  });

  it("updates analysis with a versioned deep merge patch", async () => {
    const projectRoot = await tempProject();
    const first = await writeAnalysisArtifact(projectRoot, {
      includeFileLists: false,
    });

    const updated = await updateAnalysisArtifact(projectRoot, {
      overwrite: true,
      reason: "Add model naming seed",
      patch: {
        context: {
          identity: {
            namingSeeds: {
              secondary: ["model", "schema"],
            },
          },
        },
      },
    });

    expect(updated.path).toBe(".repochan/analysis/current.json");
    expect(updated.data.context.identity.namingSeeds.primary).toContain(path.basename(projectRoot));
    expect(updated.data.context.identity.namingSeeds.secondary).toEqual(["model", "schema"]);
    expect(updated.data.context.identity.namingSeeds.rationale.join(" ")).toContain("Repository/product names are the primary naming source");
    expect(updated.data.revisionReason).toBe("Add model naming seed");
    expect(updated.data.updatedAt).toBeTruthy();

    const versionsDir = path.join(projectRoot, ".repochan", "analysis", "versions");
    const versions = (await readdir(versionsDir)).filter((file) => file.endsWith(".json"));
    expect(versions).toHaveLength(1);
    const archived = JSON.parse(await readFile(path.join(versionsDir, versions[0]), "utf8"));
    expect(archived.generatedAt).toBe(first.data.generatedAt);
  });
});

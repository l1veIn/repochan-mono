import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runStarterConfigure, runStarterPull, runStarterValidate } from "./starter.js";
import { getDefaultStarterId, getStarter, readStarterInstance } from "../lib/starter-loader.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function projectFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "repochan-starter-"));
  tempDirs.push(root);
  await mkdir(path.join(root, ".repochan", "analysis"), { recursive: true });
  await mkdir(path.join(root, ".repochan", "persona"), { recursive: true });
  await writeFile(path.join(root, ".repochan", "analysis", "current.json"), JSON.stringify({
    projectName: "Fixture Project",
    repositoryUrl: "https://example.test/fixture",
    preAnalysis: { summary: "Fixture summary" },
  }));
  await writeFile(path.join(root, ".repochan", "persona", "current.json"), JSON.stringify({
    mainColor: "#123456",
    secondaryColor: "#234567",
    accentColors: ["#345678", "#456789"],
    artStyle: "Precise",
    keyMotifs: ["node"],
    signaturePatterns: ["grid"],
  }));
  return root;
}

describe("starter v1 commands", () => {
  it("discovers minimal as the sole default through repochan/starter.json", async () => {
    expect(await getDefaultStarterId()).toBe("minimal");
    const starter = await getStarter("minimal");
    expect(starter.schemaVersion).toBe("repochan.starter.v1");
    expect(starter.config.site).toBe("repochan/site.json");
  });

  it("pulls, projects config, and validates an independent instance", async () => {
    const root = await projectFixture();
    const siteDir = path.join(root, "site");
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runStarterPull(root, { outputDir: siteDir, json: true });
    expect((await readStarterInstance(siteDir)).id).toBe("minimal");
    await runStarterConfigure(root, { outputDir: siteDir, json: true });
    await runStarterValidate(root, undefined, { outputDir: siteDir, json: true });

    const configured = JSON.parse(await readFile(path.join(siteDir, "repochan", "site.json"), "utf8"));
    expect(configured).toMatchObject({
      project: { name: "Fixture Project", repositoryUrl: "https://example.test/fixture" },
      theme: { primary: "#123456", base: "#234567", accents: ["#345678", "#456789"] },
      brand: { artStyle: "Precise", motifs: ["node"], patterns: ["grid"] },
    });
  });
});

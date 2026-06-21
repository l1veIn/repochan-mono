import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rel, walkProject } from "../src/analysis/walk.js";

async function tempProject() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repochan-walk-"));
  await mkdir(path.join(dir, "src"));
  await mkdir(path.join(dir, "ignored"));
  await mkdir(path.join(dir, "node_modules", "pkg"), { recursive: true });
  await mkdir(path.join(dir, ".repochan"));
  await mkdir(path.join(dir, ".repochan", "analysis"));
  await writeFile(path.join(dir, ".gitignore"), "ignored/\n*.tmp\n");
  await writeFile(path.join(dir, "src", "index.ts"), "export {};\n");
  await writeFile(path.join(dir, "ignored", "hidden.ts"), "ignored\n");
  await writeFile(path.join(dir, "node_modules", "pkg", "index.js"), "ignored\n");
  await writeFile(path.join(dir, ".repochan", "analysis", "current.json"), "{}\n");
  await writeFile(path.join(dir, "scratch.tmp"), "ignored\n");
  return dir;
}

describe("walkProject", () => {
  it("respects .gitignore and hard-skips node_modules and .repochan content", async () => {
    const projectRoot = await tempProject();
    const walked = await walkProject(projectRoot);
    const files = walked.files.map((file) => rel(projectRoot, file)).sort();
    const dirs = walked.dirs.map((dir) => rel(projectRoot, dir)).sort();

    expect(files).toContain("src/index.ts");
    expect(dirs).toContain("src");
    expect(files).not.toContain("ignored/hidden.ts");
    expect(files).not.toContain("node_modules/pkg/index.js");
    expect(files).not.toContain(".repochan/analysis/current.json");
    expect(files).not.toContain("scratch.tmp");
  });
});

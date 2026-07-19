import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CODE_EXTS, guessLanguage, sampleCoreCode } from "../src/analysis/sample.js";

/**
 * Build a project where the largest files are deliberately binary/non-code
 * (webp/png/json/md), so we can prove the allowlist keeps them out of
 * `core_samples` regardless of size ranking.
 *
 * The real code file is small so that, under the old denylist, the bigger
 * binary files would have been picked first by the size-descending heuristic.
 */
async function tempProjectWithBinaries() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repochan-sample-"));
  await mkdir(path.join(dir, "src"));

  // Small, real code file — would lose a size race against the binaries below.
  await writeFile(path.join(dir, "src", "index.ts"), "export const answer = 42;\n");

  // Large binary / non-code files. These must NOT be sampled.
  // webp is the reported regression; we also cover png/zip/json/md to lock the
  // allowlist behaviour in for the whole class.
  const big = "x".repeat(20000);
  await writeFile(path.join(dir, "hero.webp"), big);
  await writeFile(path.join(dir, "logo.png"), big);
  await writeFile(path.join(dir, "assets.zip"), big);
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "demo" }));
  await writeFile(path.join(dir, "README.md"), "# Demo\n".repeat(500));

  return dir;
}

function absoluteFiles(projectRoot: string, rels: string[]) {
  return rels.map((r) => path.join(projectRoot, ...r.split("/")));
}

describe("sampleCoreCode — allowlist filtering", () => {
  it("never samples binary image / archive / config / doc files, even when they are the largest", async () => {
    const projectRoot = await tempProjectWithBinaries();
    const files = absoluteFiles(projectRoot, [
      "src/index.ts",
      "hero.webp",
      "logo.png",
      "assets.zip",
      "package.json",
      "README.md",
    ]);

    const result = await sampleCoreCode(projectRoot, files, "typescript", {});
    const sampledPaths = result.sampled_files.map((f) => f.path);

    // The reported regression: .webp must not leak in.
    expect(sampledPaths).not.toContain("hero.webp");
    // And the rest of the non-code class.
    expect(sampledPaths).not.toContain("logo.png");
    expect(sampledPaths).not.toContain("assets.zip");
    expect(sampledPaths).not.toContain("package.json");
    expect(sampledPaths).not.toContain("README.md");

    // Real code is still sampled.
    expect(sampledPaths).toContain("src/index.ts");
  });

  it("treats webp explicitly: webp is not in CODE_EXTS even if it is the only file", async () => {
    // Lock the root cause at the constant level, not just behaviourally.
    expect(CODE_EXTS.has(".webp")).toBe(false);
    expect(CODE_EXTS.has(".png")).toBe(false);
    expect(CODE_EXTS.has(".bmp")).toBe(false);
    expect(CODE_EXTS.has(".avif")).toBe(false);
    expect(CODE_EXTS.has(".zip")).toBe(false);
    expect(CODE_EXTS.has(".json")).toBe(false);
    expect(CODE_EXTS.has(".md")).toBe(false);
    // And real code extensions are present.
    expect(CODE_EXTS.has(".ts")).toBe(true);
    expect(CODE_EXTS.has(".py")).toBe(true);
    expect(CODE_EXTS.has(".rs")).toBe(true);
  });

  it("labels unknown extensions as text and known ones with their language", () => {
    expect(guessLanguage("foo.ts")).toBe("typescript");
    expect(guessLanguage("foo.hpp")).toBe("c-header");
    expect(guessLanguage("foo.webp")).toBe("text");
    expect(guessLanguage("foo.unknownext")).toBe("text");
  });

  it("produces no sampled_files when the project contains only non-code files", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "repochan-sample-empty-"));
    await writeFile(path.join(projectRoot, "only.webp"), "x".repeat(20000));
    await writeFile(path.join(projectRoot, "data.json"), "{}");
    const files = absoluteFiles(projectRoot, ["only.webp", "data.json"]);

    const result = await sampleCoreCode(projectRoot, files, "other", {});
    expect(result.sampled_files).toEqual([]);
    expect(result.total_sampled_lines).toBe(0);
  });
});

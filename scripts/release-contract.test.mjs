import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  compareExtractedPackages,
  createGitWorktreeSnapshot,
  npmResultIsNotFound,
  registryCommandPlan,
  releasePackages,
  validatePackedRelease,
  validatePublicWorkspaceInventory,
} from "./release-contract.mjs";

function validInventory() {
  return releasePackages.map(({ name }) => ({ name, private: false }));
}

function validEntries() {
  const versions = new Map(releasePackages.map(({ name }, index) => [name, `0.1.${index}`]));
  return releasePackages.map(({ name }) => ({
    manifest: {
      name,
      version: versions.get(name),
      dependencies: name === "repochan"
        ? Object.fromEntries(releasePackages.slice(0, -1).map(({ name: dependency }) => [dependency, versions.get(dependency)]))
        : {},
    },
  }));
}

test("accepts a complete leaf-first packed release set", () => {
  assert.deepEqual(validatePackedRelease(validEntries(), validInventory()).order, [
    "@repochan/core@0.1.0",
    "@repochan/image-edit@0.1.1",
    "@repochan/image-gen@0.1.2",
    "@repochan/skill@0.1.3",
    "@repochan/templates@0.1.4",
    "@repochan/starters@0.1.5",
    "repochan@0.1.6",
  ]);
});

test("rejects a workspace protocol that escaped into a packed manifest", () => {
  const entries = validEntries();
  entries.at(-1).manifest.dependencies["@repochan/core"] = "workspace:*";
  assert.throws(() => validatePackedRelease(entries, validInventory()), /still contains.*workspace:\*/);
});

test("rejects stale local dependency versions", () => {
  const entries = validEntries();
  entries.at(-1).manifest.dependencies["@repochan/starters"] = "0.0.0";
  assert.throws(() => validatePackedRelease(entries, validInventory()), /must depend on the packed.*version/);
});

test("rejects publishing the CLI before one of its leaves", () => {
  const entries = validEntries();
  const cli = entries.pop();
  entries.splice(1, 0, cli);
  assert.throws(() => validatePackedRelease(entries, validInventory()), /must precede dependent package/);
});

test("rejects an incomplete release set", () => {
  assert.throws(() => validatePackedRelease(validEntries().slice(1), validInventory()), /Missing: @repochan\/core/);
});

test("rejects a CLI missing a required internal runtime dependency", () => {
  const entries = validEntries();
  delete entries.at(-1).manifest.dependencies["@repochan/core"];
  assert.throws(() => validatePackedRelease(entries, validInventory()), /missing required runtime dependency @repochan\/core/);
});

test("rejects public workspace inventory drift", () => {
  assert.throws(
    () => validatePublicWorkspaceInventory([...validInventory(), { name: "@repochan/new-public-package" }]),
    /unexpected: @repochan\/new-public-package/,
  );
});

test("package comparison normalizes manifest key order but detects payload drift", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "repochan-release-compare-"));
  const local = path.join(root, "local");
  const published = path.join(root, "published");
  await Promise.all([mkdir(path.join(local, "package"), { recursive: true }), mkdir(path.join(published, "package"), { recursive: true })]);
  await writeFile(path.join(local, "package", "package.json"), '{"name":"x","version":"1.0.0"}\n');
  await writeFile(path.join(published, "package", "package.json"), '{"version":"1.0.0","name":"x"}\n');
  await writeFile(path.join(local, "package", "index.js"), "export const x = 1;\n");
  await writeFile(path.join(published, "package", "index.js"), "export const x = 1;\n");
  assert.deepEqual(await compareExtractedPackages(local, published), []);

  await writeFile(path.join(published, "package", "index.js"), "export const x = 2;\n");
  assert.deepEqual(await compareExtractedPackages(local, published), [{ path: "package/index.js", kind: "content" }]);
});

test("fresh worktree snapshot includes current source but excludes ignored dist and node_modules", async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), "repochan-release-source-"));
  const snapshot = await mkdtemp(path.join(os.tmpdir(), "repochan-release-snapshot-"));
  await mkdir(path.join(source, "packages", "core", "dist"), { recursive: true });
  await mkdir(path.join(source, "node_modules", "x"), { recursive: true });
  await writeFile(path.join(source, ".gitignore"), "node_modules/\n**/dist/\n");
  await writeFile(path.join(source, "source.ts"), "export const source = 'tracked';\n");
  await writeFile(path.join(source, "untracked.mjs"), "export const fresh = true;\n");
  await writeFile(path.join(source, "packages", "core", "dist", "index.js"), "stale\n");
  await writeFile(path.join(source, "node_modules", "x", "index.js"), "stale\n");
  execFileSync("git", ["init", "--quiet"], { cwd: source });
  execFileSync("git", ["add", ".gitignore", "source.ts"], { cwd: source });
  await writeFile(path.join(source, "source.ts"), "export const source = 'working-tree';\n");

  await createGitWorktreeSnapshot(source, snapshot);
  assert.equal(await readFile(path.join(snapshot, "source.ts"), "utf8"), "export const source = 'working-tree';\n");
  assert.equal(await readFile(path.join(snapshot, "untracked.mjs"), "utf8"), "export const fresh = true;\n");
  await assert.rejects(access(path.join(snapshot, "packages", "core", "dist")));
  await assert.rejects(access(path.join(snapshot, "node_modules")));
});

test("registry command plan binds view and pack to publishConfig.registry", () => {
  const plan = registryCommandPlan(
    { name: "@repochan/core", version: "1.2.3", publishConfig: { registry: "https://target.invalid/custom" } },
    "/tmp/packs",
  );
  assert.equal(plan.registry, "https://target.invalid/custom/");
  assert.deepEqual(plan.viewArgs.slice(-2), ["--registry", plan.registry]);
  assert.deepEqual(plan.packArgs.slice(-2), ["--registry", plan.registry]);
  assert.equal(plan.viewArgs.includes("https://wrong-default.invalid/"), false);
});

test("npm 404 detection requires structured E404 output", () => {
  assert.equal(npmResultIsNotFound({ status: 1, stdout: '{"error":{"code":"E404"}}', stderr: "" }), true);
  assert.equal(npmResultIsNotFound({ status: 1, stdout: "", stderr: "mirror says E404 in prose" }), false);
  assert.equal(npmResultIsNotFound({ status: 0, stdout: '"1.0.0"', stderr: "" }), false);
});

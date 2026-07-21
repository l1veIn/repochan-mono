import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, unlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as tar from "tar";
import {
  compareExtractedPackages,
  createGitWorktreeSnapshot,
  detectCompatibilityDebt,
  detectReleaseSurfaceDebt,
  npmResultIsNotFound,
  normalizePackedArchive,
  parseReleaseManifest,
  registryCommandPlan,
  releaseCommandTimeout,
  releasePackages,
  resolveCleanGitSourceRef,
  scanReleaseSurfaceDebt,
  sha256File,
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
      license: "MIT",
      publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
      dependencies: name === "repochan"
        ? Object.fromEntries(releasePackages.slice(0, -1).filter(({ name: dependency }) => dependency !== "@repochan/starters").map(({ name: dependency }) => [dependency, versions.get(dependency)]))
        : {},
    },
    files: [{ path: "LICENSE" }, { path: "README.md" }],
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

test("compatibility debt gate is precise about current contracts", () => {
  assert.deepEqual(detectCompatibilityDebt("packages/cli/src/example.ts", [
    "const endpoint = 'OpenAI-compatible';",
    "const fallback = 'Starter runnable fallback';",
    "const assetType = 'hero_character_migrate';",
  ].join("\n")), []);
  assert.deepEqual(
    detectCompatibilityDebt("packages/cli/src/example.ts", "// Back-compat branch for legacy config\n").map(({ rule }) => rule),
    ["legacy-contract", "backward-compatibility"],
  );
  assert.equal(detectCompatibilityDebt("packages/skill/skills/x/SKILL.md", "旧实例继续走此分支").length, 1);
});

test("release surface gate rejects process history on every public document", () => {
  assert.equal(detectReleaseSurfaceDebt("README.md", "See ADR 4").length, 1);
  assert.equal(detectReleaseSurfaceDebt("ARCHITECTURE.md", "旧架构已移除").length, 1);
  assert.equal(detectReleaseSurfaceDebt("CHANGELOG.md", "ADR and a repositioning story").length, 2);
  assert.equal(detectReleaseSurfaceDebt("packages/cli/README.md", "This state predates the current protocol.").length, 1);
  assert.equal(detectReleaseSurfaceDebt("packages/cli/src/example.ts", "// Historical --agent alias.").length, 1);
  assert.equal(detectReleaseSurfaceDebt("packages/cli/src/example.ts", "// Previously handled in another branch.").length, 1);
  assert.equal(detectReleaseSurfaceDebt("README.md", "yolo / non-interactive CI skips every checkpoint").length, 1);
  assert.deepEqual(detectReleaseSurfaceDebt("README.md", "Current architecture and supported release contract."), []);
});

test("release surface gate rejects hidden internal planning directories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "repochan-release-surface-"));
  await Promise.all([
    mkdir(path.join(root, ".workspace", "plans"), { recursive: true }),
    mkdir(path.join(root, ".planning"), { recursive: true }),
  ]);
  const findings = await scanReleaseSurfaceDebt(root);
  assert.deepEqual(findings.map(({ rule }) => rule), ["internal-planning-directory", "internal-planning-directory"]);
});

test("rejects a workspace protocol that escaped into a packed manifest", () => {
  const entries = validEntries();
  entries.at(-1).manifest.dependencies["@repochan/core"] = "workspace:*";
  assert.throws(() => validatePackedRelease(entries, validInventory()), /still contains.*workspace:\*/);
});

test("rejects stale local dependency versions", () => {
  const entries = validEntries();
  entries.at(-1).manifest.dependencies["@repochan/templates"] = "0.0.0";
  assert.throws(() => validatePackedRelease(entries, validInventory()), /must depend on the packed.*version/);
});

test("rejects a CLI that bundles starters instead of syncing them on demand", () => {
  const entries = validEntries();
  entries.at(-1).manifest.dependencies["@repochan/starters"] = "0.1.5";
  assert.throws(() => validatePackedRelease(entries, validInventory()), /must not depend on @repochan\/starters/);
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

test("rejects a packed release without explicit public npm metadata", () => {
  const entries = validEntries();
  delete entries[0].manifest.publishConfig;
  assert.throws(() => validatePackedRelease(entries, validInventory()), /publish publicly/);
});

test("rejects a tarball without a license file", () => {
  const entries = validEntries();
  entries[0].files = [{ path: "README.md" }];
  assert.throws(() => validatePackedRelease(entries, validInventory()), /missing a license file/);
});

test("rejects compiled test artifacts in a public tarball", () => {
  const entries = validEntries();
  entries[0].files.push({ path: "dist/starter.test.js.map" });
  assert.throws(() => validatePackedRelease(entries, validInventory()), /compiled test artifact/);
});

test("release command timeout is finite and rejects unsafe values", () => {
  assert.equal(releaseCommandTimeout("120000"), 120000);
  assert.throws(() => releaseCommandTimeout("0"), /at least 1000/);
  assert.throws(() => releaseCommandTimeout("forever"), /at least 1000/);
});

test("release manifest parsing rejects duplicate top-level keys", () => {
  assert.deepEqual(parseReleaseManifest('{"name":"x","publishConfig":{"access":"public"}}'), {
    name: "x",
    publishConfig: { access: "public" },
  });
  assert.throws(
    () => parseReleaseManifest('{"name":"x","publishConfig":{},"publishConfig":{"access":"public"}}', "fixture"),
    /fixture contains duplicate top-level key\(s\): publishConfig/,
  );
  assert.throws(
    () => parseReleaseManifest('{"name":"x","\\u006eame":"y"}', "escaped fixture"),
    /escaped fixture contains duplicate top-level key\(s\): name/,
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

test("normalized package archives are byte-reproducible across manifest order and mtimes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "repochan-release-normalize-"));
  const rawArchives = [];
  for (const [index, manifest] of [
    '{"version":"1.0.0","name":"fixture","dependencies":{"z":"1","a":"1"}}\n',
    '{"dependencies":{"a":"1","z":"1"},"name":"fixture","version":"1.0.0"}\n',
  ].entries()) {
    const fixture = path.join(root, `fixture-${index}`, "package");
    await mkdir(fixture, { recursive: true });
    await writeFile(path.join(fixture, "package.json"), manifest);
    await writeFile(path.join(fixture, "index.js"), "export const fixture = true;\n");
    await utimes(path.join(fixture, "index.js"), new Date(index * 10_000), new Date(index * 10_000));
    const archive = path.join(root, `raw-${index}.tgz`);
    await tar.create({ cwd: path.dirname(fixture), file: archive, gzip: true }, ["package"]);
    rawArchives.push(archive);
  }
  const normalized = [path.join(root, "normalized-0.tgz"), path.join(root, "normalized-1.tgz")];
  await Promise.all(rawArchives.map((archive, index) =>
    normalizePackedArchive(archive, normalized[index], path.join(root, `work-${index}`)),
  ));
  assert.equal(await sha256File(normalized[0]), await sha256File(normalized[1]));
});

test("fresh worktree snapshot includes current source but excludes ignored dist and node_modules", async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), "repochan-release-source-"));
  const snapshot = await mkdtemp(path.join(os.tmpdir(), "repochan-release-snapshot-"));
  await mkdir(path.join(source, "packages", "core", "dist"), { recursive: true });
  await mkdir(path.join(source, "node_modules", "x"), { recursive: true });
  await writeFile(path.join(source, ".gitignore"), "node_modules/\n**/dist/\n");
  await writeFile(path.join(source, "source.ts"), "export const source = 'tracked';\n");
  await writeFile(path.join(source, "deleted.ts"), "export const deleted = true;\n");
  await writeFile(path.join(source, "untracked.mjs"), "export const fresh = true;\n");
  await writeFile(path.join(source, "packages", "core", "dist", "index.js"), "stale\n");
  await writeFile(path.join(source, "node_modules", "x", "index.js"), "stale\n");
  execFileSync("git", ["init", "--quiet"], { cwd: source });
  execFileSync("git", ["add", ".gitignore", "source.ts", "deleted.ts"], { cwd: source });
  await writeFile(path.join(source, "source.ts"), "export const source = 'working-tree';\n");
  await unlink(path.join(source, "deleted.ts"));

  await createGitWorktreeSnapshot(source, snapshot);
  assert.equal(await readFile(path.join(snapshot, "source.ts"), "utf8"), "export const source = 'working-tree';\n");
  assert.equal(await readFile(path.join(snapshot, "untracked.mjs"), "utf8"), "export const fresh = true;\n");
  await assert.rejects(access(path.join(snapshot, "deleted.ts")));
  await assert.rejects(access(path.join(snapshot, "packages", "core", "dist")));
  await assert.rejects(access(path.join(snapshot, "node_modules")));
});

test("release source refs require a clean repository and resolve to one commit", async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), "repochan-release-ref-"));
  execFileSync("git", ["init", "--quiet"], { cwd: source });
  await writeFile(path.join(source, "source.ts"), "export const source = true;\n");
  execFileSync("git", ["add", "source.ts"], { cwd: source });
  execFileSync("git", ["-c", "user.name=RepoChan Test", "-c", "user.email=test@repochan.invalid", "commit", "--quiet", "-m", "fixture"], { cwd: source });
  assert.match(resolveCleanGitSourceRef(source, "HEAD"), /^[0-9a-f]{40}$/);

  await writeFile(path.join(source, "untracked.txt"), "drift\n");
  assert.throws(() => resolveCleanGitSourceRef(source, "HEAD"), /requires a clean worktree/);
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

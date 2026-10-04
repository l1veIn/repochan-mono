import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkArchitecture, internalImports, manifestViolations, packageContracts, permittedDevelopmentProbe } from "./architecture-contract.mjs";

test("import detection covers real syntax, including type/dynamic imports, without matching comments", () => {
  const source = `// import x from '@repochan/cli';
    import type { T } from '@repochan/core';
    export { a } from '@repochan/image-gen';
    const b = import('@repochan/image-edit');
    const c = require('@repochan/core/private');
    type D = import('@repochan/browse').D;`;
  assert.deepEqual(internalImports(source), ["@repochan/core", "@repochan/image-gen", "@repochan/image-edit", "@repochan/core/private", "@repochan/browse"]);
});

test("createRequire aliases and chained calls cannot bypass the import check", () => {
  const source = `import { createRequire as factory } from 'node:module';
    import * as moduleApi from 'node:module';
    const load = factory(import.meta.url);
    load('@repochan/core');
    load.resolve('@repochan/templates/package.json');
    factory(import.meta.url)('@repochan/image-gen');
    moduleApi.createRequire(import.meta.url)('@repochan/browse');`;
  assert.deepEqual(internalImports(source), ["@repochan/core", "@repochan/templates/package.json", "@repochan/image-gen", "@repochan/browse"]);
});

test("the optional development Starter metadata probe does not authorize runtime imports or other callers", () => {
  const file = "packages/cli/src/lib/starter-loader.ts";
  const site = { kind: "resolve", specifier: "@repochan/starters/package.json" };
  assert.equal(permittedDevelopmentProbe(file, site), true);
  assert.equal(permittedDevelopmentProbe(file, { ...site, kind: "import" }), false);
  assert.equal(permittedDevelopmentProbe(file, { ...site, specifier: "@repochan/starters" }), false);
  assert.equal(permittedDevelopmentProbe("packages/core/src/index.ts", site), false);
});

test("relative paths cannot bypass package boundaries even when the destination package is an allowed dependency", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "repochan-architecture-"));
  try {
    for (const directory of Object.keys(packageContracts)) {
      const base = path.join(root, "packages", directory);
      await mkdir(path.join(base, "src"), { recursive: true });
      const manifest = directory === "cli" ? { name: "repochan", bin: { repochan: "dist/index.js" }, dependencies: { "@repochan/core": "1" } } : {};
      await writeFile(path.join(base, "package.json"), JSON.stringify(manifest));
    }
    await writeFile(path.join(root, "packages/core/src/index.ts"), "import '../../image-gen/src/index.js';");
    await writeFile(path.join(root, "packages/cli/src/index.ts"), "import '../../core/src/index.js';");
    const findings = await checkArchitecture(root);
    assert.equal(findings.length, 2);
    assert.ok(findings.every(({ reason }) => reason.startsWith("cross-package relative import:")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("leaves cannot gain cross-package runtime dependencies, including optional and peer paths", () => {
  assert.deepEqual(manifestViolations("core", { dependencies: { "@repochan/image-gen": "workspace:*" } }), ["forbidden dependencies: @repochan/image-gen"]);
  assert.deepEqual(manifestViolations("image-edit", { optionalDependencies: { repochan: "1" }, peerDependencies: { "@repochan/core": "1" } }), ["forbidden optionalDependencies: repochan", "forbidden peerDependencies: @repochan/core"]);
  assert.deepEqual(manifestViolations("browse", { dependencies: { "@repochan/core": "workspace:*" } }), []);
});

test("a new top-level package cannot silently add a second binding outside the contract inventory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "repochan-new-package-"));
  try {
    for (const directory of Object.keys(packageContracts)) {
      const base = path.join(root, "packages", directory);
      await mkdir(base, { recursive: true });
      const manifest = directory === "cli" ? { name: "repochan", bin: { repochan: "dist/index.js" } } : {};
      await writeFile(path.join(base, "package.json"), JSON.stringify(manifest));
    }
    const extra = path.join(root, "packages/second-binding");
    await mkdir(extra);
    await writeFile(path.join(extra, "package.json"), JSON.stringify({ name: "second-binding", bin: { second: "index.js" } }));
    // Source Starter package manifests are scaffold data within the registered package.
    await mkdir(path.join(root, "packages/starters/minimal"));
    await writeFile(path.join(root, "packages/starters/minimal/package.json"), JSON.stringify({ private: true }));
    assert.deepEqual(await checkArchitecture(root), [{
      file: "packages/second-binding/package.json",
      reason: "workspace package has no registered architecture contract",
    }]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("only CLI publishes a bin, and data packages expose no runtime entry point", () => {
  assert.deepEqual(manifestViolations("cli", { name: "repochan", bin: { repochan: "dist/index.js" } }), []);
  assert.equal(manifestViolations("core", { bin: "index.js" }).length, 1);
  assert.equal(manifestViolations("skill", { exports: { ".": "index.js" } }).length, 1);
  assert.equal(manifestViolations("cli", { name: "repochan", bin: { repochan: "x", other: "y" } }).length, 1);
});

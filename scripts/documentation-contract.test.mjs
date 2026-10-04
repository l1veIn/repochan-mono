import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkDocumentation, documentLinks } from "./documentation-contract.mjs";

test("links include Markdown, reference links, picture sources, and encoded names, excluding examples", () => {
  const source = '[a](./guide.md "Guide")\n![b](<./image with spaces.png>)\n<source srcset="./dark.webp">\n[x]: ./ref.md\n`[not](./code.md)`\n```md\n[a](./example.md)\n```';
  assert.deepEqual(documentLinks(source).map(({ target }) => target), ["./guide.md", "./image with spaces.png", "./dark.webp", "./ref.md"]);
});

test("srcset checks each candidate URL and keeps commas inside data URLs", () => {
  const source = '<img srcset="./small.png 1x, ./large.png 2x">\n<source srcset="data:image/png;base64,AAAA 1x, ./fallback.png 2x">';
  assert.deepEqual(documentLinks(source).map(({ target }) => target), ["./small.png", "./large.png", "data:image/png;base64,AAAA", "./fallback.png"]);
});

test("a deleted tracked link target cannot pass just because its path remains in the inventory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "repochan-docs-deleted-"));
  try {
    await writeFile(path.join(root, "README.md"), "[gone](./gone.md)");
    const findings = await checkDocumentation(root, new Set(["README.md", "gone.md"]));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].reason, "missing on disk");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("local files must belong to the source inventory, even when present on disk", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "repochan-docs-"));
  try {
    await writeFile(path.join(root, "README.md"), "[local](./private.json)\n[good](./guide%20one.md)\n[outside](../secret.md)");
    await writeFile(path.join(root, "private.json"), "{}");
    await writeFile(path.join(root, "guide one.md"), "# Guide");
    const findings = await checkDocumentation(root, new Set(["README.md", "guide one.md"]));
    assert.deepEqual(findings.map(({ reason }) => reason), ["missing from source inventory", "outside repository"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a repository-valid link may still be unavailable after skill installation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "repochan-skill-docs-"));
  try {
    const skill = "packages/skill/skills/repochan/SKILL.md";
    await mkdir(path.dirname(path.join(root, skill)), { recursive: true });
    await writeFile(path.join(root, skill), "[outside](../../TERMINOLOGY.md)");
    await writeFile(path.join(root, "packages/skill/TERMINOLOGY.md"), "# Terms");
    const findings = await checkDocumentation(root, new Set([skill, "packages/skill/TERMINOLOGY.md"]));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].reason, "not available in installed skills");
  } finally { await rm(root, { recursive: true, force: true }); }
});

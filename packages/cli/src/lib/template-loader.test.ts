import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadTemplate } from "./template-loader.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function loadFixture(yaml: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repochan-template-"));
  tempDirs.push(dir);
  const file = path.join(dir, "fixture.yaml");
  await writeFile(file, yaml, "utf8");
  return loadTemplate(file);
}

describe("template loader", () => {
  it("parses size, inline tags, grid booleans, and literal prompt blocks", async () => {
    const template = await loadFixture(`
id: "official/test"
asset_type: "poster"
label: "Test"
tags: ["poster", "design"]
size: "1536x1024"
grid:
  rows: 2
  cols: 3
  sliceable: false
  cell_keys:
    - "welcome"
    - "empty"
    - "loading"
    - "error"
    - "success"
    - "cozy"
prompt_template: |
  first line, {{character_visual}},
  second line
constraints:
  - "solid background"
`);

    expect(template).toMatchObject({
      id: "official/test",
      tags: ["poster", "design"],
      size: "1536x1024",
      width: 1536,
      height: 1024,
      aspectRatio: "3:2",
      grid: { rows: 2, cols: 3, sliceable: false, cellKeys: ["welcome", "empty", "loading", "error", "success", "cozy"] },
      promptTemplate: "first line, {{character_visual}},\nsecond line\n",
      constraints: ["solid background"],
    });
  });

  it("supports stripped literal blocks", async () => {
    const template = await loadFixture(`
id: official/stripped
asset_type: icon
label: Stripped
size: "1024x1024"
prompt_template: |-
  one line
  two lines
constraints: []
`);

    expect(template.promptTemplate).toBe("one line\ntwo lines");
  });

  it("rejects non-canonical size aliases and missing prompt templates", async () => {
    await expect(loadFixture(`
id: official/noncanonical
asset_type: banner
label: Noncanonical
width: 1536
height: 864
aspect_ratio: "21:9"
constraints: []
`)).rejects.toThrow(/Unknown template field 'width'/);
  });

  it("rejects missing ids and invalid grid cardinality", async () => {
    await expect(loadFixture(`
asset_type: icon
label: Missing id
size: "1024x1024"
prompt_template: "draw"
constraints: []
`)).rejects.toThrow(/field 'id'/);
    await expect(loadFixture(`
id: official/grid
asset_type: icon
label: Grid
size: "1024x1024"
grid:
  rows: 2
  cols: 2
  sliceable: true
  cell_keys: ["one"]
prompt_template: "draw"
constraints: []
`)).rejects.toThrow(/name every grid cell/);
  });
});

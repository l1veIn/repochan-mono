import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getStartersCacheDir,
  listStarters,
  readCachedStartersVersion,
  resolveStarterSource,
  STARTERS_DIR_ENV,
} from "./starter-loader.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repochan-loader-"));
  tempDirs.push(dir);
  return dir;
}

function manifest(id: string) {
  return {
    schemaVersion: "repochan.starter.v1",
    id,
    name: `Fixture ${id}`,
    description: "loader fixture",
    tags: ["fixture"],
    previews: { desktop: "repochan/previews/desktop.webp", mobile: "repochan/previews/mobile.webp" },
    config: { site: "repochan/site.json", assets: "repochan/assets.json", i18nDir: "repochan/i18n" },
    content: { defaultLocale: "en", supportedLocales: ["en"] },
    assets: [],
  };
}

async function writeStarter(root: string, id: string) {
  const dir = path.join(root, id);
  await mkdir(path.join(dir, "repochan"), { recursive: true });
  await writeFile(path.join(dir, "repochan", "starter.json"), JSON.stringify(manifest(id)));
  return dir;
}

/** A starters root (cache-shaped) holding the given starter ids. */
async function startersRoot(...ids: string[]) {
  const root = await tempDir();
  for (const id of ids) await writeStarter(root, id);
  return root;
}

describe("starter source resolution", () => {
  it("prefers --from over env, cache, and bundled", async () => {
    const from = await startersRoot("from-starter");
    const envDir = await startersRoot("env-starter");
    const home = await tempDir();
    const cache = getStartersCacheDir(home);
    await writeStarter(cache, "cache-starter");
    const source = await resolveStarterSource({
      from,
      env: { [STARTERS_DIR_ENV]: envDir },
      homeDir: home,
      bundledDir: await startersRoot("bundled-starter"),
    });
    expect(source).toMatchObject({ kind: "dir", dir: from, via: "flag" });
    expect((await listStarters({ from })).map((starter) => starter.id)).toEqual(["from-starter"]);
  });

  it("prefers REPOCHAN_STARTERS_DIR over cache and bundled", async () => {
    const envDir = await startersRoot("env-starter");
    const home = await tempDir();
    await writeStarter(getStartersCacheDir(home), "cache-starter");
    const source = await resolveStarterSource({
      env: { [STARTERS_DIR_ENV]: envDir },
      homeDir: home,
      bundledDir: await startersRoot("bundled-starter"),
    });
    expect(source).toMatchObject({ kind: "dir", dir: envDir, via: "env" });
    const starters = await listStarters({ env: { [STARTERS_DIR_ENV]: envDir }, homeDir: home });
    expect(starters.map((starter) => [starter.id, starter.source])).toEqual([["env-starter", "dir"]]);
  });

  it("prefers the user-level cache over the bundled package and records its version", async () => {
    const home = await tempDir();
    const cache = getStartersCacheDir(home);
    await writeStarter(cache, "cache-starter");
    await writeFile(path.join(cache, "VERSION"), "1.2.3\n");
    const source = await resolveStarterSource({
      env: {},
      homeDir: home,
      bundledDir: await startersRoot("bundled-starter"),
    });
    expect(source).toMatchObject({ kind: "cache", dir: cache, version: "1.2.3" });
    const starters = await listStarters({ env: {}, homeDir: home });
    expect(starters.map((starter) => [starter.id, starter.source])).toEqual([["cache-starter", "cache"]]);
    expect(await readCachedStartersVersion(cache)).toBe("1.2.3");
  });

  it("falls back to the bundled workspace package in dev", async () => {
    const home = await tempDir();
    const source = await resolveStarterSource({ env: {}, homeDir: home });
    expect(source?.kind).toBe("bundled");
    const starters = await listStarters({ env: {}, homeDir: home });
    expect(starters.some((starter) => starter.id === "minimal" && starter.source === "bundled")).toBe(true);
  });

  it("returns null on a fresh install with no cache and no bundled package", async () => {
    const home = await tempDir();
    await expect(resolveStarterSource({ env: {}, homeDir: home, bundledDir: null })).resolves.toBeNull();
    await expect(listStarters({ env: {}, homeDir: home, bundledDir: null })).resolves.toEqual([]);
  });
});

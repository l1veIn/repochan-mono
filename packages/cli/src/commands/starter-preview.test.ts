import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveStarterForPreview } from "./starter-preview.js";

function starterManifest(id: string) {
  return {
    schemaVersion: "repochan.starter.v1",
    id,
    name: `Fixture ${id}`,
    tags: ["fixture"],
    previews: { desktop: "repochan/previews/desktop.webp", mobile: "repochan/previews/mobile.webp" },
    config: { site: "repochan/site.json", assets: "repochan/assets.json", i18nDir: "repochan/i18n" },
    content: { defaultLocale: "en", supportedLocales: ["en"] },
    assets: [],
  };
}

describe("starter preview resolution", () => {
  let fixtureRoot: string;
  let emptyHome: string;

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-starter-preview-"));
    emptyHome = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-empty-home-"));
    const starterDir = path.join(fixtureRoot, "tiny");
    await fs.mkdir(path.join(starterDir, "repochan", "previews"), { recursive: true });
    await fs.writeFile(path.join(starterDir, "repochan", "starter.json"), JSON.stringify(starterManifest("tiny"), null, 2));
  });

  afterAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
    await fs.rm(emptyHome, { recursive: true, force: true });
  });

  it("resolves a starter from an explicit --from source", async () => {
    const starter = await resolveStarterForPreview("tiny", { from: fixtureRoot });
    expect(starter.id).toBe("tiny");
    expect(starter.dir).toBe(path.join(fixtureRoot, "tiny"));
  });

  it("unknown ids fail with the available list", async () => {
    await expect(resolveStarterForPreview("nope", { from: fixtureRoot })).rejects.toThrow(/Unknown starter 'nope'.*tiny/s);
  });

  it("no source at all fails sync-first", async () => {
    await expect(
      resolveStarterForPreview("tiny", { env: {}, homeDir: emptyHome, bundledDir: null }),
    ).rejects.toThrow(/No starters available/);
  });
});

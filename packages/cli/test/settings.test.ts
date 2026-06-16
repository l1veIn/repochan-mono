import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_REPOCHAN_SETTINGS,
  loadRepoChanSettings,
  saveRepoChanSettings,
  settingsPath,
} from "../src/app/settings.js";

const oldHome = process.env.REPOCHAN_HOME;

async function tempHome() {
  const home = await mkdtemp(path.join(tmpdir(), "repochan-home-"));
  process.env.REPOCHAN_HOME = home;
  return home;
}

afterEach(() => {
  if (oldHome === undefined) delete process.env.REPOCHAN_HOME;
  else process.env.REPOCHAN_HOME = oldHome;
});

describe("RepoChan CLI settings", () => {
  it("uses defaults when settings.yaml is missing", async () => {
    await tempHome();

    await expect(loadRepoChanSettings()).resolves.toEqual(DEFAULT_REPOCHAN_SETTINGS);
  });

  it("saves and loads YAML settings without touching Pi auth files", async () => {
    const home = await tempHome();
    const settings = { language: "en" as const, defaultGoal: "project icon", openAppAfterWizard: false, sessionPolicy: "new" as const };

    await saveRepoChanSettings(settings);

    expect(settingsPath()).toBe(path.join(home, "settings.yaml"));
    expect(await loadRepoChanSettings()).toEqual(settings);
    expect(await readFile(settingsPath(), "utf8")).toContain("defaultGoal: project icon");
  });

  it("reports invalid YAML with the settings path", async () => {
    const home = await tempHome();
    await saveRepoChanSettings(DEFAULT_REPOCHAN_SETTINGS);
    await import("node:fs/promises").then((fs) => fs.writeFile(path.join(home, "settings.yaml"), "language: [", "utf8"));

    await expect(loadRepoChanSettings()).rejects.toThrow("Invalid RepoChan settings");
  });
});

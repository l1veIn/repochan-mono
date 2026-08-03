import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  resolveNpmInvocation,
  resolveStarterChannelFromPackument,
  resolveTarExtractionArgs,
  runStarterSync,
} from "./starter-sync.js";
import { getStartersCacheDir, listStarters, resolveStarterSource } from "../lib/starter-loader.js";

const execFileAsync = promisify(execFile);

const tempDirs: string[] = [];
let fixtureRoot: string;
let fixtureTarball: string;

async function tempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repochan-sync-"));
  tempDirs.push(dir);
  return dir;
}

beforeAll(async () => {
  // Local fixture registry stand-in: a real .tgz with a flattened
  // package/<starter-id>/repochan/starter.json layout, built with system tar.
  fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "repochan-sync-fixture-"));
  const packageRoot = path.join(fixtureRoot, "package");
  await mkdir(path.join(packageRoot, "fixture-starter", "repochan"), { recursive: true });
  await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ name: "@repochan/starters", version: "9.9.9" }));
  await writeFile(path.join(packageRoot, "fixture-starter", "repochan", "starter.json"), JSON.stringify({
    schemaVersion: "repochan.starter.v1",
    id: "fixture-starter",
    name: "Fixture Starter",
    description: "sync fixture",
    tags: ["fixture"],
    previews: { desktop: "repochan/previews/desktop.webp", mobile: "repochan/previews/mobile.webp" },
    config: { site: "repochan/site.json", assets: "repochan/assets.json", i18nDir: "repochan/i18n" },
    content: { defaultLocale: "en", supportedLocales: ["en"] },
    assets: [],
  }));
  fixtureTarball = path.join(fixtureRoot, "repochan-starters-9.9.9.tgz");
  const createArgs = process.platform === "win32"
    ? ["-czf", fixtureTarball.replaceAll("\\", "/"), "--force-local", "-C", fixtureRoot.replaceAll("\\", "/"), "package"]
    : ["-czf", fixtureTarball, "-C", fixtureRoot, "package"];
  await execFileAsync("tar", createArgs);
});

afterAll(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function fixtureDeps(homeDir: string) {
  return {
    homeDir,
    resolveLatest: async () => "9.9.9",
    download: async (_version: string, destDir: string) => {
      const destination = path.join(destDir, path.basename(fixtureTarball));
      await copyFile(fixtureTarball, destination);
      return destination;
    },
  };
}

describe("starter sync", () => {
  it("routes npm through the Windows command processor only on Windows", () => {
    expect(resolveNpmInvocation(["view", "@repochan/starters@latest", "version"], "win32", "C:\\Windows\\System32\\cmd.exe"))
      .toEqual({
        command: "C:\\Windows\\System32\\cmd.exe",
        args: ["/d", "/s", "/c", "npm", "view", "@repochan/starters@latest", "version"],
      });
    expect(resolveNpmInvocation(["view", "@repochan/starters@latest", "version"], "linux"))
      .toEqual({
        command: "npm",
        args: ["view", "@repochan/starters@latest", "version"],
      });
  });

  it("scopes the tar force-local workaround to Windows", () => {
    expect(resolveTarExtractionArgs("C:\\tmp\\starters.tgz", "C:\\tmp\\out", "win32"))
      .toEqual(["-xzf", "C:/tmp/starters.tgz", "--force-local", "-C", "C:/tmp/out"]);
    expect(resolveTarExtractionArgs("/tmp/starters.tgz", "/tmp/out", "darwin"))
      .toEqual(["-xzf", "/tmp/starters.tgz", "-C", "/tmp/out"]);
    expect(resolveTarExtractionArgs("/tmp/starters.tgz", "/tmp/out", "linux"))
      .toEqual(["-xzf", "/tmp/starters.tgz", "-C", "/tmp/out"]);
  });

  it.runIf(process.platform === "win32")("can execute npm through the Windows invocation", async () => {
    const invocation = resolveNpmInvocation(["--version"]);
    const { stdout } = await execFileAsync(invocation.command, invocation.args);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("downloads, flattens, and publishes the cache atomically with a VERSION record", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const homeDir = await tempDir();
    const result = await runStarterSync("", { json: true }, fixtureDeps(homeDir)) as any;
    expect(result).toMatchObject({ ok: true, channel: "latest", version: "9.9.9", updated: true });

    const cacheDir = getStartersCacheDir(homeDir);
    expect(await readFile(path.join(cacheDir, "VERSION"), "utf8")).toBe("9.9.9\n");
    const manifest = JSON.parse(await readFile(path.join(cacheDir, "fixture-starter", "repochan", "starter.json"), "utf8"));
    expect(manifest.id).toBe("fixture-starter");

    // The synced cache takes priority in source resolution.
    const source = await resolveStarterSource({ env: {}, homeDir });
    expect(source).toMatchObject({ kind: "cache", version: "9.9.9" });
    const starters = await listStarters({ env: {}, homeDir });
    expect(starters.map((starter) => [starter.id, starter.source])).toEqual([["fixture-starter", "cache"]]);
  });

  it("resolves an explicit next channel instead of the default latest channel", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const channels: string[] = [];
    const versions: string[] = [];
    const makeDeps = (homeDir: string) => ({
      homeDir,
      resolveLatest: async (channel: string) => {
        channels.push(channel);
        return channel === "next" ? "0.2.0" : "0.1.0";
      },
      download: async (version: string, destDir: string) => {
        versions.push(version);
        const destination = path.join(destDir, path.basename(fixtureTarball));
        await copyFile(fixtureTarball, destination);
        return destination;
      },
    });

    const latest = await runStarterSync("", { json: true }, makeDeps(await tempDir())) as any;
    const next = await runStarterSync("", { json: true, channel: "next" }, makeDeps(await tempDir())) as any;

    expect(latest).toMatchObject({ channel: "latest", version: "0.1.0" });
    expect(next).toMatchObject({ channel: "next", version: "0.2.0" });
    expect(channels).toEqual(["latest", "next"]);
    expect(versions).toEqual(["0.1.0", "0.2.0"]);
  });

  it("rejects a channel that is not a simple npm dist-tag", async () => {
    await expect(runStarterSync("", { channel: "next --registry=https://example.invalid" }, fixtureDeps(await tempDir())))
      .rejects.toThrow(/simple npm dist-tag/);
  });

  it("selects the requested channel from an HTTPS fallback packument", () => {
    const packument = { "dist-tags": { latest: "0.1.0", next: "0.2.0" } };
    expect(resolveStarterChannelFromPackument(packument, "latest")).toBe("0.1.0");
    expect(resolveStarterChannelFromPackument(packument, "next")).toBe("0.2.0");
    expect(() => resolveStarterChannelFromPackument(packument, "beta")).toThrow(/dist-tags\.beta/);
  });

  it("is a no-op when the cache already matches latest", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const homeDir = await tempDir();
    const deps = fixtureDeps(homeDir);
    await runStarterSync("", { json: true }, deps);

    let downloads = 0;
    const again = await runStarterSync("", {}, {
      ...deps,
      download: async (version, destDir) => {
        downloads += 1;
        return deps.download(version, destDir);
      },
    }) as any;
    expect(again.updated).toBe(false);
    expect(downloads).toBe(0);
    expect(String(log.mock.calls.at(-1)?.[0])).toMatch(/already up to date \(cached@9\.9\.9\)/);
  });

  it("re-downloads with --force even when the cache is current", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const homeDir = await tempDir();
    const deps = fixtureDeps(homeDir);
    await runStarterSync("", { json: true }, deps);
    const forced = await runStarterSync("", { json: true, force: true }, deps) as any;
    expect(forced.updated).toBe(true);
  });

  it("leaves the old cache untouched when the download fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const homeDir = await tempDir();
    await runStarterSync("", { json: true }, fixtureDeps(homeDir));
    const cacheDir = getStartersCacheDir(homeDir);

    await expect(runStarterSync("", { json: true }, {
      homeDir,
      resolveLatest: async () => "10.0.0",
      download: async () => {
        throw new Error("ENOTFOUND registry.npmjs.org");
      },
    })).rejects.toThrow(/Failed to sync|ENOTFOUND/);

    expect(await readFile(path.join(cacheDir, "VERSION"), "utf8")).toBe("9.9.9\n");
    const starters = await listStarters({ env: {}, homeDir });
    expect(starters.map((starter) => starter.id)).toEqual(["fixture-starter"]);
  });
});

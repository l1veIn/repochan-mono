import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IMAGE_ML_MANIFEST,
  IMAGE_ML_ROOT_ENV,
  IMAGE_ML_RUNTIME_PACKAGE,
  IMAGE_ML_RUNTIME_VERSION,
  ensureImageMlCapability,
  getImageMlCapabilityStatus,
  getImageMlRuntimeRoot,
  installImageMlCapability,
} from "./image-ml-capability.js";
import { runImageMlInstall, runImageMlStatus } from "../commands/image-ml.js";

vi.mock("node:child_process", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:child_process")>(),
  spawn: vi.fn(),
}));

const tempDirs: string[] = [];
const originalRoot = process.env[IMAGE_ML_ROOT_ENV];

afterEach(async () => {
  vi.restoreAllMocks();
  if (originalRoot === undefined) delete process.env[IMAGE_ML_ROOT_ENV];
  else process.env[IMAGE_ML_ROOT_ENV] = originalRoot;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempHome(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repochan-image-ml-"));
  tempDirs.push(dir);
  return dir;
}

async function fakeInstall(staging: string, packageSpec: string): Promise<void> {
  expect(packageSpec).toBe(`${IMAGE_ML_RUNTIME_PACKAGE}@${IMAGE_ML_RUNTIME_VERSION}`);
  const packageRoot = path.join(staging, "node_modules", "@imgly", "background-removal-node");
  const dist = path.join(packageRoot, "dist");
  await mkdir(dist, { recursive: true });
  await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({
    name: IMAGE_ML_RUNTIME_PACKAGE,
    version: IMAGE_ML_RUNTIME_VERSION,
    main: "dist/index.cjs",
  }));
  await writeFile(path.join(dist, "index.cjs"), "module.exports = {};\n");
  const resources: Record<string, unknown> = {};
  for (const model of ["small", "medium"]) {
    const hash = `${model}-chunk`;
    resources[`/models/${model}`] = { chunks: [{ hash, offsets: [0, 1] }], size: 1 };
    await writeFile(path.join(dist, hash), model);
  }
  await writeFile(path.join(dist, "resources.json"), JSON.stringify(resources));
}

const resolveRuntime = (runtimeRoot: string) => path.join(runtimeRoot, "node_modules", "@imgly", "background-removal-node", "dist", "index.cjs");

describe("image ML capability", () => {
  it("uses the Windows npm command processor in the real default install binding", async () => {
    const homeDir = await tempHome();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { ...platform, value: "win32" });
    vi.mocked(spawn).mockImplementation((_command, args) => {
      const argumentsList = args as string[];
      const staging = argumentsList[argumentsList.indexOf("--prefix") + 1];
      const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
      void fakeInstall(staging, argumentsList.at(-1)!).then(
        () => child.emit("close", 0),
        (error) => child.emit("error", error),
      );
      return child as ReturnType<typeof spawn>;
    });

    try {
      expect((await installImageMlCapability({}, { homeDir, resolveRuntime })).installed).toBe(true);
      expect(spawn).toHaveBeenCalledWith(process.env.ComSpec || "cmd.exe", expect.arrayContaining([
        "/d", "/s", "/c", "npm", "install", "--prefix",
      ]), expect.any(Object));
    } finally {
      Object.defineProperty(process, "platform", platform);
    }
  });

  it("reports a missing capability without installing or accessing the network", async () => {
    const homeDir = await tempHome();
    const npmInstall = vi.fn();
    const status = await getImageMlCapabilityStatus({ homeDir, npmInstall });
    expect(status).toMatchObject({
      installed: false,
      valid: false,
      reason: "not installed",
      installCommand: "repochan image edit ml install",
    });
    expect(npmInstall).not.toHaveBeenCalled();
  });

  it("installs the pinned runtime atomically, validates bundled models, and emits parseable JSON", async () => {
    const homeDir = await tempHome();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const npmInstall = vi.fn(fakeInstall);
    const deps = { homeDir, npmInstall, resolveRuntime, now: () => new Date("2026-07-22T00:00:00.000Z") };

    await runImageMlInstall("/unused", { json: true }, deps);

    expect(npmInstall).toHaveBeenCalledTimes(1);
    const runtimeRoot = getImageMlRuntimeRoot(homeDir);
    expect(JSON.parse(await readFile(path.join(runtimeRoot, IMAGE_ML_MANIFEST), "utf8"))).toMatchObject({
      schemaVersion: "repochan.capability.v1",
      capability: "image-ml",
      packageName: IMAGE_ML_RUNTIME_PACKAGE,
      version: IMAGE_ML_RUNTIME_VERSION,
      installedAt: "2026-07-22T00:00:00.000Z",
    });
    expect(process.env[IMAGE_ML_ROOT_ENV]).toBe(runtimeRoot);
    const output = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(output).toMatchObject({ ok: true, installed: true, valid: true, updated: true, runtimeRoot });
  });

  it("leaves a valid existing cache untouched when a forced reinstall fails", async () => {
    const homeDir = await tempHome();
    const deps = { homeDir, npmInstall: fakeInstall, resolveRuntime };
    await installImageMlCapability({}, deps);
    const runtimeRoot = getImageMlRuntimeRoot(homeDir);
    const before = await readFile(path.join(runtimeRoot, IMAGE_ML_MANIFEST), "utf8");

    await expect(installImageMlCapability({ force: true }, {
      ...deps,
      npmInstall: async () => { throw new Error("registry unavailable"); },
    })).rejects.toThrow(/Failed to install/);

    expect(await readFile(path.join(runtimeRoot, IMAGE_ML_MANIFEST), "utf8")).toBe(before);
    expect((await getImageMlCapabilityStatus(deps)).installed).toBe(true);
  });

  it("preserves the installed runtime when moving it to a backup fails", async () => {
    const homeDir = await tempHome();
    const deps = { homeDir, npmInstall: fakeInstall, resolveRuntime };
    await installImageMlCapability({}, deps);
    const runtime = getImageMlRuntimeRoot(homeDir);
    const rename = fs.rename;
    vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
      if (String(source) === runtime) throw Object.assign(new Error("backup move failed"), { code: "EIO" });
      return rename(source, destination);
    });

    await expect(installImageMlCapability({ force: true }, deps)).rejects.toThrow("backup move failed");
    expect((await getImageMlCapabilityStatus(deps)).installed).toBe(true);
  });

  it("keeps the newly published runtime when backup cleanup fails", async () => {
    const homeDir = await tempHome();
    const deps = { homeDir, npmInstall: fakeInstall, resolveRuntime };
    await installImageMlCapability({}, deps);
    const runtime = getImageMlRuntimeRoot(homeDir);
    let published = false;
    const rename = fs.rename;
    vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
      await rename(source, destination);
      if (String(destination) === runtime && !String(source).startsWith(`${runtime}.backup-`)) published = true;
    });
    const remove = fs.rm;
    vi.spyOn(fs, "rm").mockImplementation(async (target, options) => {
      if (published && String(target).startsWith(`${runtime}.backup-`)) throw new Error("backup cleanup failed");
      return remove(target, options);
    });

    await expect(installImageMlCapability({ force: true }, deps)).resolves.toMatchObject({ installed: true, updated: true });
  });

  it.each(["library", "cli"])("%s retains a recoverable backup and reports it honestly when publication and restore both fail", async (binding) => {
    const homeDir = await tempHome();
    const deps = { homeDir, npmInstall: fakeInstall, resolveRuntime };
    await installImageMlCapability({}, deps);
    const runtime = getImageMlRuntimeRoot(homeDir);
    const before = await readFile(path.join(runtime, IMAGE_ML_MANIFEST), "utf8");
    const rename = fs.rename;
    let backup: string | undefined;
    vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
      if (String(source) === runtime) {
        backup = String(destination);
        return rename(source, destination);
      }
      if (String(destination) === runtime) throw Object.assign(new Error("publication and restore failed"), { code: "EIO" });
      return rename(source, destination);
    });
    const failure = await (binding === "cli"
      ? runImageMlInstall("/unused", { force: true, json: true }, deps)
      : installImageMlCapability({ force: true }, deps)).catch((error) => error);
    expect(`${failure.message} ${failure.hint ?? ""}`).not.toMatch(/untouched|remain usable/);
    expect(failure.message).toContain(backup);
    expect(binding === "cli" ? failure.cause.cause : failure.cause).toBeInstanceOf(AggregateError);
    await expect(fs.stat(runtime)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(backup!, IMAGE_ML_MANIFEST), "utf8")).toBe(before);
    vi.restoreAllMocks();
    await fs.rename(backup!, runtime);
    expect((await getImageMlCapabilityStatus(deps)).installed).toBe(true);
  });

  it("status is read-only and ensure exports the validated runtime root", async () => {
    const homeDir = await tempHome();
    const deps = { homeDir, npmInstall: fakeInstall, resolveRuntime };
    await installImageMlCapability({}, deps);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const npmInstall = vi.fn();

    await runImageMlStatus("/unused", { json: true }, { homeDir, npmInstall, resolveRuntime });
    expect(npmInstall).not.toHaveBeenCalled();
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({ installed: true, valid: true });
    const status = await ensureImageMlCapability("test operation", { homeDir, resolveRuntime });
    expect(process.env[IMAGE_ML_ROOT_ENV]).toBe(status.runtimeRoot);
  });

  it("marks a damaged bundled model invalid and ensure returns the install instruction", async () => {
    const homeDir = await tempHome();
    const deps = { homeDir, npmInstall: fakeInstall, resolveRuntime };
    await installImageMlCapability({}, deps);
    const runtimeRoot = getImageMlRuntimeRoot(homeDir);
    await rm(path.join(runtimeRoot, "node_modules", "@imgly", "background-removal-node", "dist", "medium-chunk"));

    const status = await getImageMlCapabilityStatus(deps);
    expect(status).toMatchObject({ installed: false, valid: false });
    expect(status.reason).toContain("bundled medium-model chunk is missing or empty");
    await expect(ensureImageMlCapability("image edit bg-remove", deps)).rejects.toMatchObject({
      code: "REPOCHAN_IMAGE_ML_MISSING",
      installCommand: "repochan image edit ml install",
      requiredBy: "image edit bg-remove",
    });
  });
});

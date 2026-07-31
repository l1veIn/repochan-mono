import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { removeRecursive, renameReplacing } from "@repochan/core";
const require = createRequire(import.meta.url);

export const IMAGE_ML_CAPABILITY = "image-ml";
export const IMAGE_ML_RUNTIME_PACKAGE = "@imgly/background-removal-node";
export const IMAGE_ML_RUNTIME_VERSION = "1.4.5";
export const IMAGE_ML_SUPPORTED_MODELS = ["small", "medium"] as const;
export const IMAGE_ML_INSTALL_COMMAND = "repochan image edit ml install";
export const IMAGE_ML_ROOT_ENV = "REPOCHAN_IMAGE_ML_ROOT";
export const IMAGE_ML_MANIFEST = "repochan-capability.json";

type CapabilityManifest = {
  schemaVersion: "repochan.capability.v1";
  capability: typeof IMAGE_ML_CAPABILITY;
  packageName: typeof IMAGE_ML_RUNTIME_PACKAGE;
  version: string;
  installedAt: string;
};

export type ImageMlCapabilityStatus = {
  ok: true;
  capability: typeof IMAGE_ML_CAPABILITY;
  packageName: typeof IMAGE_ML_RUNTIME_PACKAGE;
  requiredVersion: typeof IMAGE_ML_RUNTIME_VERSION;
  runtimeRoot: string;
  installed: boolean;
  valid: boolean;
  installedVersion: string | null;
  reason: string | null;
  installCommand: typeof IMAGE_ML_INSTALL_COMMAND;
};

export type ImageMlCapabilityDeps = {
  homeDir?: string;
  now?: () => Date;
  npmInstall?: (stagingDir: string, packageSpec: string) => Promise<void>;
  resolveRuntime?: (runtimeRoot: string) => string;
};

function capabilityBase(homeDir = os.homedir()): string {
  return path.join(homeDir, ".repochan", "capabilities", IMAGE_ML_CAPABILITY);
}

export function getImageMlRuntimeRoot(homeDir = os.homedir()): string {
  return path.join(capabilityBase(homeDir), IMAGE_ML_RUNTIME_VERSION);
}

function defaultResolveRuntime(runtimeRoot: string): string {
  return require.resolve(IMAGE_ML_RUNTIME_PACKAGE, { paths: [runtimeRoot] });
}

async function readJson(file: string): Promise<any> {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function inspectRuntimeRoot(
  runtimeRoot: string,
  resolveRuntime: (runtimeRoot: string) => string,
): Promise<{ valid: boolean; version: string | null; reason: string | null }> {
  const directory = await fs.stat(runtimeRoot).catch(() => undefined);
  if (!directory?.isDirectory()) return { valid: false, version: null, reason: "not installed" };

  try {
    const manifest = await readJson(path.join(runtimeRoot, IMAGE_ML_MANIFEST)) as CapabilityManifest;
    if (manifest.schemaVersion !== "repochan.capability.v1"
      || manifest.capability !== IMAGE_ML_CAPABILITY
      || manifest.packageName !== IMAGE_ML_RUNTIME_PACKAGE) {
      return { valid: false, version: null, reason: "invalid capability manifest" };
    }
    if (manifest.version !== IMAGE_ML_RUNTIME_VERSION) {
      return { valid: false, version: manifest.version ?? null, reason: `manifest version ${manifest.version} does not match ${IMAGE_ML_RUNTIME_VERSION}` };
    }
    const packageJson = await readJson(path.join(runtimeRoot, "node_modules", "@imgly", "background-removal-node", "package.json"));
    if (packageJson.version !== IMAGE_ML_RUNTIME_VERSION) {
      return { valid: false, version: typeof packageJson.version === "string" ? packageJson.version : null, reason: `installed package version ${String(packageJson.version)} does not match ${IMAGE_ML_RUNTIME_VERSION}` };
    }
    resolveRuntime(runtimeRoot);
    await validateBundledModels(runtimeRoot);
    return { valid: true, version: packageJson.version, reason: null };
  } catch (error) {
    return {
      valid: false,
      version: null,
      reason: `runtime validation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Read-only and network-free. */
export async function getImageMlCapabilityStatus(deps: ImageMlCapabilityDeps = {}): Promise<ImageMlCapabilityStatus> {
  const runtimeRoot = getImageMlRuntimeRoot(deps.homeDir);
  const inspected = await inspectRuntimeRoot(runtimeRoot, deps.resolveRuntime ?? defaultResolveRuntime);
  return {
    ok: true,
    capability: IMAGE_ML_CAPABILITY,
    packageName: IMAGE_ML_RUNTIME_PACKAGE,
    requiredVersion: IMAGE_ML_RUNTIME_VERSION,
    runtimeRoot,
    installed: inspected.valid,
    valid: inspected.valid,
    installedVersion: inspected.version,
    reason: inspected.reason,
    installCommand: IMAGE_ML_INSTALL_COMMAND,
  };
}

export class ImageMlCapabilityRequiredError extends Error {
  readonly code = "REPOCHAN_IMAGE_ML_MISSING";
  readonly capability = IMAGE_ML_CAPABILITY;
  readonly packageName: string;
  readonly requiredVersion: string;
  readonly installCommand = IMAGE_ML_INSTALL_COMMAND;

  constructor(readonly requiredBy: string, source?: { packageName?: unknown; requiredVersion?: unknown }) {
    const packageName = typeof source?.packageName === "string" ? source.packageName : IMAGE_ML_RUNTIME_PACKAGE;
    const requiredVersion = typeof source?.requiredVersion === "string" ? source.requiredVersion : IMAGE_ML_RUNTIME_VERSION;
    super(`Image ML capability is required by ${requiredBy}. Install ${packageName}@${requiredVersion} with \`${IMAGE_ML_INSTALL_COMMAND}\`, then retry.`);
    this.name = "MissingImageMlCapabilityError";
    this.packageName = packageName;
    this.requiredVersion = requiredVersion;
  }
}

export function isMissingImageMlCapabilityError(error: unknown): error is {
  name: string;
  code: string;
  capability: string;
  packageName?: string;
  requiredVersion?: string;
  requiredBy?: string;
  message?: string;
} {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; code?: unknown; capability?: unknown };
  return candidate.name === "MissingImageMlCapabilityError"
    && candidate.code === "REPOCHAN_IMAGE_ML_MISSING"
    && candidate.capability === IMAGE_ML_CAPABILITY;
}

export function asMissingImageMlCapabilityError(error: unknown): ReturnType<typeof imageMlErrorDetails> | undefined {
  let current: unknown = error;
  while (current !== undefined && current !== null) {
    if (isMissingImageMlCapabilityError(current)) {
      const source = current as { packageName?: unknown; requiredVersion?: unknown; requiredBy?: unknown };
      return imageMlErrorDetails(new ImageMlCapabilityRequiredError(
        typeof source.requiredBy === "string" ? source.requiredBy : "an image operation",
        source,
      ));
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function imageMlErrorDetails(error: ImageMlCapabilityRequiredError) {
  return {
    ok: false as const,
    error: error.name,
    code: error.code,
    message: error.message,
    capability: error.capability,
    packageName: error.packageName,
    requiredVersion: error.requiredVersion,
    requiredBy: error.requiredBy,
    installCommand: error.installCommand,
  };
}

export function contextualizeImageMlCapabilityError(error: unknown, requiredBy: string): ImageMlCapabilityRequiredError | undefined {
  const matched = asMissingImageMlCapabilityError(error);
  return matched ? new ImageMlCapabilityRequiredError(requiredBy, matched) : undefined;
}

export async function ensureImageMlCapability(requiredBy: string, deps: ImageMlCapabilityDeps = {}): Promise<ImageMlCapabilityStatus> {
  const status = await getImageMlCapabilityStatus(deps);
  if (!status.installed) throw new ImageMlCapabilityRequiredError(requiredBy);
  process.env[IMAGE_ML_ROOT_ENV] = status.runtimeRoot;
  return status;
}

async function defaultNpmInstall(stagingDir: string, packageSpec: string): Promise<void> {
  console.error(`Installing ${packageSpec} (native runtime and bundled models; this may take a few minutes)…`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npm", [
      "install",
      "--prefix", stagingDir,
      "--no-save",
      "--no-package-lock",
      "--omit=dev",
      "--fund=false",
      "--audit=false",
      "--progress=true",
      "--loglevel=notice",
      packageSpec,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    // npm and native install scripts may write to either stream. Route both to
    // stderr so --json keeps stdout reserved for its single final JSON value.
    child.stdout.on("data", (chunk) => process.stderr.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install exited with ${signal ? `signal ${signal}` : `code ${String(code)}`}.`));
    });
  });
}

async function validateBundledModels(runtimeRoot: string): Promise<void> {
  const dist = path.join(runtimeRoot, "node_modules", "@imgly", "background-removal-node", "dist");
  const resources = await readJson(path.join(dist, "resources.json"));
  for (const model of IMAGE_ML_SUPPORTED_MODELS) {
    const chunks = resources?.[`/models/${model}`]?.chunks;
    if (!Array.isArray(chunks) || chunks.length === 0) {
      throw new Error(`dist/resources.json does not declare bundled /models/${model} chunks.`);
    }
    for (const chunk of chunks) {
      if (typeof chunk?.hash !== "string" || !chunk.hash) {
        throw new Error(`dist/resources.json contains an invalid /models/${model} chunk.`);
      }
      const stat = await fs.stat(path.join(dist, chunk.hash)).catch(() => undefined);
      if (!stat?.isFile() || stat.size === 0) {
        throw new Error(`bundled ${model}-model chunk is missing or empty: ${chunk.hash}`);
      }
    }
  }
}

async function publishRuntime(staging: string, target: string): Promise<void> {
  const backup = `${target}.backup-${process.pid}`;
  const hadPrevious = (await fs.stat(target).catch(() => undefined))?.isDirectory() === true;
  await removeRecursive(backup);
  try {
    if (hadPrevious) await renameReplacing(target, backup);
    await renameReplacing(staging, target);
    await removeRecursive(backup);
  } catch (error) {
    await removeRecursive(target).catch(() => undefined);
    if (hadPrevious) await renameReplacing(backup, target).catch(() => undefined);
    throw error;
  }
}

export async function installImageMlCapability(
  options: { force?: boolean },
  deps: ImageMlCapabilityDeps = {},
): Promise<ImageMlCapabilityStatus & { updated: boolean }> {
  const before = await getImageMlCapabilityStatus(deps);
  if (before.installed && !options.force) {
    process.env[IMAGE_ML_ROOT_ENV] = before.runtimeRoot;
    return {
      ...before,
      updated: false,
    };
  }

  const base = capabilityBase(deps.homeDir);
  await fs.mkdir(base, { recursive: true });
  const staging = await fs.mkdtemp(path.join(base, `.install-${IMAGE_ML_RUNTIME_VERSION}-`));
  const packageSpec = `${IMAGE_ML_RUNTIME_PACKAGE}@${IMAGE_ML_RUNTIME_VERSION}`;
  try {
    await fs.writeFile(path.join(staging, "package.json"), `${JSON.stringify({ private: true }, null, 2)}\n`);
    await (deps.npmInstall ?? defaultNpmInstall)(staging, packageSpec);
    const installedPackage = await readJson(path.join(staging, "node_modules", "@imgly", "background-removal-node", "package.json"));
    if (installedPackage.version !== IMAGE_ML_RUNTIME_VERSION) {
      throw new Error(`npm installed ${IMAGE_ML_RUNTIME_PACKAGE}@${String(installedPackage.version)}; expected ${IMAGE_ML_RUNTIME_VERSION}.`);
    }
    (deps.resolveRuntime ?? defaultResolveRuntime)(staging);
    // @imgly 1.4.5 ships the supported model chunks in dist/. Verify both
    // models exposed by the CLI so every ML operation remains offline.
    await validateBundledModels(staging);
    const manifest: CapabilityManifest = {
      schemaVersion: "repochan.capability.v1",
      capability: IMAGE_ML_CAPABILITY,
      packageName: IMAGE_ML_RUNTIME_PACKAGE,
      version: IMAGE_ML_RUNTIME_VERSION,
      installedAt: (deps.now ?? (() => new Date()))().toISOString(),
    };
    await fs.writeFile(path.join(staging, IMAGE_ML_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    await publishRuntime(staging, before.runtimeRoot);
  } catch (error) {
    await removeRecursive(staging);
    throw new Error(
      `Failed to install ${packageSpec}: ${error instanceof Error ? error.message : String(error)}. Existing capability caches were left untouched.`,
      { cause: error },
    );
  }

  const after = await getImageMlCapabilityStatus(deps);
  if (!after.installed) throw new Error(`Installed ${packageSpec}, but validation failed: ${after.reason}.`);
  process.env[IMAGE_ML_ROOT_ENV] = after.runtimeRoot;
  return {
    ...after,
    updated: true,
  };
}

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

export const releasePackages = Object.freeze([
  { name: "@repochan/core", dir: "packages/core" },
  { name: "@repochan/image-edit", dir: "packages/image-edit" },
  { name: "@repochan/image-gen", dir: "packages/image-gen" },
  { name: "@repochan/skill", dir: "packages/skill" },
  { name: "@repochan/templates", dir: "packages/templates" },
  { name: "@repochan/starters", dir: "packages/starters" },
  { name: "repochan", dir: "packages/cli" },
]);

const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"];
export const defaultNpmRegistry = "https://registry.npmjs.org/";

export function validatePublicWorkspaceInventory(workspaceManifests) {
  const actual = workspaceManifests
    .filter((manifest) => manifest?.private !== true)
    .map((manifest) => manifest?.name)
    .filter((name) => typeof name === "string")
    .sort();
  const expected = releasePackages.map(({ name }) => name).sort();
  const missing = expected.filter((name) => !actual.includes(name));
  const unexpected = actual.filter((name) => !expected.includes(name));
  if (missing.length > 0 || unexpected.length > 0 || new Set(actual).size !== actual.length) {
    throw new Error(`Public workspace inventory mismatch. Missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}.`);
  }
  return actual;
}

/**
 * Validate the immutable package manifests emitted by `pnpm pack`.
 * Source package.json files are insufficient evidence because pnpm rewrites
 * workspace protocols only at pack/publish time.
 */
export function validatePackedRelease(entries, workspaceManifests) {
  if (!Array.isArray(entries)) throw new Error("Packed release entries must be an array.");
  if (!Array.isArray(workspaceManifests)) throw new Error("Public workspace inventory is required.");
  validatePublicWorkspaceInventory(workspaceManifests);

  const expectedNames = releasePackages.map(({ name }) => name);
  const byName = new Map();
  for (const entry of entries) {
    const name = entry?.manifest?.name;
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("Every packed release entry must contain a named manifest.");
    }
    if (byName.has(name)) throw new Error(`Duplicate packed package: ${name}`);
    byName.set(name, entry);
  }

  const missing = expectedNames.filter((name) => !byName.has(name));
  const unexpected = [...byName.keys()].filter((name) => !expectedNames.includes(name));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(`Packed release set mismatch. Missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}.`);
  }

  const positions = new Map(entries.map((entry, index) => [entry.manifest.name, index]));
  const versions = new Map(entries.map((entry) => [entry.manifest.name, entry.manifest.version]));

  for (const { manifest } of entries) {
    if (typeof manifest.version !== "string" || manifest.version.length === 0) {
      throw new Error(`${manifest.name} has no packed version.`);
    }

    for (const field of dependencyFields) {
      for (const [dependency, specifier] of Object.entries(manifest[field] ?? {})) {
        if (typeof specifier !== "string") continue;
        if (specifier.startsWith("workspace:")) {
          throw new Error(`${manifest.name} still contains ${field}.${dependency}=${specifier} after pack.`);
        }
        if (!versions.has(dependency)) continue;

        const expectedVersion = versions.get(dependency);
        if (specifier !== expectedVersion) {
          throw new Error(`${manifest.name} must depend on the packed ${dependency} version ${expectedVersion}; found ${specifier}.`);
        }
        if (positions.get(dependency) >= positions.get(manifest.name)) {
          throw new Error(`${dependency} must precede dependent package ${manifest.name} in the release order.`);
        }
      }
    }
  }

  if (entries.at(-1)?.manifest?.name !== "repochan") {
    throw new Error("The public CLI must be the final package in the release order.");
  }

  const cliDependencies = entries.at(-1).manifest.dependencies ?? {};
  for (const { name } of releasePackages.slice(0, -1)) {
    if (!(name in cliDependencies)) {
      throw new Error(`repochan is missing required runtime dependency ${name}.`);
    }
  }

  return {
    order: entries.map(({ manifest }) => `${manifest.name}@${manifest.version}`),
    cliVersion: versions.get("repochan"),
  };
}

export function registryForManifest(manifest) {
  const configured = manifest?.publishConfig?.registry ?? defaultNpmRegistry;
  return configured.endsWith("/") ? configured : `${configured}/`;
}

export function registryCommandPlan(manifest, packDestination) {
  const registry = registryForManifest(manifest);
  const spec = `${manifest.name}@${manifest.version}`;
  return {
    registry,
    viewArgs: ["view", spec, "version", "--json", "--registry", registry],
    packArgs: ["pack", spec, "--pack-destination", packDestination, "--json", "--ignore-scripts", "--registry", registry],
  };
}

export function npmResultIsNotFound(result) {
  if (result?.status === 0) return false;
  try {
    const parsed = JSON.parse(result?.stdout?.trim() ?? "");
    return parsed?.error?.code === "E404";
  } catch {
    return false;
  }
}

export async function sha256File(file) {
  return createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

export async function createGitWorktreeSnapshot(sourceRoot, destinationRoot) {
  const output = execFileSync("git", ["-C", sourceRoot, "ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  const relativePaths = output.toString("utf8").split("\0").filter(Boolean);
  for (const relativePath of relativePaths) {
    const source = path.join(sourceRoot, relativePath);
    const destination = path.join(destinationRoot, relativePath);
    const stat = await fs.lstat(source);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if (stat.isSymbolicLink()) await fs.symlink(await fs.readlink(source), destination);
    else if (stat.isFile()) await fs.copyFile(source, destination);
  }
  return relativePaths;
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
  }
  return value;
}

async function fileFingerprint(root, relativePath) {
  const absolute = path.join(root, relativePath);
  const stat = await fs.lstat(absolute);
  if (stat.isSymbolicLink()) return `link:${await fs.readlink(absolute)}`;
  if (!stat.isFile()) return null;
  let contents = await fs.readFile(absolute);
  if (relativePath === "package/package.json") {
    contents = Buffer.from(JSON.stringify(stableJson(JSON.parse(contents.toString("utf8")))));
  }
  return createHash("sha256").update(contents).digest("hex");
}

async function listFiles(root, prefix = "") {
  const current = path.join(root, prefix);
  const names = await fs.readdir(current);
  const files = [];
  for (const name of names.sort()) {
    const relative = path.join(prefix, name);
    const stat = await fs.lstat(path.join(root, relative));
    if (stat.isDirectory()) files.push(...await listFiles(root, relative));
    else files.push(relative.split(path.sep).join("/"));
  }
  return files;
}

/** Compare extracted npm package trees by path and content, normalizing package.json key order. */
export async function compareExtractedPackages(localRoot, publishedRoot) {
  const localFiles = await listFiles(localRoot);
  const publishedFiles = await listFiles(publishedRoot);
  const allFiles = [...new Set([...localFiles, ...publishedFiles])].sort();
  const differences = [];

  for (const relative of allFiles) {
    if (!localFiles.includes(relative)) {
      differences.push({ path: relative, kind: "published-only" });
      continue;
    }
    if (!publishedFiles.includes(relative)) {
      differences.push({ path: relative, kind: "local-only" });
      continue;
    }
    const [localHash, publishedHash] = await Promise.all([
      fileFingerprint(localRoot, relative),
      fileFingerprint(publishedRoot, relative),
    ]);
    if (localHash !== publishedHash) differences.push({ path: relative, kind: "content" });
  }

  return differences;
}

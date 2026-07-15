#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as tar from "tar";
import {
  compareExtractedPackages,
  createGitWorktreeSnapshot,
  npmResultIsNotFound,
  parseReleaseManifest,
  registryCommandPlan,
  registryForManifest,
  releaseCommandTimeout,
  releasePackages,
  sha256File,
  validatePackedRelease,
} from "./release-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryCheck = process.argv.includes("--registry-check");
const commandTimeout = releaseCommandTimeout();
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "repochan-release-preflight-"));
const sourceRoot = path.join(temporaryRoot, "source");
const artifactDir = registryCheck
  ? path.resolve(process.env.REPOCHAN_RELEASE_ARTIFACT_DIR ?? mkdtempSync(path.join(os.tmpdir(), "repochan-release-candidates-")))
  : path.join(temporaryRoot, "packs");
let completed = false;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: options.encoding ?? "utf8",
    env: { ...process.env, npm_config_update_notifier: "false", ...options.env },
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout ?? commandTimeout,
    killSignal: "SIGTERM",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

function runAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: { ...process.env, npm_config_update_notifier: "false", ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = options.timeout ?? commandTimeout;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`${command} ${args.join(" ")} timed out after ${timeout}ms.`));
    }, timeout);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (status === 0) resolve(stdout);
      else reject(new Error(`${command} ${args.join(" ")} failed with status ${status}:\n${stderr || stdout}`));
    });
  });
}

function parseJsonOutput(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${label} did not return JSON:\n${output}`);
  }
}

async function loadWorkspaceManifests(directory) {
  const manifests = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.name === "package.json") {
        manifests.push(parseReleaseManifest(await fs.readFile(absolute, "utf8"), path.relative(directory, absolute)));
      }
    }
  }
  await walk(path.join(directory, "packages"));
  return manifests;
}

async function prepareFreshSource() {
  await fs.mkdir(sourceRoot, { recursive: true });
  await createGitWorktreeSnapshot(root, sourceRoot);
  const forbidden = [
    "node_modules",
    "packages/core/dist",
    "packages/image-edit/dist",
    "packages/image-gen/dist",
    "packages/cli/dist",
  ];
  for (const relative of forbidden) {
    if (existsSync(path.join(sourceRoot, relative))) throw new Error(`Fresh release source unexpectedly contains ${relative}.`);
  }
  run("pnpm", ["install", "--frozen-lockfile"], { cwd: sourceRoot });
  run("pnpm", ["--filter", "repochan...", "build"], { cwd: sourceRoot });
  for (const relative of forbidden.slice(1)) {
    if (!existsSync(path.join(sourceRoot, relative))) throw new Error(`Explicit release build did not create ${relative}.`);
  }
}

async function packRelease() {
  await fs.mkdir(artifactDir, { recursive: true });
  await prepareFreshSource();
  const workspaceManifests = await loadWorkspaceManifests(sourceRoot);
  const entries = [];
  for (const expected of releasePackages) {
    const output = run("pnpm", ["--dir", expected.dir, "pack", "--pack-destination", artifactDir, "--json"], { cwd: sourceRoot });
    const packed = parseJsonOutput(output, `pnpm pack ${expected.name}`);
    if (packed.name !== expected.name) throw new Error(`Expected ${expected.name}, packed ${packed.name}.`);
    const archive = path.resolve(packed.filename);
    const extracted = path.join(temporaryRoot, "packed", expected.name.replaceAll("/", "-").replace(/^@/, ""));
    await fs.mkdir(extracted, { recursive: true });
    await tar.extract({ file: archive, cwd: extracted, filter: (entryPath) => entryPath === "package/package.json" });
    const manifestOutput = await fs.readFile(path.join(extracted, "package", "package.json"), "utf8");
    entries.push({
      ...expected,
      archive,
      sha256: await sha256File(archive),
      manifest: parseReleaseManifest(manifestOutput, `${expected.name} packed package.json`),
      files: packed.files,
    });
  }
  validatePackedRelease(entries, workspaceManifests);
  return entries;
}

async function startScopedRegistry(entries) {
  const packages = new Map();
  for (const entry of entries.slice(0, -1)) {
    const bytes = await fs.readFile(entry.archive);
    packages.set(entry.manifest.name, {
      ...entry,
      shasum: createHash("sha1").update(bytes).digest("hex"),
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
      filename: path.basename(entry.archive),
    });
  }

  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname.startsWith("/tarballs/")) {
      const filename = decodeURIComponent(pathname.slice("/tarballs/".length));
      const entry = [...packages.values()].find((candidate) => candidate.filename === filename);
      if (!entry) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/octet-stream" });
      createReadStream(entry.archive).pipe(response);
      return;
    }

    const name = decodeURIComponent(pathname.slice(1));
    const entry = packages.get(name);
    if (!entry) {
      response.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not_found" }));
      return;
    }
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const version = entry.manifest.version;
    const packument = {
      name,
      "dist-tags": { latest: version },
      versions: {
        [version]: {
          ...entry.manifest,
          dist: {
            tarball: `${baseUrl}/tarballs/${encodeURIComponent(entry.filename)}`,
            shasum: entry.shasum,
            integrity: entry.integrity,
          },
        },
      },
    };
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(packument));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    registry: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function cleanRoomSmoke(entries) {
  const cleanRoom = path.join(temporaryRoot, "clean-room");
  const hostProject = path.join(cleanRoom, "host-project");
  const site = path.join(hostProject, "site");
  mkdirSync(hostProject, { recursive: true });
  run("npm", ["init", "-y"], { cwd: cleanRoom });

  const scopedRegistry = await startScopedRegistry(entries);
  await fs.writeFile(path.join(cleanRoom, ".npmrc"), `@repochan:registry=${scopedRegistry.registry}\n`, "utf8");
  try {
    await runAsync("npm", ["install", "--no-audit", "--no-fund", entries.at(-1).archive], { cwd: cleanRoom });
  } finally {
    await scopedRegistry.close();
  }

  const cleanManifest = JSON.parse(await fs.readFile(path.join(cleanRoom, "package.json"), "utf8"));
  if (Object.keys(cleanManifest.dependencies ?? {}).length !== 1 || !("repochan" in cleanManifest.dependencies)) {
    throw new Error("Clean-room smoke must install only the CLI tarball as a top-level dependency.");
  }

  const cliEntry = path.join(cleanRoom, "node_modules", "repochan", "dist", "index.js");
  const version = run(process.execPath, [cliEntry, "--version"], { cwd: hostProject }).trim();
  if (version !== `repochan/${entries.at(-1).manifest.version} ${process.platform}-${process.arch} node-${process.version}`) {
    throw new Error(`Unexpected clean-room CLI identity: ${version}`);
  }

  const starterList = parseJsonOutput(run(process.execPath, [cliEntry, "starter", "list", "--json"], { cwd: hostProject }), "starter list");
  const starterIds = new Set(starterList.starters?.map(({ id }) => id));
  for (const required of ["minimal", "registry-modular"]) {
    if (!starterIds.has(required)) throw new Error(`Clean-room package is missing starter ${required}.`);
  }

  run(process.execPath, [cliEntry, "starter", "pull", "--starter", "registry-modular", "--output-dir", site, "--json"], { cwd: hostProject });
  run(process.execPath, [cliEntry, "starter", "validate", "--output-dir", site, "--json"], { cwd: hostProject });
  run("npm", ["install", "--no-audit", "--no-fund"], { cwd: site });
  run("npm", ["run", "build"], { cwd: site });
  return { cliVersion: version, starters: [...starterIds].sort() };
}

async function registryStatus(entry) {
  const spec = `${entry.manifest.name}@${entry.manifest.version}`;
  const publishedDir = path.join(temporaryRoot, "registry", entry.manifest.name.replaceAll("/", "-").replace(/^@/, ""));
  await fs.mkdir(publishedDir, { recursive: true });
  const plan = registryCommandPlan(entry.manifest, publishedDir);
  const view = spawnSync("npm", plan.viewArgs, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_update_notifier: "false" },
    timeout: commandTimeout,
    killSignal: "SIGTERM",
  });
  if (view.status !== 0) {
    if (npmResultIsNotFound(view)) return { package: spec, registry: plan.registry, status: "unpublished" };
    throw new Error(`npm view failed for ${spec} at ${plan.registry}:\n${view.stderr || view.stdout}`);
  }

  const packed = parseJsonOutput(run("npm", plan.packArgs), `npm pack ${spec}`);
  const publishedArchive = (Array.isArray(packed) ? packed[0] : packed).filename;
  const localExtracted = path.join(publishedDir, "local");
  const publishedExtracted = path.join(publishedDir, "published");
  await Promise.all([fs.mkdir(localExtracted, { recursive: true }), fs.mkdir(publishedExtracted, { recursive: true })]);
  await Promise.all([
    tar.extract({ file: entry.archive, cwd: localExtracted }),
    tar.extract({ file: path.join(publishedDir, publishedArchive), cwd: publishedExtracted }),
  ]);
  const differences = await compareExtractedPackages(localExtracted, publishedExtracted);
  return differences.length === 0
    ? { package: spec, registry: plan.registry, status: "already-published-identical" }
    : { package: spec, registry: plan.registry, status: "version-collision", differences: differences.slice(0, 12), differenceCount: differences.length };
}

async function main() {
  if (process.platform === "win32") {
    throw new Error("RepoChan release preflight currently requires a POSIX operator environment. Run it from macOS, Linux, or a POSIX CI runner; do not bypass this guard to publish.");
  }
  const entries = await packRelease();
  const smoke = await cleanRoomSmoke(entries);
  const report = {
    releaseOrder: entries.map(({ manifest }) => `${manifest.name}@${manifest.version}`),
    artifacts: entries.map(({ manifest, archive, sha256 }) => ({
      package: `${manifest.name}@${manifest.version}`,
      registry: registryForManifest(manifest),
      archive,
      sha256,
    })),
    freshSourceBuild: "passed",
    packedDependencyContract: "passed",
    cleanRoom: {
      status: "passed",
      topLevelInstall: "CLI tarball only",
      cliVersion: smoke.cliVersion,
      starters: smoke.starters,
      registryModularBuild: "passed",
    },
  };

  if (registryCheck) {
    report.registry = [];
    for (const entry of entries) report.registry.push(await registryStatus(entry));
    report.blockers = report.registry
      .filter(({ status }) => status === "version-collision")
      .map(({ package: packageSpec }) => `${packageSpec} is already published with different contents; authorize and apply a new version before publishing this release set.`);
    report.artifactRetention = `Candidate artifacts retained at ${artifactDir}`;
  }

  console.log(JSON.stringify(report, null, 2));
  completed = true;
  if (report.blockers?.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}).finally(() => {
  if (completed) rmSync(temporaryRoot, { recursive: true, force: true });
  else console.error(`Failed preflight evidence retained at ${temporaryRoot}`);
  if (registryCheck) console.error(`Candidate artifacts retained at ${artifactDir}`);
});

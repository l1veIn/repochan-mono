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
  normalizePackedArchive,
  parseReleaseManifest,
  registryCommandPlan,
  registryForManifest,
  releaseCommandTimeout,
  releasePackages,
  resolveCleanGitSourceRef,
  scanCompatibilityDebt,
  scanReleaseSurfaceDebt,
  sha256File,
  validatePackedRelease,
} from "./release-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryCheck = process.argv.includes("--registry-check");
const sourceRefFlag = process.argv.findIndex((argument) => argument === "--source-ref" || argument.startsWith("--source-ref="));
const sourceRef = sourceRefFlag < 0
  ? undefined
  : process.argv[sourceRefFlag].includes("=")
    ? process.argv[sourceRefFlag].slice(process.argv[sourceRefFlag].indexOf("=") + 1)
    : process.argv[sourceRefFlag + 1];
if (sourceRefFlag >= 0 && (!sourceRef || sourceRef.startsWith("--"))) {
  throw new Error("--source-ref requires a git ref, for example --source-ref HEAD.");
}
const commandTimeout = releaseCommandTimeout();
const canonicalTemplateIds = Object.freeze([
  "official/badge-grid-3x3",
  "official/character-cutout",
  "official/chibi-grid-3x3",
  "official/chibi-grid-4x4",
  "official/foundation-sheet",
  "official/hero-character-migrate",
  "official/hero-character-migrate-localize",
  "official/hero-pose-lineart-extract",
  "official/icon-grid-3x3",
  "official/icon-single",
  "official/iconfont-grid-4x4",
  "official/item-prop-grid-3x3",
  "official/pattern-tile",
  "official/poster",
  "official/poster-constructivist",
  "official/poster-glitch-art",
  "official/poster-memphis",
  "official/poster-risograph-pop",
  "official/poster-scene",
  "official/readme-banner-21x9",
  "official/section-character-migrate-localize",
  "official/section-design",
  "official/three-view",
  "official/web-state-grid-2x2",
  "official/web-state-grid-3x3",
]);
const canonicalStarterIds = Object.freeze([
  "caddy",
  "character-game-page",
  "landing-anti-design",
  "landing-cinema-credits",
  "landing-constructivist",
  "landing-frutiger-aero",
  "landing-glitch-os",
  "landing-memphis",
  "landing-museum",
  "landing-neobrutal-zine",
  "landing-scrollytelling",
  "landing-solarpunk",
  "landing-swiss-type",
  "landing-toy-city",
  "landing-wireframe-morph",
  "marktext",
  "minimal",
  "redis",
  "repochan-harbor",
  "sealed-scroll",
]);
const canonicalDefaultStarter = "minimal";
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "repochan-release-preflight-"));
const sourceRoot = path.join(temporaryRoot, "source");
const artifactDir = registryCheck
  ? path.resolve(process.env.REPOCHAN_RELEASE_ARTIFACT_DIR ?? mkdtempSync(path.join(os.tmpdir(), "repochan-release-candidates-")))
  : path.join(temporaryRoot, "packs");
let completed = false;
let resolvedSourceCommit;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: options.encoding ?? "utf8",
    env: options.replaceEnv
      ? { ...options.env, npm_config_update_notifier: "false" }
      : { ...process.env, npm_config_update_notifier: "false", ...options.env },
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
      env: options.replaceEnv
        ? { ...options.env, npm_config_update_notifier: "false" }
        : { ...process.env, npm_config_update_notifier: "false", ...options.env },
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

function isolatedEnvironment(home, userConfig, cache) {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^npm_config_/i.test(key) && !["NODE_AUTH_TOKEN", "NPM_TOKEN"].includes(key),
  ));
  return {
    ...inherited,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    npm_config_userconfig: userConfig,
    npm_config_cache: cache,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
  };
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
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
  if (sourceRef) {
    resolvedSourceCommit = resolveCleanGitSourceRef(root, sourceRef);
    const sourceArchive = path.join(temporaryRoot, "release-source.tar");
    run("git", ["archive", "--format=tar", `--output=${sourceArchive}`, resolvedSourceCommit], { cwd: root });
    await tar.extract({ file: sourceArchive, cwd: sourceRoot });
  } else {
    await createGitWorktreeSnapshot(root, sourceRoot);
  }
  const compatibilityDebt = await scanCompatibilityDebt(sourceRoot);
  if (compatibilityDebt.length > 0) {
    throw new Error(`Current runtime/skill contracts contain compatibility debt:\n${compatibilityDebt.map(({ path: file, line, rule, text }) => `- ${file}:${line} [${rule}] ${text}`).join("\n")}`);
  }
  const releaseSurfaceDebt = await scanReleaseSurfaceDebt(sourceRoot);
  if (releaseSurfaceDebt.length > 0) {
    throw new Error(`Public release surface contains development-history debt:\n${releaseSurfaceDebt.map(({ path: file, line, rule, text }) => `- ${file}:${line} [${rule}] ${text}`).join("\n")}`);
  }
  const forbidden = [
    "node_modules",
    "packages/core/dist",
    "packages/browse/dist",
    "packages/image-edit/dist",
    "packages/image-gen/dist",
    "packages/cli/dist",
  ];
  for (const relative of forbidden) {
    if (existsSync(path.join(sourceRoot, relative))) throw new Error(`Fresh release source unexpectedly contains ${relative}.`);
  }
  run("pnpm", ["install", "--frozen-lockfile"], { cwd: sourceRoot });
  for (const compiledPackage of ["@repochan/core", "@repochan/image-edit", "@repochan/image-gen", "@repochan/browse", "repochan"]) {
    run("pnpm", ["--filter", compiledPackage, "build"], { cwd: sourceRoot });
  }
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
    const packageSlug = expected.name.replaceAll("/", "-").replace(/^@/, "");
    const rawPackDir = path.join(temporaryRoot, "raw-packs", packageSlug);
    await fs.mkdir(rawPackDir, { recursive: true });
    const output = run("pnpm", ["--dir", expected.dir, "pack", "--pack-destination", rawPackDir, "--json"], { cwd: sourceRoot });
    const packed = parseJsonOutput(output, `pnpm pack ${expected.name}`);
    if (packed.name !== expected.name) throw new Error(`Expected ${expected.name}, packed ${packed.name}.`);
    const rawArchive = path.resolve(packed.filename);
    const archive = path.join(artifactDir, path.basename(rawArchive));
    await normalizePackedArchive(rawArchive, archive, path.join(temporaryRoot, "normalize", packageSlug, "first"));
    const reproductionDir = path.join(temporaryRoot, "reproducibility", packageSlug);
    const secondRawPackDir = path.join(temporaryRoot, "raw-packs-second", packageSlug);
    await fs.mkdir(secondRawPackDir, { recursive: true });
    await fs.mkdir(reproductionDir, { recursive: true });
    const reproductionOutput = run("pnpm", ["--dir", expected.dir, "pack", "--pack-destination", secondRawPackDir, "--json"], { cwd: sourceRoot });
    const reproduction = parseJsonOutput(reproductionOutput, `second pnpm pack ${expected.name}`);
    const secondRawArchive = path.resolve(reproduction.filename);
    const reproductionArchive = path.join(reproductionDir, path.basename(secondRawArchive));
    await normalizePackedArchive(secondRawArchive, reproductionArchive, path.join(temporaryRoot, "normalize", packageSlug, "second"));
    const [sha256, reproductionSha256] = await Promise.all([sha256File(archive), sha256File(reproductionArchive)]);
    if (sha256 !== reproductionSha256) {
      throw new Error(`${expected.name} pack is not byte-for-byte reproducible from unchanged source: ${sha256} != ${reproductionSha256}.`);
    }
    const extracted = path.join(temporaryRoot, "packed", expected.name.replaceAll("/", "-").replace(/^@/, ""));
    await fs.mkdir(extracted, { recursive: true });
    await tar.extract({ file: archive, cwd: extracted, filter: (entryPath) => entryPath === "package/package.json" });
    const manifestOutput = await fs.readFile(path.join(extracted, "package", "package.json"), "utf8");
    entries.push({
      ...expected,
      archive,
      sha256,
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

async function candidateFreshInstallSmoke(entries) {
  const cleanRoom = path.join(temporaryRoot, "fresh-install");
  const home = path.join(cleanRoom, "home");
  const cache = path.join(cleanRoom, "npm-cache");
  const installRoot = path.join(cleanRoom, "install");
  const hostProject = path.join(cleanRoom, "empty-project");
  const userConfig = path.join(cleanRoom, "isolated.npmrc");
  await Promise.all([
    fs.mkdir(home, { recursive: true }),
    fs.mkdir(cache, { recursive: true }),
    fs.mkdir(installRoot, { recursive: true }),
    fs.mkdir(hostProject, { recursive: true }),
  ]);
  await fs.writeFile(userConfig, "", "utf8");
  await fs.writeFile(path.join(installRoot, "package.json"), JSON.stringify({ private: true }) + "\n", "utf8");
  run("git", ["init", "--quiet"], { cwd: hostProject });
  const isolatedEnv = isolatedEnvironment(home, userConfig, cache);

  const scopedRegistry = await startScopedRegistry(entries);
  await fs.writeFile(userConfig, `@repochan:registry=${scopedRegistry.registry}\n`, "utf8");
  try {
    await runAsync("npm", ["install", "--prefix", installRoot, "--no-audit", "--no-fund", entries.at(-1).archive], {
      cwd: cleanRoom,
      env: isolatedEnv,
      replaceEnv: true,
    });
  } finally {
    await scopedRegistry.close();
  }
  await fs.writeFile(userConfig, "", "utf8");

  const cleanManifest = JSON.parse(await fs.readFile(path.join(installRoot, "package.json"), "utf8"));
  if (Object.keys(cleanManifest.dependencies ?? {}).length !== 1 || !("repochan" in cleanManifest.dependencies)) {
    throw new Error("Fresh-install smoke must install only the candidate CLI tarball as a top-level dependency.");
  }

  const cliEntry = path.join(installRoot, "node_modules", "repochan", "dist", "index.js");
  const version = run(process.execPath, [cliEntry, "--version"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true }).trim();
  if (version !== `repochan/${entries.at(-1).manifest.version} ${process.platform}-${process.arch} node-${process.version}`) {
    throw new Error(`Unexpected fresh-install CLI identity: ${version}`);
  }
  for (const entry of entries) {
    // @repochan/starters is no longer a CLI dependency: the fresh install must
    // NOT contain it; the packed CLI syncs it on demand (`starter sync`).
    if (entry.manifest.name === "@repochan/starters") {
      if (existsSync(path.join(installRoot, "node_modules", "@repochan", "starters", "package.json"))) {
        throw new Error("Fresh install must not bundle @repochan/starters; the CLI syncs starters on demand.");
      }
      continue;
    }
    const manifestPath = entry.manifest.name === "repochan"
      ? path.join(installRoot, "node_modules", "repochan", "package.json")
      : path.join(installRoot, "node_modules", ...entry.manifest.name.split("/"), "package.json");
    const installed = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    if (installed.version !== entry.manifest.version) {
      throw new Error(`Fresh install resolved ${entry.manifest.name}@${installed.version}; expected ${entry.manifest.version}.`);
    }
  }

  const beforeInit = parseJsonOutput(
    run(process.execPath, [cliEntry, "status", "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true }),
    "fresh-install status before init",
  );
  if (beforeInit.protocol?.exists !== false) throw new Error("Fresh-install project was not empty before init.");

  run(process.execPath, [cliEntry, "setup", "--agent", "codex", "--project", "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true });
  const instructionsPath = path.join(hostProject, "AGENTS.md");
  const instructionsAfterFirstSetup = await fs.readFile(instructionsPath, "utf8");
  run(process.execPath, [cliEntry, "setup", "--agent", "codex", "--project", "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true });
  const instructionsAfterSecondSetup = await fs.readFile(instructionsPath, "utf8");
  if (instructionsAfterSecondSetup !== instructionsAfterFirstSetup || countOccurrences(instructionsAfterSecondSetup, "<!-- repochan:setup:codex begin -->") !== 1) {
    throw new Error("Fresh-install setup was not idempotent.");
  }
  const expectedSkills = [
    "repochan",
    "repochan-analysis",
    "repochan-art-director",
    "repochan-interviewer",
    "repochan-page-designer",
    "repochan-painter",
    "repochan-persona",
    "repochan-starter-designer",
    "repochan-web-designer",
  ];
  const installedSkillsRoot = path.join(hostProject, ".codex", "skills");
  const installedSkills = (await fs.readdir(installedSkillsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(installedSkills) !== JSON.stringify(expectedSkills)) {
    throw new Error(`Fresh-install Codex skill inventory mismatch: ${installedSkills.join(", ")}.`);
  }
  for (const skill of expectedSkills) {
    const skillContract = await fs.readFile(path.join(installedSkillsRoot, skill, "SKILL.md"), "utf8");
    if (!skillContract.startsWith("---\n") || !skillContract.includes(`name: ${skill}`)) {
      throw new Error(`Fresh-install skill ${skill} is missing its named SKILL.md contract.`);
    }
  }
  const wizardContract = await fs.readFile(path.join(installedSkillsRoot, "repochan", "SKILL.md"), "utf8");
  for (const currentContract of [
    "repochan foundation find",
    "repochan-painter",
    "repochan-page-designer",
    "不得自动升级为 yolo",
    "外部写操作仍必须在用户原始请求中明确授权",
    "非交互环境不扩大授权",
  ]) {
    if (!wizardContract.includes(currentContract)) throw new Error(`Fresh-install wizard skill is missing current contract ${currentContract}.`);
  }
  const skillVersion = (await fs.readFile(path.join(installedSkillsRoot, ".repochan-version"), "utf8")).trim();
  if (skillVersion !== entries.at(-1).manifest.version) {
    throw new Error(`Fresh-install skill stamp ${skillVersion} does not match CLI ${entries.at(-1).manifest.version}.`);
  }

  run(process.execPath, [cliEntry, "init", "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true });
  const statusAfterFirstInit = parseJsonOutput(
    run(process.execPath, [cliEntry, "status", "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true }),
    "fresh-install status after init",
  );
  run(process.execPath, [cliEntry, "init", "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true });
  const statusAfterSecondInit = parseJsonOutput(
    run(process.execPath, [cliEntry, "status", "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true }),
    "fresh-install status after repeated init",
  );
  if (JSON.stringify(statusAfterSecondInit) !== JSON.stringify(statusAfterFirstInit)) {
    throw new Error("Fresh-install init was not idempotent.");
  }
  const initialValidation = parseJsonOutput(
    run(process.execPath, [cliEntry, "validate", "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true }),
    "fresh-install initial validation",
  );
  if (initialValidation.ok !== true) throw new Error(`Fresh-install validation failed: ${JSON.stringify(initialValidation)}`);
  run(process.execPath, [cliEntry, "analysis", "run", "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true });
  const analyzedValidation = parseJsonOutput(
    run(process.execPath, [cliEntry, "validate", "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true }),
    "fresh-install analyzed validation",
  );
  if (analyzedValidation.ok !== true) throw new Error(`Fresh-install analysis produced invalid protocol state: ${JSON.stringify(analyzedValidation)}`);

  const templateList = parseJsonOutput(
    run(process.execPath, [cliEntry, "template", "list", "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true }),
    "fresh-install template list",
  );
  const templateIds = Array.isArray(templateList.templates)
    ? templateList.templates.map(({ id }) => id).sort()
    : [];
  if (JSON.stringify(templateIds) !== JSON.stringify(canonicalTemplateIds)) {
    throw new Error(`Fresh-install canonical template inventory mismatch:\nexpected: ${canonicalTemplateIds.join(", ")}\nactual: ${templateIds.join(", ")}`);
  }
  const foundationTemplate = parseJsonOutput(
    run(process.execPath, [cliEntry, "template", "get", "official/foundation-sheet", "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true }),
    "fresh-install template get",
  );
  if (foundationTemplate.id !== "official/foundation-sheet" || foundationTemplate.assetType !== "foundation_sheet" || !foundationTemplate.promptTemplate) {
    throw new Error("Fresh-install template get did not return the complete foundation-sheet contract.");
  }

  // Re-open the candidate registry for on-demand Starter sync. The CLI itself
  // was installed from a tarball, and closing/clearing this registry before
  // sync would silently resolve npm's public `latest` instead of the retained
  // candidate whenever their versions differ.
  const starterRegistry = await startScopedRegistry(entries);
  await fs.writeFile(userConfig, `@repochan:registry=${starterRegistry.registry}\n`, "utf8");
  let starterSync;
  try {
    starterSync = parseJsonOutput(
      await runAsync(process.execPath, [cliEntry, "starter", "sync", "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true }),
      "fresh-install starter sync",
    );
  } finally {
    await starterRegistry.close();
    await fs.writeFile(userConfig, "", "utf8");
  }
  const startersEntry = entries.find((entry) => entry.manifest.name === "@repochan/starters");
  if (starterSync.version !== startersEntry.manifest.version) {
    throw new Error(`Fresh-install starter sync resolved ${starterSync.version ?? "no version"}; expected ${startersEntry.manifest.version}.`);
  }
  const starterList = parseJsonOutput(
    run(process.execPath, [cliEntry, "starter", "list", "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true }),
    "fresh-install starter list",
  );
  const listedStarters = Array.isArray(starterList.starters) ? starterList.starters : [];
  const starterIds = listedStarters.map(({ id }) => id).sort();
  if (JSON.stringify(starterIds) !== JSON.stringify(canonicalStarterIds)) {
    throw new Error(`Fresh-install canonical Starter inventory mismatch: expected ${canonicalStarterIds.join(", ")}; actual ${starterIds.join(", ")}.`);
  }
  const defaultStarterIds = listedStarters.filter(({ default: isDefault }) => isDefault === true).map(({ id }) => id);
  if (defaultStarterIds.length !== 1 || defaultStarterIds[0] !== canonicalDefaultStarter) {
    throw new Error(`Fresh-install Starter default mismatch: expected only ${canonicalDefaultStarter}; actual ${defaultStarterIds.join(", ") || "none"}.`);
  }

  const starterBuilds = {};
  const buildStarter = (starterId, pullArgs) => {
    const site = path.join(hostProject, `site-${starterId}`);
    const pullResult = parseJsonOutput(
      run(process.execPath, [cliEntry, "starter", "pull", ...pullArgs, "--output-dir", site, "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true }),
      `fresh-install ${starterId} starter pull`,
    );
    if (pullResult.starter !== starterId) {
      throw new Error(`Fresh-install Starter pull resolved ${pullResult.starter ?? "no id"}; expected ${starterId}.`);
    }
    run(process.execPath, [cliEntry, "starter", "validate", "--output-dir", site, "--json"], { cwd: hostProject, env: isolatedEnv, replaceEnv: true });
    run("npm", ["install", "--no-audit", "--no-fund"], { cwd: site, env: isolatedEnv, replaceEnv: true });
    run("npm", ["run", "build"], { cwd: site, env: isolatedEnv, replaceEnv: true });
    starterBuilds[starterId] = "passed";
  };
  for (const starterId of canonicalStarterIds) {
    buildStarter(starterId, starterId === canonicalDefaultStarter ? [] : ["--starter", starterId]);
  }

  return {
    cliVersion: version,
    isolatedState: ["HOME", "empty npm userconfig", "npm cache", "install prefix", "empty project"],
    setupIdempotent: true,
    initIdempotent: true,
    status: "passed",
    validation: "passed before and after analysis",
    analysis: "passed",
    setupScope: "Codex project-local only",
    skills: expectedSkills,
    templates: templateIds,
    templateGet: "official/foundation-sheet passed",
    starterSync: starterSync.version,
    starters: starterIds,
    defaultStarter: canonicalDefaultStarter,
    defaultStarterResolution: "bare starter pull passed",
    starterBuilds,
    realAgentFlow: "not run",
    imageGeneration: "not run",
    otherAgentSetupTargets: "not run",
    globalSetup: "not run",
  };
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
  const smoke = await candidateFreshInstallSmoke(entries);
  const report = {
    releaseOrder: entries.map(({ manifest }) => `${manifest.name}@${manifest.version}`),
    artifacts: entries.map(({ manifest, archive, sha256 }) => ({
      package: `${manifest.name}@${manifest.version}`,
      registry: registryForManifest(manifest),
      archive,
      sha256,
    })),
    freshSourceBuild: "passed",
    source: sourceRef
      ? { mode: "clean-git-ref", requestedRef: sourceRef, commit: resolvedSourceCommit }
      : { mode: "current-worktree", releaseEligible: false },
    packedDependencyContract: "passed",
    reproduciblePack: "passed",
    freshInstall: {
      status: "passed",
      topLevelInstall: "candidate CLI tarball only",
      ...smoke,
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

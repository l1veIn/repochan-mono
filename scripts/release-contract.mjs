import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import * as tar from "tar";

export const releasePackages = Object.freeze([
  { name: "@repochan/core", dir: "packages/core" },
  { name: "@repochan/image-edit", dir: "packages/image-edit" },
  { name: "@repochan/image-gen", dir: "packages/image-gen" },
  { name: "@repochan/skill", dir: "packages/skill" },
  { name: "@repochan/templates", dir: "packages/templates" },
  { name: "@repochan/starters", dir: "packages/starters" },
  { name: "@repochan/browse", dir: "packages/browse" },
  { name: "repochan", dir: "packages/cli" },
]);

const requiredInternalRuntimeDependencies = Object.freeze({
  "@repochan/browse": Object.freeze(["@repochan/core"]),
  repochan: Object.freeze([
    "@repochan/core",
    "@repochan/image-edit",
    "@repochan/image-gen",
    "@repochan/skill",
    "@repochan/templates",
    "@repochan/browse",
  ]),
});

export const compatibilityDebtRoots = Object.freeze([
  "packages/core/src",
  "packages/cli/src",
  "packages/image-gen/src",
  "packages/image-edit/src",
  "packages/skill/skills",
]);

const compatibilityDebtPatterns = Object.freeze([
  { rule: "legacy-contract", pattern: /\blegacy\b/i },
  { rule: "backward-compatibility", pattern: /\b(?:back-?compat|backwards?[- ]compat(?:ibility|ible)?)\b/i },
  { rule: "deprecated-contract", pattern: /\bdeprecated\b/i },
  { rule: "chinese-compatibility-contract", pattern: /(?:向后兼容|兼容旧|旧版|旧实例|旧格式|旧协议|旧模板|遗留|弃用|已废弃)/ },
]);

const chromaV1Reason = "The explicit v1 option preserves byte-frozen chroma output while v2 remains the default.";
const equalCellReason = "The explicit equal-cell path preserves its documented pixel, QA, and metadata contract.";
const adapterReason = "The public image-edit adapter preserves stable defaults, errors, or output ordering for callers.";
const removeCompatibilityPath = "Remove with the corresponding v1, equal-cell, or adapter contract in an explicitly versioned breaking release.";

/**
 * Closed compatibility waiver inventory. Every waiver binds one path, detector
 * rule, and exact trimmed source line. Zero or multiple matches fail the gate,
 * so edits cannot silently broaden or orphan a waiver.
 */
export const compatibilityDebtWaivers = Object.freeze([
  ["packages/core/src/starter.test.ts", "legacy-contract", "it(\"accepts a legal hybrid config and legacy equal-cell defaults\", () => {", equalCellReason],
  ["packages/cli/src/commands/image.ts", "legacy-contract", "/** repochan image edit chroma-key <img> [--out out.png] [--matte auto|#ff00ff] [--threshold N] [--softness N] [--spill 0.85] [--pipeline v1|v2] (default pipeline v2; v1 = legacy escape hatch) */", chromaV1Reason],
  ["packages/cli/src/commands/image.ts", "legacy-contract", "\"Usage: repochan image edit chroma-key <img> [--out out.png] [--matte auto|#ff00ff|magenta|green|cyan] [--threshold 96] [--softness 34] [--spill 0.85] [--pipeline v1|v2] (default v2; v1 = legacy)\",", chromaV1Reason],
  ["packages/cli/src/commands/image.ts", "legacy-contract", "const pipeline = options.pipeline ?? \"v2\"; // PR7 default; v1 = legacy escape hatch", chromaV1Reason, 1],
  ["packages/cli/src/commands/image.ts", "legacy-contract", "const pipeline = options.pipeline ?? \"v2\"; // PR7 default; v1 = legacy escape hatch", chromaV1Reason, 2],
  ["packages/cli/src/index.ts", "legacy-contract", ".option(\"--pipeline <v>\", \"Chroma pipeline: v2 (default) | v1 (legacy escape hatch) (image edit chroma-key/extract)\")", chromaV1Reason],
  ["packages/image-edit/src/chroma-key.ts", "legacy-contract", "/** Chroma pipeline version. Default \"v2\" (PR7); \"v1\" is the byte-frozen legacy escape hatch. */", chromaV1Reason],
  ["packages/image-edit/src/chroma-pipeline.ts", "legacy-contract", "// (frozen legacy escape hatch).", chromaV1Reason],
  ["packages/image-edit/src/chroma-pipeline.ts", "legacy-contract", "// to the legacy behavior; it is reached only via explicit `pipeline: \"v1\"`.", chromaV1Reason],
  ["packages/image-edit/src/chroma-pipeline.ts", "legacy-contract", "/** Pipeline version. Default \"v2\" (PR7); \"v1\" is the frozen legacy escape hatch. */", chromaV1Reason],
  ["packages/image-edit/src/extract.ts", "legacy-contract", "//     invariant: explicit v1 output stays byte-identical to the legacy", chromaV1Reason],
  ["packages/image-edit/src/extract.ts", "legacy-contract", "//     warns (legacy behavior preserved).", adapterReason],
  ["packages/image-edit/src/extract.ts", "legacy-contract", "| \"edge_touch\" // equal-cell: seed-cell perimeter (legacy)", equalCellReason],
  ["packages/image-edit/src/extract.ts", "legacy-contract", "/** Default \"v2\" (PR7); \"v1\" is the frozen legacy escape hatch. */", chromaV1Reason],
  ["packages/image-edit/src/extract.ts", "legacy-contract", "/** corner = legacy auto; subject-aware = scored candidates. Default \"corner\" when matteColor is auto/omitted. */", adapterReason],
  ["packages/image-edit/src/extract.ts", "legacy-contract", "const ML_BLOB_ALPHA_THRESHOLD = 128; // ml-blobs CC threshold (legacy; design §4)", adapterReason],
  ["packages/image-edit/src/extract.ts", "legacy-contract", "* corner auto → warnings only (legacy behavior), never a defect here.", adapterReason],
  ["packages/image-edit/src/extract.ts", "legacy-contract", "// ── equal-cell (Appendix C: per-cell chroma, legacy pixel path) ────────────", equalCellReason],
  ["packages/image-edit/src/extract.ts", "legacy-contract", "// Legacy defect set and order: empty → ratio low → ratio high → edge touch.", equalCellReason],
  ["packages/image-edit/src/extract.ts", "legacy-contract", "// Legacy PNG gate + max-dimension hard acceptance (§10).", adapterReason],
  ["packages/image-edit/src/extract.ts", "legacy-contract", "// Reading order: top-to-bottom by row, then left-to-right by col (legacy).", adapterReason],
  ["packages/image-edit/src/matte-grid.ts", "legacy-contract", "// legacy extractMatteGrid) is covered by a golden-hash regression test in", equalCellReason],
  ["packages/image-edit/src/matte-grid.ts", "legacy-contract", "/** corner = legacy auto; subject-aware = scored candidates. Default \"corner\". */", adapterReason],
  ["packages/image-edit/src/matte-grid.ts", "legacy-contract", "* Foreground bounds relative to the equal-size source cell (LEGACY for", equalCellReason],
  ["packages/image-edit/src/matte-grid.ts", "legacy-contract", "* legacy `extractMatteGrid:` wording. This function", adapterReason],
  ["packages/image-edit/src/matte-grid.ts", "legacy-contract", "* Map extractAssets failures back to the legacy extractMatteGrid error", adapterReason],
  ["packages/image-edit/src/matte-select.ts", "legacy-contract", "// - \"corner\" (default): legacy corner-mode sampling via estimateMatteColor.", adapterReason],
  ["packages/image-edit/src/matte-select.ts", "backward-compatibility", "/** Default \"corner\" for back-compat of \"auto\". */", adapterReason],
  ["packages/image-edit/src/stickers.ts", "legacy-contract", "// Adapter contract: legacy callers expect plain Errors with the", adapterReason],
].map(([path, rule, text, reason, occurrence = 1]) => Object.freeze({
  path,
  rule,
  text,
  occurrence,
  reason,
  removeWhen: removeCompatibilityPath,
})));

const releaseSurfaceDebtPatterns = Object.freeze([
  { rule: "adr-reference", pattern: /\bADR\b/ },
  { rule: "repositioning-story", pattern: /\breposition(?:ing|ed)?\b|重定位/i },
  { rule: "architecture-history", pattern: /legacy architecture|previous architecture|removed package|downgraded package|旧架构|旧包|已移除|降格|迁移前|迁移后/i },
  { rule: "protocol-history", pattern: /predates (?:the )?(?:current )?protocol|historical (?:--|option|flag|alias)/i },
  { rule: "yolo-ci-conflation", pattern: /yolo\s*[/／]\s*(?:non-interactive|非交互)/i },
  { rule: "completion-story", pattern: /development preview|开发预览|已落地(?:（本分支）)?|完成态 checklist/i },
  { rule: "past-implementation-story", pattern: /\bpreviously\b/i },
]);

/**
 * Find compatibility branches in current runtime/skill contracts.
 *
 * This intentionally does not flag OpenAI-compatible endpoints, Starter
 * runnable fallbacks, or business asset names containing `migrate`. Internal
 * planning artifacts and CHANGELOG are outside these compatibility scan roots.
 */
export function detectCompatibilityDebt(relativePath, source) {
  const findings = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    for (const { rule, pattern } of compatibilityDebtPatterns) {
      const match = line.match(pattern);
      if (match) findings.push({ path: relativePath, line: index + 1, rule, match: match[0], text: line.trim() });
    }
  }
  return findings;
}

function compatibilityFindingKey({ path: findingPath, rule, text }) {
  return JSON.stringify([findingPath, rule, text]);
}

export function applyCompatibilityDebtWaivers(findings, waivers = compatibilityDebtWaivers) {
  if (!Array.isArray(findings) || !Array.isArray(waivers)) {
    throw new Error("Compatibility findings and waivers must be arrays.");
  }

  const waiverSlots = new Map();
  for (const waiver of waivers) {
    for (const field of ["path", "rule", "text", "reason", "removeWhen"]) {
      if (typeof waiver?.[field] !== "string" || waiver[field].trim().length === 0) {
        throw new Error(`Compatibility waiver ${field} must be a non-empty string.`);
      }
    }
    if (!Number.isSafeInteger(waiver.occurrence) || waiver.occurrence < 1) {
      throw new Error("Compatibility waiver occurrence must be a positive integer.");
    }
    const slot = `${compatibilityFindingKey(waiver)}#${waiver.occurrence}`;
    if (waiverSlots.has(slot)) throw new Error(`Duplicate compatibility waiver: ${slot}.`);
    waiverSlots.set(slot, { waiver, matched: false });
  }

  const occurrences = new Map();
  const actionable = [];
  for (const finding of findings) {
    const key = compatibilityFindingKey(finding);
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    const slot = waiverSlots.get(`${key}#${occurrence}`);
    if (slot) slot.matched = true;
    else actionable.push(finding);
  }

  for (const { waiver, matched } of waiverSlots.values()) {
    if (matched) continue;
    actionable.push({
      path: waiver.path,
      line: 0,
      rule: "stale-compatibility-waiver",
      match: waiver.rule,
      text: `Waiver no longer matches occurrence ${waiver.occurrence} of the exact source line. Reason: ${waiver.reason} Removal condition: ${waiver.removeWhen}`,
    });
  }
  return actionable;
}

export async function scanCompatibilityDebt(repositoryRoot) {
  const findings = [];
  async function walk(relativeDir) {
    const absoluteDir = path.join(repositoryRoot, relativeDir);
    for (const entry of await fs.readdir(absoluteDir, { withFileTypes: true })) {
      const relative = path.join(relativeDir, entry.name).split(path.sep).join("/");
      if (entry.isDirectory()) {
        if (entry.name !== "dist" && entry.name !== "node_modules") await walk(relative);
      } else if (/\.(?:ts|md|ya?ml)$/i.test(entry.name)) {
        findings.push(...detectCompatibilityDebt(relative, await fs.readFile(path.join(repositoryRoot, relative), "utf8")));
      }
    }
  }
  for (const relativeRoot of compatibilityDebtRoots) await walk(relativeRoot);
  return applyCompatibilityDebtWaivers(findings);
}

export function detectReleaseSurfaceDebt(relativePath, source) {
  const findings = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    for (const { rule, pattern } of releaseSurfaceDebtPatterns) {
      const match = line.match(pattern);
      if (match) findings.push({ path: relativePath, line: index + 1, rule, match: match[0], text: line.trim() });
    }
  }
  return findings;
}

export async function scanReleaseSurfaceDebt(repositoryRoot) {
  const findings = [];
  const topLevel = new Set(["AGENTS.md", "README.md", "README_zh.md", "ARCHITECTURE.md", "CHANGELOG.md"]);
  async function walk(relativeDir = "") {
    const absoluteDir = path.join(repositoryRoot, relativeDir);
    for (const entry of await fs.readdir(absoluteDir, { withFileTypes: true })) {
      const relative = path.join(relativeDir, entry.name).split(path.sep).join("/");
      if (entry.isDirectory()) {
        const isInsideHiddenTree = relative.split("/").some((segment) => segment.startsWith("."));
        const directoryRole = entry.name.replace(/^\.+/, "");
        const isHiddenPlanningDirectory = isInsideHiddenTree && /^(?:plans?|planning)$/i.test(directoryRole);
        if (isHiddenPlanningDirectory) {
          findings.push({
            path: `${relative}/`,
            line: 0,
            rule: "internal-planning-directory",
            match: entry.name,
            text: "Repository contains an internal planning directory.",
          });
          continue;
        }
        if (![".git", ".zcode", "node_modules", "dist", "test-repos", "test-results", "score-review"].includes(entry.name)) await walk(relative);
        continue;
      }
      const isPublicDocument = topLevel.has(relative) || relative.startsWith("docs/") || (relative.startsWith("packages/") && relative.endsWith("/README.md"));
      const isRuntimeCommentSurface = /packages\/[^/]+\/src\/.*\.ts$/.test(relative) && !/\.(?:test|spec)\.ts$/.test(relative);
      const isSkillContract = relative.startsWith("packages/skill/skills/") && /\.md$/.test(relative);
      if (isPublicDocument || isRuntimeCommentSurface || isSkillContract) {
        findings.push(...detectReleaseSurfaceDebt(relative, await fs.readFile(path.join(repositoryRoot, relative), "utf8")));
      }
    }
  }
  await walk();
  return findings;
}

const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"];
export const defaultNpmRegistry = "https://registry.npmjs.org/";

export function releaseCommandTimeout(value = process.env.REPOCHAN_RELEASE_COMMAND_TIMEOUT_MS ?? "300000") {
  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout) || timeout < 1000) {
    throw new Error("REPOCHAN_RELEASE_COMMAND_TIMEOUT_MS must be an integer of at least 1000 milliseconds.");
  }
  return timeout;
}

/** Resolve a release source ref only when the repository has no tracked or untracked drift. */
export function resolveCleanGitSourceRef(repositoryRoot, sourceRef) {
  if (typeof sourceRef !== "string" || sourceRef.trim().length === 0) {
    throw new Error("Release source ref must be a non-empty git ref.");
  }
  const status = execFileSync("git", ["-C", repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all"], {
    encoding: "utf8",
  });
  if (status.trim()) {
    throw new Error(`Release source ref ${sourceRef} requires a clean worktree; commit or remove every tracked and untracked change first.`);
  }
  return execFileSync("git", ["-C", repositoryRoot, "rev-parse", "--verify", `${sourceRef}^{commit}`], {
    encoding: "utf8",
  }).trim();
}

/** Parse a release manifest while rejecting duplicate top-level JSON keys. */
export function parseReleaseManifest(source, label = "package.json") {
  const manifest = JSON.parse(source);
  const seen = new Set();
  const duplicates = new Set();
  let depth = 0;
  let inString = false;
  let escaped = false;
  let token = "";
  let keyCandidate = false;
  let pendingKey;
  let expectingKey = false;

  for (const character of source) {
    if (inString) {
      if (escaped) {
        token += character;
        escaped = false;
      } else if (character === "\\") {
        token += character;
        escaped = true;
      } else if (character === '"') {
        inString = false;
        if (keyCandidate) pendingKey = JSON.parse(`"${token}"`);
      } else {
        token += character;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      token = "";
      keyCandidate = depth === 1 && expectingKey;
    } else if (character === "{") {
      depth += 1;
      if (depth === 1) expectingKey = true;
    } else if (character === "}") {
      depth -= 1;
    } else if (depth === 1 && character === ":" && pendingKey !== undefined) {
      if (seen.has(pendingKey)) duplicates.add(pendingKey);
      seen.add(pendingKey);
      pendingKey = undefined;
      expectingKey = false;
    } else if (depth === 1 && character === ",") {
      expectingKey = true;
      pendingKey = undefined;
    }
  }

  if (duplicates.size > 0) {
    throw new Error(`${label} contains duplicate top-level key(s): ${[...duplicates].join(", ")}.`);
  }
  return manifest;
}

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

  for (const entry of entries) {
    const { manifest } = entry;
    if (typeof manifest.version !== "string" || manifest.version.length === 0) {
      throw new Error(`${manifest.name} has no packed version.`);
    }
    if (manifest.license !== "MIT") {
      throw new Error(`${manifest.name} must declare license=MIT in the packed manifest.`);
    }
    if (manifest.publishConfig?.registry !== defaultNpmRegistry || manifest.publishConfig?.access !== "public") {
      throw new Error(`${manifest.name} must explicitly publish publicly to ${defaultNpmRegistry}.`);
    }

    const packedFiles = entry.files?.map((file) => typeof file === "string" ? file : file?.path).filter(Boolean);
    if (!Array.isArray(packedFiles) || packedFiles.length === 0) {
      throw new Error(`${manifest.name} is missing its immutable packed file inventory.`);
    }
    if (!packedFiles.some((file) => /(^|\/)licen[cs]e(?:\.[^/]*)?$/i.test(file))) {
      throw new Error(`${manifest.name} tarball is missing a license file.`);
    }
    const testArtifact = packedFiles.find((file) =>
      /(^|\/)(?:__tests__|tests?)(\/|$)/i.test(file) || /\.(?:test|spec)\.[^/]+$/i.test(file),
    );
    if (testArtifact) {
      throw new Error(`${manifest.name} tarball contains compiled test artifact ${testArtifact}.`);
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

  for (const [packageName, requiredDependencies] of Object.entries(requiredInternalRuntimeDependencies)) {
    const runtimeDependencies = byName.get(packageName)?.manifest?.dependencies ?? {};
    for (const dependency of requiredDependencies) {
      if (!(dependency in runtimeDependencies)) {
        throw new Error(`${packageName} is missing required runtime dependency ${dependency}.`);
      }
    }
  }

  const cliDependencies = byName.get("repochan").manifest.dependencies ?? {};
  // @repochan/starters is an independent publishable: the CLI downloads it on
  // demand (`repochan starter sync`) instead of bundling it as a dependency.
  if ("@repochan/starters" in cliDependencies) {
    throw new Error("repochan must not depend on @repochan/starters; starters are synced on demand via `repochan starter sync`.");
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

async function listArchiveEntries(root, relative = "package") {
  const entries = [relative];
  const stat = await fs.lstat(path.join(root, relative));
  if (!stat.isDirectory()) return entries;
  for (const name of (await fs.readdir(path.join(root, relative))).sort()) {
    entries.push(...await listArchiveEntries(root, path.join(relative, name).split(path.sep).join("/")));
  }
  return entries;
}

/** Normalize pnpm's raw pack output into a byte-reproducible npm tarball. */
export async function normalizePackedArchive(rawArchive, destinationArchive, workingDirectory) {
  await fs.rm(workingDirectory, { recursive: true, force: true });
  await fs.mkdir(workingDirectory, { recursive: true });
  await tar.extract({ file: rawArchive, cwd: workingDirectory });
  const manifestPath = path.join(workingDirectory, "package", "package.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  await fs.writeFile(manifestPath, `${JSON.stringify(stableJson(manifest), null, 2)}\n`, "utf8");
  await fs.mkdir(path.dirname(destinationArchive), { recursive: true });
  const entries = await listArchiveEntries(workingDirectory);
  await tar.create({
    cwd: workingDirectory,
    file: destinationArchive,
    gzip: { level: 9 },
    portable: true,
    mtime: new Date(0),
    noDirRecurse: true,
  }, entries);
  return destinationArchive;
}

export async function createGitWorktreeSnapshot(sourceRoot, destinationRoot) {
  const output = execFileSync("git", ["-C", sourceRoot, "ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  const relativePaths = output.toString("utf8").split("\0").filter(Boolean);
  const copiedPaths = [];
  for (const relativePath of relativePaths) {
    const source = path.join(sourceRoot, relativePath);
    const destination = path.join(destinationRoot, relativePath);
    let stat;
    try {
      stat = await fs.lstat(source);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if (stat.isSymbolicLink()) await fs.symlink(await fs.readlink(source), destination);
    else if (stat.isFile()) await fs.copyFile(source, destination);
    copiedPaths.push(relativePath);
  }
  return copiedPaths;
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

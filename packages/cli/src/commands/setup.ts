/**
 * `repochan setup` — resolve bundled pi packages and register them in settings.json.
 *
 * Finds each package's physical path via Node module resolution, reads its
 * `package.json > pi` manifest for extension/skill declarations, and writes
 * the resolved paths to `~/.repochan/pi/settings.json` (global scope).
 *
 * After setup, the Pi runtime auto-discovers all extensions and skills from
 * settings — no hardcoded paths in runtime.ts.
 */

import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { OUR_AGENT_DIR } from "../lib/runtime.js";
import { bullet, heading, dim, yesNo, type OutputOptions, printJson } from "./common.js";

// ---------------------------------------------------------------------------
// Types — minimal subset of what we need from package.json
// ---------------------------------------------------------------------------

interface PiManifest {
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
}

interface PackageJson {
  name: string;
  version?: string;
  pi?: PiManifest;
}

interface BundledPackage {
  /** npm package name, e.g. "repochan-pi" */
  name: string;
  /** Resolved absolute path to the package directory */
  dir: string;
  /** Parsed package.json */
  manifest: PackageJson;
}

// ---------------------------------------------------------------------------
// Bundled pi packages — the packages CLI depends on that contain Pi resources
// ---------------------------------------------------------------------------

const BUNDLED_PACKAGE_NAMES = [
  "repochan-pi",
  "@repochan/image-gen-pi",
];

// ---------------------------------------------------------------------------
// Resolve a bundled package's directory via Node module resolution
// ---------------------------------------------------------------------------

function resolvePackageDir(packageName: string): string {
  // createRequire lets us resolve from the CLI's own location — works in both
  // dev (workspace symlink) and production (real node_modules) layouts.
  const require = createRequire(import.meta.url);
  const pkgJsonPath = require.resolve(`${packageName}/package.json`);
  return path.dirname(pkgJsonPath);
}

function collectBundledPackages(): BundledPackage[] {
  const found: BundledPackage[] = [];
  for (const name of BUNDLED_PACKAGE_NAMES) {
    try {
      const dir = resolvePackageDir(name);
      const raw = fs.readFileSync(path.join(dir, "package.json"), "utf8");
      const manifest = JSON.parse(raw) as PackageJson;
      found.push({ name, dir, manifest });
    } catch {
      // Package not installed — skip, will be reported as missing
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Build settings paths from packages
// ---------------------------------------------------------------------------

interface ResolvedResources {
  extensionPaths: string[];
  skillPaths: string[];
  promptPaths: string[];
  themePaths: string[];
}

function resolveResourcesFromPackages(packages: BundledPackage[]): ResolvedResources {
  const result: ResolvedResources = {
    extensionPaths: [],
    skillPaths: [],
    promptPaths: [],
    themePaths: [],
  };

  for (const pkg of packages) {
    const pi = pkg.manifest.pi;
    if (!pi) continue;

    for (const ext of pi.extensions ?? []) {
      result.extensionPaths.push(path.resolve(pkg.dir, ext));
    }
    for (const skill of pi.skills ?? []) {
      result.skillPaths.push(path.resolve(pkg.dir, skill));
    }
    for (const prompt of pi.prompts ?? []) {
      result.promptPaths.push(path.resolve(pkg.dir, prompt));
    }
    for (const theme of pi.themes ?? []) {
      result.themePaths.push(path.resolve(pkg.dir, theme));
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Write to settings.json
// ---------------------------------------------------------------------------

interface GlobalSettings {
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
  [key: string]: unknown;
}

function readGlobalSettings(): GlobalSettings {
  const settingsPath = path.join(OUR_AGENT_DIR, "settings.json");
  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    return JSON.parse(raw) as GlobalSettings;
  } catch {
    return {};
  }
}

function writeGlobalSettings(settings: GlobalSettings): void {
  const settingsPath = path.join(OUR_AGENT_DIR, "settings.json");
  fs.mkdirSync(OUR_AGENT_DIR, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Verify that a file/dir actually exists
// ---------------------------------------------------------------------------

function pathExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export interface SetupOptions extends OutputOptions {
  force?: boolean;
}

export async function runSetup(options: SetupOptions = {}) {
  // --- Step 1: Resolve all bundled packages ---
  const packages = collectBundledPackages();
  const missing = BUNDLED_PACKAGE_NAMES.filter(
    (name) => !packages.some((p) => p.name === name),
  );

  // --- Step 2: Resolve resources ---
  const resources = resolveResourcesFromPackages(packages);

  // --- Step 3: Verify all paths exist ---
  const missingPaths: string[] = [];
  for (const ext of resources.extensionPaths) {
    if (!pathExists(ext)) missingPaths.push(ext);
  }
  for (const skill of resources.skillPaths) {
    if (!pathExists(skill)) missingPaths.push(skill);
  }

  // --- Step 4: Write to settings.json ---
  const existing = readGlobalSettings();
  const newSettings: GlobalSettings = {
    ...existing,
    extensions: resources.extensionPaths,
    skills: resources.skillPaths,
  };
  if (resources.promptPaths.length > 0) {
    newSettings.prompts = resources.promptPaths;
  }
  if (resources.themePaths.length > 0) {
    newSettings.themes = resources.themePaths;
  }

  writeGlobalSettings(newSettings);

  // --- Step 5: Report ---
  if (options.json) {
    printJson({
      installed: packages.map((p) => ({
        name: p.name,
        version: p.manifest.version ?? "unknown",
        dir: p.dir,
      })),
      missing,
      missingPaths,
      settings: {
        extensions: resources.extensionPaths,
        skills: resources.skillPaths,
      },
    });
    return;
  }

  heading("RepoChan Setup");
  bullet("agent dir", OUR_AGENT_DIR);

  console.log();
  for (const pkg of packages) {
    const pi = pkg.manifest.pi;
    const extCount = pi?.extensions?.length ?? 0;
    const skillCount = pi?.skills?.length ?? 0;
    bullet(
      pkg.name,
      `${pkg.manifest.version ?? "?"} (${extCount} ext, ${skillCount} skills)`,
    );
  }

  if (missing.length > 0) {
    console.log();
    for (const name of missing) {
      console.log(`  ${dim("⚠ missing:")} ${name}`);
    }
  }

  if (missingPaths.length > 0) {
    console.log();
    console.log(dim("  ⚠ Some resolved paths do not exist:"));
    for (const p of missingPaths) {
      console.log(dim(`    ${p}`));
    }
  }

  console.log();
  bullet("extensions", resources.extensionPaths.length);
  bullet("skills", resources.skillPaths.length);
  bullet("settings.json", path.join(OUR_AGENT_DIR, "settings.json"));
  bullet("ready", yesNo(missing.length === 0 && missingPaths.length === 0));
}

/**
 * Config loading — JSON files, project overrides global (gh/aws convention).
 *   Global:  ~/.repochan/image.json
 *   Project: <cwd>/.repochan/image.json
 *
 * Credentials live here + env vars (FAL_KEY / OPENAI_API_KEY etc.). core/cli
 * have no concept of credentials (ADR §8.4). This package never touches
 * .repochan/ *protocol* artifacts — only reads its own config file.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { ImageGenConfig } from "./types.js";

const GLOBAL_CONFIG_PATH = join(homedir(), ".repochan", "image.json");
const PROJECT_CONFIG_REL = join(".repochan", "image.json");

function tryReadJson(path: string): Partial<ImageGenConfig> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<ImageGenConfig>;
  } catch {
    return {};
  }
}

/** Expand ${VAR} / $VAR references from process.env inside string values. */
function expandEnvVar(value: string): string {
  return value.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/gi, (_, name: string) => process.env[name] ?? "");
}

/** Recursively expand ${ENV} in all string values of the config. */
function expandConfig(config: ImageGenConfig): ImageGenConfig {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return expandEnvVar(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(config) as ImageGenConfig;
}

/**
 * Load config: global ← project overlay. Env-var references are expanded at
 * load time so API keys can reference ${FAL_KEY} etc. without hardcoding.
 */
export function loadConfig(cwd: string): ImageGenConfig {
  const globalConfig = tryReadJson(GLOBAL_CONFIG_PATH);
  const projectConfig = tryReadJson(join(cwd, PROJECT_CONFIG_REL));
  return expandConfig({ ...globalConfig, ...projectConfig });
}

/** Save config to the global path (~/.repochan/image.json). Merges endpoints by id. */
export function saveGlobalConfig(config: ImageGenConfig): void {
  mkdirSync(dirname(GLOBAL_CONFIG_PATH), { recursive: true });
  const existing = tryReadJson(GLOBAL_CONFIG_PATH) as ImageGenConfig;
  const merged: ImageGenConfig = {
    ...existing,
    ...config,
    endpoints: {
      ...(existing.endpoints ?? {}),
      ...(config.endpoints ?? {}),
    },
  };
  writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");
}

/** True when at least one endpoint is defined (global and/or project overlay). */
export function hasConfiguredEndpoints(cwd: string): boolean {
  return listEndpointIds(loadConfig(cwd)).length > 0;
}

function listEndpointIds(config: ImageGenConfig): string[] {
  return Object.keys(config.endpoints ?? {});
}

export { GLOBAL_CONFIG_PATH };

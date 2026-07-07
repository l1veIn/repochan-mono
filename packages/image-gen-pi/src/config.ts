/**
 * Config loading — JSON files, project overrides global.
 *   Global:   ~/.pi/agent/extensions/image-gen.json
 *   Project:  <cwd>/.pi/extensions/image-gen.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ImageGenConfig } from "./types.js";

const CONFIG_FILENAME = "image-gen.json";

function tryReadJson(path: string): Partial<ImageGenConfig> {
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as Partial<ImageGenConfig>;
  } catch {
    return {};
  }
}

function expandEnvVar(value: string): string {
  return value.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/gi, (_, name: string) => {
    return process.env[name] ?? "";
  });
}

function expandConfig(config: Partial<ImageGenConfig>): ImageGenConfig {
  const result: ImageGenConfig = { ...config };
  if (result.saveDir) result.saveDir = expandEnvVar(result.saveDir);
  if (result.codex?.apiKey) result.codex.apiKey = expandEnvVar(result.codex.apiKey);
  if (result.fal?.apiKey) result.fal.apiKey = expandEnvVar(result.fal.apiKey);
  if (result.openrouter?.apiKey) result.openrouter.apiKey = expandEnvVar(result.openrouter.apiKey);
  if (result.openai?.apiKey) result.openai.apiKey = expandEnvVar(result.openai.apiKey);
  if (result.xai?.apiKey) result.xai.apiKey = expandEnvVar(result.xai.apiKey);
  return result;
}

export function loadConfig(agentDir: string, cwd: string): ImageGenConfig {
  const globalConfig = tryReadJson(join(agentDir, "extensions", CONFIG_FILENAME));
  const projectConfig = tryReadJson(join(cwd, ".pi", "extensions", CONFIG_FILENAME));
  return expandConfig({ ...globalConfig, ...projectConfig });
}

/** Save config to the global config path. */
export function saveGlobalConfig(agentDir: string, config: ImageGenConfig): void {
  const configPath = join(agentDir, "extensions", CONFIG_FILENAME);
  mkdirSync(dirname(configPath), { recursive: true });
  // Merge with existing to avoid clobbering unrelated keys
  const existing = tryReadJson(configPath);
  writeFileSync(configPath, JSON.stringify({ ...existing, ...config }, null, 2), "utf8");
}

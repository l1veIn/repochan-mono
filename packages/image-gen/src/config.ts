/**
 * Config loading — JSON files, project overrides global (gh/aws convention).
 *   Global:  ~/.repochan/image.json
 *   Project: <cwd>/.repochan/image.json
 *
 * Credentials live here + env vars. core/cli have no concept of credentials.
 * This package never touches .repochan/ *protocol* artifacts — only its own config.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { EndpointConfig, EndpointStatus, ImageGenConfig } from "./types.js";
import { normalizeImageRequestMode, resolveEffectiveMode } from "./resolveMode.js";

const GLOBAL_CONFIG_PATH = join(homedir(), ".repochan", "image.json");
const PROJECT_CONFIG_REL = join(".repochan", "image.json");

const SUPPORTED_MODES = ["auto", "openai", "openai-async"] as const;

export { normalizeImageRequestMode };

/** Normalize one endpoint; missing mode → auto. */
export function normalizeEndpoint(id: string, raw: Partial<EndpointConfig> | undefined): EndpointConfig {
  const ep = raw ?? {};
  return {
    id: String(ep.id || id).trim() || id,
    baseURL: String(ep.baseURL ?? "")
      .trim()
      .replace(/\/$/, ""),
    apiKey: String(ep.apiKey ?? ""),
    model: String(ep.model ?? "gpt-image-2").trim() || "gpt-image-2",
    mode: normalizeImageRequestMode(ep.mode),
    imageGenerationPath: ep.imageGenerationPath?.trim() || undefined,
    imageEditPath: ep.imageEditPath?.trim() || undefined,
    asyncPollPathTemplate: ep.asyncPollPathTemplate?.trim() || undefined,
    timeoutMs: typeof ep.timeoutMs === "number" ? ep.timeoutMs : undefined,
    asyncMaxWaitMs: typeof ep.asyncMaxWaitMs === "number" ? ep.asyncMaxWaitMs : undefined,
  };
}

/** Normalize full config (migrate missing modes → auto). */
export function normalizeConfig(raw: ImageGenConfig): ImageGenConfig {
  const endpoints: Record<string, EndpointConfig> = {};
  for (const [id, ep] of Object.entries(raw.endpoints ?? {})) {
    endpoints[id] = normalizeEndpoint(id, ep);
  }
  return {
    version: raw.version ?? 2,
    defaultEndpoint: raw.defaultEndpoint,
    endpoints,
    aspectRatio: raw.aspectRatio,
    size: raw.size,
    outputFormat: raw.outputFormat,
  };
}

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
 * load time. Missing mode defaults to "auto".
 */
export function loadConfig(cwd: string): ImageGenConfig {
  const globalConfig = tryReadJson(GLOBAL_CONFIG_PATH);
  const projectConfig = tryReadJson(join(cwd, PROJECT_CONFIG_REL));
  const merged = { ...globalConfig, ...projectConfig } as ImageGenConfig;
  if (projectConfig.endpoints) {
    merged.endpoints = projectConfig.endpoints;
  } else if (globalConfig.endpoints) {
    merged.endpoints = globalConfig.endpoints;
  }
  return expandConfig(normalizeConfig(merged));
}

/** Save config to the global path (~/.repochan/image.json). Merges endpoints by id. */
export function saveGlobalConfig(config: ImageGenConfig): void {
  mkdirSync(dirname(GLOBAL_CONFIG_PATH), { recursive: true });
  const existing = tryReadJson(GLOBAL_CONFIG_PATH) as ImageGenConfig;
  const toWrite: ImageGenConfig = {
    version: 2,
    defaultEndpoint: config.defaultEndpoint ?? existing.defaultEndpoint,
    endpoints: {
      ...(existing.endpoints ?? {}),
      ...(config.endpoints ?? {}),
    },
    aspectRatio: config.aspectRatio ?? existing.aspectRatio,
    size: config.size ?? existing.size,
    outputFormat: config.outputFormat ?? existing.outputFormat,
  };
  const endpoints: Record<string, EndpointConfig> = {};
  for (const [id, ep] of Object.entries(toWrite.endpoints ?? {})) {
    endpoints[id] = {
      ...normalizeEndpoint(id, ep),
      apiKey: ep.apiKey ?? "",
      baseURL: String(ep.baseURL ?? "")
        .trim()
        .replace(/\/$/, ""),
    };
  }
  toWrite.endpoints = endpoints;
  writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(toWrite, null, 2) + "\n", "utf8");
}

/** True when at least one endpoint is defined (global and/or project overlay). */
export function hasConfiguredEndpoints(cwd: string): boolean {
  return listEndpointIds(loadConfig(cwd)).length > 0;
}

function listEndpointIds(config: ImageGenConfig): string[] {
  return Object.keys(config.endpoints ?? {});
}

/** List endpoints without secrets (for `repochan image status`). */
export function listEndpointStatuses(config: ImageGenConfig): EndpointStatus[] {
  const ids = Object.keys(config.endpoints ?? {});
  const defaultId = config.defaultEndpoint ?? ids[0];
  return ids.map((id) => {
    const ep = normalizeEndpoint(id, config.endpoints?.[id]);
    const resolved = resolveEffectiveMode(ep);
    return {
      id,
      baseURL: ep.baseURL,
      model: ep.model,
      mode: resolved.configured,
      effectiveMode: resolved.effective,
      modeSource: resolved.source,
      hasKey: Boolean(ep.apiKey && ep.apiKey.trim()),
      isDefault: id === defaultId,
    };
  });
}

export { GLOBAL_CONFIG_PATH, SUPPORTED_MODES };

/**
 * Config loading — JSON files, project overrides global (gh/aws convention).
 *   Global:  ~/.repochan/image.json
 *   Project: <cwd>/.repochan/image.json
 *
 * Credentials live here + env vars. core/cli have no concept of credentials.
 * This package never touches .repochan/ *protocol* artifacts — only its own config.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { EndpointConfig, EndpointStatus, ImageGenConfig } from "./types.js";
import { normalizeImageRequestMode, resolveEffectiveMode } from "./resolveMode.js";
import { mergeConfigLayers } from "./config-merge.js";
import { writeConfigFileAtomic } from "./config-file.js";

const GLOBAL_CONFIG_PATH = join(homedir(), ".repochan", "image.json");
const PROJECT_CONFIG_REL = join(".repochan", "image.json");

const SUPPORTED_MODES = ["auto", "openai", "openai-async"] as const;
const CONFIG_FIELDS = ["version", "defaultEndpoint", "endpoints", "aspectRatio", "size", "outputFormat"] as const;
const ENDPOINT_FIELDS = [
  "id", "baseURL", "apiKey", "model", "mode", "imageGenerationPath", "imageEditPath",
  "asyncPollPathTemplate", "timeoutMs", "asyncMaxWaitMs",
] as const;

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

/** Normalize the current config; endpoint mode defaults to auto. */
export function normalizeConfig(raw: ImageGenConfig): ImageGenConfig {
  const endpoints: Record<string, EndpointConfig> = {};
  for (const [id, ep] of Object.entries(raw.endpoints ?? {})) {
    endpoints[id] = normalizeEndpoint(id, ep);
  }
  return {
    version: 2,
    defaultEndpoint: raw.defaultEndpoint,
    endpoints,
    aspectRatio: raw.aspectRatio,
    size: raw.size,
    outputFormat: raw.outputFormat,
  };
}

function readConfigFile(path: string): Partial<ImageGenConfig> {
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid image config JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateStoredConfig(parsed, path);
}

function storedRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  return value as Record<string, unknown>;
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`${label} contains unknown field(s): ${unknown.join(", ")}.`);
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

function positiveFiniteNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive finite number.`);
  return value;
}

function validateStoredConfig(value: unknown, file: string): ImageGenConfig {
  const config = storedRecord(value, `Image config at ${file}`);
  rejectUnknownFields(config, CONFIG_FIELDS, `Image config at ${file}`);
  if (config.version !== 2) throw new Error(`Image config at ${file} must declare \"version\": 2.`);
  const endpointsValue = config.endpoints;
  if (endpointsValue === undefined) throw new Error(`Image config at ${file}.endpoints is required.`);
  const rawEndpoints = storedRecord(endpointsValue, `Image config at ${file}.endpoints`);
  const endpoints: Record<string, EndpointConfig> = {};
  for (const [endpointId, rawEndpoint] of Object.entries(rawEndpoints)) {
    const endpoint = storedRecord(rawEndpoint, `Image config at ${file}.endpoints.${endpointId}`);
    rejectUnknownFields(endpoint, ENDPOINT_FIELDS, `Image config at ${file}.endpoints.${endpointId}`);
    if (endpoint.id !== endpointId) throw new Error(`Image config at ${file}.endpoints.${endpointId}.id must equal \"${endpointId}\".`);
    for (const field of ["baseURL", "apiKey", "model"] as const) {
      if (typeof endpoint[field] !== "string") throw new Error(`Image config at ${file}.endpoints.${endpointId}.${field} must be a string.`);
    }
    if (!(endpoint.baseURL as string).trim()) throw new Error(`Image config at ${file}.endpoints.${endpointId}.baseURL must not be empty.`);
    if (!(endpoint.model as string).trim()) throw new Error(`Image config at ${file}.endpoints.${endpointId}.model must not be empty.`);
    if (endpoint.mode !== undefined && !SUPPORTED_MODES.includes(endpoint.mode as typeof SUPPORTED_MODES[number])) {
      throw new Error(`Image config at ${file}.endpoints.${endpointId}.mode must be one of: ${SUPPORTED_MODES.join(", ")}.`);
    }
    endpoints[endpointId] = {
      id: endpointId,
      baseURL: endpoint.baseURL as string,
      apiKey: endpoint.apiKey as string,
      model: endpoint.model as string,
      mode: endpoint.mode as EndpointConfig["mode"],
      imageGenerationPath: optionalString(endpoint.imageGenerationPath, `Image config at ${file}.endpoints.${endpointId}.imageGenerationPath`),
      imageEditPath: optionalString(endpoint.imageEditPath, `Image config at ${file}.endpoints.${endpointId}.imageEditPath`),
      asyncPollPathTemplate: optionalString(endpoint.asyncPollPathTemplate, `Image config at ${file}.endpoints.${endpointId}.asyncPollPathTemplate`),
      timeoutMs: positiveFiniteNumber(endpoint.timeoutMs, `Image config at ${file}.endpoints.${endpointId}.timeoutMs`),
      asyncMaxWaitMs: positiveFiniteNumber(endpoint.asyncMaxWaitMs, `Image config at ${file}.endpoints.${endpointId}.asyncMaxWaitMs`),
    };
  }
  const defaultEndpoint = optionalString(config.defaultEndpoint, `Image config at ${file}.defaultEndpoint`);
  if (defaultEndpoint !== undefined && !(defaultEndpoint in endpoints)) {
    throw new Error(`Image config at ${file}.defaultEndpoint must name a configured endpoint.`);
  }
  const aspectRatio = config.aspectRatio;
  if (aspectRatio !== undefined && !["landscape", "square", "portrait"].includes(String(aspectRatio))) {
    throw new Error(`Image config at ${file}.aspectRatio must be landscape, square, or portrait.`);
  }
  const outputFormat = config.outputFormat;
  if (outputFormat !== undefined && !["png", "jpeg", "webp"].includes(String(outputFormat))) {
    throw new Error(`Image config at ${file}.outputFormat must be png, jpeg, or webp.`);
  }
  return {
    version: 2,
    defaultEndpoint,
    endpoints,
    aspectRatio: aspectRatio as ImageGenConfig["aspectRatio"],
    size: optionalString(config.size, `Image config at ${file}.size`),
    outputFormat: outputFormat as ImageGenConfig["outputFormat"],
  };
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
  const globalConfig = readConfigFile(GLOBAL_CONFIG_PATH);
  const projectConfig = readConfigFile(join(cwd, PROJECT_CONFIG_REL));
  const merged = mergeConfigLayers(globalConfig, projectConfig);
  const validated = validateStoredConfig(normalizeConfig(merged), "merged image config");
  return expandConfig(validated);
}

/** Save config to the global path (~/.repochan/image.json). Merges endpoints by id. */
export function saveGlobalConfig(config: ImageGenConfig): void {
  const existing = readConfigFile(GLOBAL_CONFIG_PATH) as ImageGenConfig;
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
  const validated = validateStoredConfig(toWrite, GLOBAL_CONFIG_PATH);
  writeConfigFileAtomic(GLOBAL_CONFIG_PATH, JSON.stringify(validated, null, 2) + "\n");
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

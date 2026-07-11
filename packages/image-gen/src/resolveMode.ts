/**
 * Resolve configured mode + host rules → runtime mode for one request.
 *
 * Priority (high → low):
 * 1. Call override when openai | openai-async (explicit CLI --mode)
 * 2. Endpoint mode when openai | openai-async (user locked)
 * 3. Host rule table (BUILTIN_HOST_RULES)
 * 4. Default classic openai
 *
 * "auto" never reaches the wire — only openai | openai-async do.
 * Never re-POSTs after failure to "try the other mode" (double-bill risk).
 */

import type { EndpointConfig, ImageRequestMode, RuntimeImageMode } from "./types.js";
import { detectModeFromHost, matchHostRule } from "./hostRules.js";

export type ModeResolution = {
  /** As stored / requested (may be auto). */
  configured: ImageRequestMode;
  /** Used for headers + submit path. */
  effective: RuntimeImageMode;
  /** override | config | host-rule | default */
  source: "override" | "config" | "host-rule" | "default";
  hostRuleNote?: string;
};

const RUNTIME: RuntimeImageMode[] = ["openai", "openai-async"];
const ALL: ImageRequestMode[] = ["auto", "openai", "openai-async"];

export function normalizeImageRequestMode(value: unknown): ImageRequestMode {
  const mode = String(value ?? "")
    .trim()
    .toLowerCase();
  return (ALL as string[]).includes(mode) ? (mode as ImageRequestMode) : "auto";
}

export function isRuntimeMode(value: unknown): value is RuntimeImageMode {
  return (RUNTIME as string[]).includes(String(value ?? "").trim().toLowerCase());
}

/**
 * Resolve runtime mode for an endpoint.
 * @param override - CLI/generate option; "auto" means "no override"
 */
export function resolveEffectiveMode(
  endpoint: Pick<EndpointConfig, "baseURL" | "mode">,
  override?: ImageRequestMode,
): ModeResolution {
  const configured = normalizeImageRequestMode(endpoint.mode);

  // 1) Explicit call override (not auto)
  if (override && isRuntimeMode(override)) {
    return { configured, effective: override, source: "override" };
  }

  // 2) Explicit endpoint lock
  if (configured === "openai" || configured === "openai-async") {
    return { configured, effective: configured, source: "config" };
  }

  // 3) Host rules (only when auto / missing)
  const rule = matchHostRule(endpoint.baseURL);
  if (rule) {
    return {
      configured,
      effective: rule.mode,
      source: "host-rule",
      hostRuleNote: rule.note,
    };
  }

  // Optional env force for dogfood / advanced users
  const envMode = process.env.REPOCHAN_IMAGE_MODE?.trim().toLowerCase();
  if (envMode && isRuntimeMode(envMode)) {
    return { configured, effective: envMode, source: "override" };
  }

  // 4) Classic OpenAI-compatible (no X-Async)
  return { configured, effective: "openai", source: "default" };
}

export { detectModeFromHost };

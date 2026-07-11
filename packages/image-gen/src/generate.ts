/**
 * Image generation dispatcher.
 *
 * Effective mode resolution (see resolveMode.ts):
 *   override → explicit config → host rule → classic openai
 *
 * Runtime modes:
 * 1. openai       — classic sync (no X-Async); job_id → opportunistic poll
 * 2. openai-async — X-Async-Mode + poll
 *
 * Never auto-retries a full generation (IMAGE_MAX_RETRIES = 0).
 * Never switches mode and re-POSTs after failure (double-bill risk).
 */

import type {
  EndpointConfig,
  GenerateParams,
  GenerateResult,
  ImageGenConfig,
  ImageRequestMode,
} from "./types.js";
import { normalizeEndpoint } from "./config.js";
import {
  createImageFetch,
  IMAGE_HTTP_LONG_TIMEOUT_MS,
  IMAGE_HTTP_TIMEOUT_MS,
  IMAGE_MAX_RETRIES,
  ImageGenError,
  isGptImage2Model,
  pngMagicOk,
} from "./http.js";
import { resolveEffectiveMode, normalizeImageRequestMode } from "./resolveMode.js";
import { generateOpenAI } from "./modes/openai.js";
import { generateOpenAIAsync } from "./modes/openai-async.js";
import type { ModeContext } from "./modes/shared.js";

export {
  IMAGE_HTTP_TIMEOUT_MS,
  IMAGE_HTTP_LONG_TIMEOUT_MS,
  IMAGE_ASYNC_MAX_WAIT_MS,
  IMAGE_ASYNC_POLL_MS,
  IMAGE_MAX_RETRIES,
  IMAGE_AGENT_BASH_TIMEOUT_MS,
  createImageFetch,
} from "./http.js";

export { resolveEffectiveMode, normalizeImageRequestMode } from "./resolveMode.js";
export { BUILTIN_HOST_RULES, matchHostRule, detectModeFromHost } from "./hostRules.js";

/** Aspect-ratio → OpenAI size mapping (gpt-image-2 supports these). */
const SIZE_FOR_RATIO: Record<string, `${number}x${number}`> = {
  landscape: "1536x1024",
  square: "1024x1024",
  portrait: "1024x1536",
};

/** Resolve which endpoint to use: explicit param → config.defaultEndpoint → first. */
export function resolveEndpoint(config: ImageGenConfig, endpointId?: string): EndpointConfig {
  const endpoints = config.endpoints ?? {};
  const ids = Object.keys(endpoints);
  if (ids.length === 0) {
    throw new Error(
      "No image endpoints configured. Run `repochan image configure` (or `repochan setup`) to add one.",
    );
  }
  const id = endpointId ?? config.defaultEndpoint ?? ids[0];
  const ep = endpoints[id];
  if (!ep) throw new Error(`Endpoint '${id}' not found in config. Available: ${ids.join(", ")}`);
  const normalized = normalizeEndpoint(id, ep);
  if (!normalized.baseURL) throw new Error(`Endpoint '${id}' is missing baseURL.`);
  if (!normalized.apiKey) {
    throw new Error(`Endpoint '${id}' is missing apiKey (or its ${"$"}{ENV} is unset).`);
  }
  return normalized;
}

export type GenerateOptions = {
  endpoint?: string;
  /** Override endpoint.mode for this call (debug / CLI --mode). auto = no override. */
  mode?: ImageRequestMode;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/**
 * Generate an image. Returns PNG bytes + provenance; never writes to disk.
 * Never auto-retries a full generation.
 */
export async function generate(
  params: GenerateParams,
  config: ImageGenConfig,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const endpoint = resolveEndpoint(config, options.endpoint);
  const resolution = resolveEffectiveMode(endpoint, options.mode);
  const mode = resolution.effective;

  const defaultTimeout =
    endpoint.timeoutMs ??
    (mode === "openai-async" || isGptImage2Model(endpoint.model)
      ? IMAGE_HTTP_LONG_TIMEOUT_MS
      : IMAGE_HTTP_TIMEOUT_MS);
  const timeoutMs = options.timeoutMs ?? defaultTimeout;
  const fetchFn = createImageFetch(timeoutMs);

  const size: `${number}x${number}` =
    params.size ??
    (params.aspectRatio ? SIZE_FOR_RATIO[params.aspectRatio] : config.size ?? "1024x1024");

  const ctx: ModeContext = {
    endpoint,
    mode,
    params,
    size,
    fetchFn,
    signal: options.signal,
    asyncMaxWaitMs: endpoint.asyncMaxWaitMs,
  };

  const baseMeta = {
    endpoint: endpoint.id,
    model: endpoint.model,
    mode: resolution.configured,
    effectiveMode: mode,
    modeSource: resolution.source,
  };

  try {
    const outcome =
      mode === "openai-async" ? await generateOpenAIAsync(ctx) : await generateOpenAI(ctx);

    const bytes = outcome.bytes;
    if (!bytes.length || bytes.length < 1000) {
      return {
        success: false,
        ...baseMeta,
        jobId: outcome.jobId,
        billedRisk: true,
        error: `Image API returned empty or tiny payload (${bytes.length} bytes).`,
      };
    }

    return {
      success: true,
      image: bytes,
      mimeType: pngMagicOk(bytes) ? "image/png" : "application/octet-stream",
      ...baseMeta,
      jobId: outcome.jobId,
    };
  } catch (err) {
    const jobId = err instanceof ImageGenError ? err.jobId : undefined;
    const billedRisk = err instanceof ImageGenError ? Boolean(err.billedRisk) : true;
    const raw = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      ...baseMeta,
      jobId,
      billedRisk,
      error:
        `${raw} (client maxRetries=${IMAGE_MAX_RETRIES}: no automatic re-generation. ` +
        (jobId ? `jobId=${jobId}. ` : "") +
        `If the relay dashboard shows a completed job, download that result — do not re-submit the same prompt.)`,
    };
  }
}

/** List configured endpoint ids. */
export function listEndpoints(config: ImageGenConfig): string[] {
  return Object.keys(config.endpoints ?? {});
}

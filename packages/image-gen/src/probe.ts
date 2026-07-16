/**
 * Lightweight connectivity probe — does not generate (bill) images.
 * GET {base}/models when available; failure does not prove the URL unusable.
 */

import type { EndpointConfig, ImageGenConfig } from "./types.js";
import { resolveEndpoint } from "./generate.js";
import { createImageFetch, endpointUrl, IMAGE_HTTP_TIMEOUT_MS } from "./http.js";
import { getValidAccessToken } from "./auth/codex-auth-store.js";

export type ProbeResult = {
  endpoint: string;
  baseURL: string;
  mode: string;
  model: string;
  hasKey: boolean;
  modelsStatus?: number;
  modelsOk?: boolean;
  modelsNote?: string;
  error?: string;
};

export async function probeEndpoint(
  config: ImageGenConfig,
  options: { endpoint?: string; timeoutMs?: number } = {},
): Promise<ProbeResult> {
  let ep: EndpointConfig;
  try {
    ep = resolveEndpoint(config, options.endpoint);
  } catch (err) {
    return {
      endpoint: options.endpoint ?? "(none)",
      baseURL: "",
      mode: "openai",
      model: "",
      hasKey: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const result: ProbeResult = {
    endpoint: ep.id,
    baseURL: ep.baseURL,
    mode: ep.mode ?? "openai",
    model: ep.model,
    hasKey: Boolean(ep.apiKey?.trim()),
    modelsNote:
      "GET /models is an OpenAI-compatible probe only. Failure does not mean image generation is unavailable.",
  };

  // Codex endpoints authenticate via OAuth; probe by resolving a valid token
  // (this also exercises the refresh path) instead of GET /models, which the
  // Codex /responses backend does not implement.
  if (ep.auth?.kind === "codex") {
    try {
      const { tokens } = await getValidAccessToken(false);
      result.hasKey = true;
      result.modelsOk = true;
      result.modelsStatus = 200;
      result.modelsNote = `Codex OAuth OK (account ${tokens.account_id}). Token resolves${tokens.refresh_token ? " + refreshes" : ""} without error.`;
    } catch (err) {
      result.modelsOk = false;
      result.error = err instanceof Error ? err.message : String(err);
      result.modelsNote = "Codex OAuth probe failed. Run `codex login` then retry.";
    }
    return result;
  }

  if (!result.hasKey) {
    result.error = "API key empty after env expansion";
    return result;
  }

  const fetchFn = createImageFetch(options.timeoutMs ?? Math.min(IMAGE_HTTP_TIMEOUT_MS, 30_000));
  try {
    const url = endpointUrl(ep, "/models");
    const res = await fetchFn(url, {
      headers: { Authorization: `Bearer ${ep.apiKey}`, Accept: "application/json" },
    });
    result.modelsStatus = res.status;
    result.modelsOk = res.ok;
    if (!res.ok) {
      const text = await res.text();
      result.modelsNote = `GET /models → ${res.status}: ${text.slice(0, 160)}`;
    }
  } catch (err) {
    result.modelsOk = false;
    result.modelsNote = err instanceof Error ? err.message : String(err);
  }

  return result;
}

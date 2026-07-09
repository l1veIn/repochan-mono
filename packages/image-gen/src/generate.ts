/**
 * Image generation via the Vercel AI SDK.
 *
 * Every endpoint is OpenAI-compatible, so the whole provider layer collapses to
 * `createOpenAI({ baseURL, apiKey }).image(model)` + `generateImage()`. This
 * replaces the old 1754-line hand-rolled HTTP per-provider code.
 *
 * Pure library: prompt + config → PNG bytes. No .repochan/ protocol awareness;
 * the caller (cli) decides where to persist. Credentials come from config/env.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateImage } from "ai";
import type { GenerateParams, GenerateResult, ImageGenConfig, EndpointConfig } from "./types.js";

/** Aspect-ratio → OpenAI size mapping (gpt-image-2 supports these). */
const SIZE_FOR_RATIO: Record<string, `${number}x${number}`> = {
  landscape: "1536x1024",
  square: "1024x1024",
  portrait: "1024x1536",
};

/** Resolve which endpoint to use: explicit param → config.defaultEndpoint → first. */
function resolveEndpoint(config: ImageGenConfig, endpointId?: string): EndpointConfig {
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
  if (!ep.baseURL) throw new Error(`Endpoint '${id}' is missing baseURL.`);
  if (!ep.apiKey) throw new Error(`Endpoint '${id}' is missing apiKey (or its ${'$'}{ENV} is unset).`);
  // Config JSON keys the endpoint by id; ensure the returned object carries it.
  return { ...ep, id: ep.id || id };
}

/**
 * Generate an image. Returns PNG bytes + provenance; never writes to disk.
 *
 * @param params  prompt + optional size/format/aspectRatio
 * @param config  loaded ImageGenConfig (endpoints + defaults)
 * @param options endpoint override + abort signal
 */
export async function generate(
  params: GenerateParams,
  config: ImageGenConfig,
  options: { endpoint?: string; signal?: AbortSignal } = {},
): Promise<GenerateResult> {
  const endpoint = resolveEndpoint(config, options.endpoint);
  const provider = createOpenAI({ apiKey: endpoint.apiKey, baseURL: endpoint.baseURL });
  const model = endpoint.model;
  const size: `${number}x${number}` =
    params.size ?? (params.aspectRatio ? SIZE_FOR_RATIO[params.aspectRatio] : config.size ?? "1024x1024");

  try {
    const result = await generateImage({
      model: provider.image(model),
      prompt: params.prompt,
      size,
      ...(options.signal ? { abortSignal: options.signal } : {}),
    });
    const image = result.images[0];
    const bytes = image.uint8Array;
    return {
      success: true,
      image: bytes,
      mimeType: "image/png",
      endpoint: endpoint.id,
      model,
    };
  } catch (err) {
    return {
      success: false,
      endpoint: endpoint.id,
      model,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** List configured endpoint ids (for `repochan image gen setup` / status). */
export function listEndpoints(config: ImageGenConfig): string[] {
  return Object.keys(config.endpoints ?? {});
}

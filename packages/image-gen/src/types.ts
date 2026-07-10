/**
 * Image generation types.
 *
 * The model is deliberately simple: every backend is an "endpoint" — an
 * OpenAI-compatible /images/generations server described by a baseURL + apiKey +
 * default model. This covers switchbase relays, a local codex reverse-proxy,
 * and OpenAI direct alike (they all speak the standard images endpoint, as
 * verified in the Phase 2.0 spike). No provider-specific HTTP code, no OAuth —
 * a user who wants to ride a ChatGPT subscription runs their own reverse proxy
 * and points an endpoint at it.
 */

/** Parameters for a generation request. */
export interface GenerateParams {
  prompt: string;
  /** Output aspect ratio. Providers snap to the closest supported size. */
  aspectRatio?: "landscape" | "square" | "portrait";
  /** Explicit dimensions (override aspectRatio when the provider allows). */
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  outputFormat?: "png" | "jpeg" | "webp";
  /**
   * Reference images for image-to-image / multi-image conditioning.
   * Each entry is raw image bytes + mime type. Passed to the AI SDK's
   * `generateImage({ prompt: { images, text } })` — used for cross-asset
   * visual consistency (e.g. foundation sheet as character reference).
   */
  referenceImages?: Array<{ data: Uint8Array; mimeType: string }>;
}

/** Result of a generation request. */
export interface GenerateResult {
  success: boolean;
  /** PNG bytes on success. */
  image?: Uint8Array;
  mimeType?: string;
  /** Which endpoint + model produced this. */
  endpoint: string;
  model: string;
  error?: string;
}

/**
 * One OpenAI-compatible image endpoint.
 *   { baseURL, apiKey, model } → createOpenAI({ baseURL, apiKey }).image(model)
 */
export interface EndpointConfig {
  /** A friendly id, e.g. "switchbase", "codex-proxy", "openai". */
  id: string;
  /** OpenAI-compatible base URL, e.g. "https://switchbase.vip/v1". */
  baseURL: string;
  /** Bearer token. Supports ${ENV_VAR} expansion from config. */
  apiKey: string;
  /** Default model id, e.g. "gpt-image-2". */
  model: string;
}

export interface ImageGenConfig {
  /** Active endpoint id. If unset, the first endpoint is used. */
  defaultEndpoint?: string;
  /** Named endpoints. */
  endpoints?: Record<string, EndpointConfig>;
  /** Default aspect ratio / size / format (applied when params omit them). */
  aspectRatio?: "landscape" | "square" | "portrait";
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  outputFormat?: "png" | "jpeg" | "webp";
}

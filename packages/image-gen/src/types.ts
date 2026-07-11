/**
 * Image generation types.
 *
 * Every backend is an "endpoint" — baseURL + apiKey + model + mode.
 * Modes (Infinite-Canvas-inspired, scoped down):
 *   - auto          default: classic OpenAI; host rules may upgrade to openai-async;
 *                   response job_id triggers opportunistic poll (no X-Async headers)
 *   - openai        force classic sync (no X-Async headers)
 *   - openai-async  force X-Async-Mode + poll async-generations
 *
 * Credentials live in image-gen config + env; this package never writes
 * protocol artifacts under project `.repochan/`.
 */

/** Configured / CLI mode (includes adaptive auto). */
export type ImageRequestMode = "auto" | "openai" | "openai-async";

/** Mode actually used for a single HTTP generation (never auto). */
export type RuntimeImageMode = "openai" | "openai-async";

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
   * Each entry is raw image bytes + mime type. Sent via multipart /images/edits.
   */
  referenceImages?: Array<{ data: Uint8Array; mimeType: string }>;
}

/** Result of a generation request. */
export interface GenerateResult {
  success: boolean;
  /** Image bytes on success. */
  image?: Uint8Array;
  mimeType?: string;
  /** Which endpoint + model produced this. */
  endpoint: string;
  model: string;
  /** Configured mode (may be auto). */
  mode: ImageRequestMode;
  /** Resolved runtime mode used for this call. */
  effectiveMode: RuntimeImageMode;
  /** Why effectiveMode was chosen: override | config | host-rule | default. */
  modeSource?: string;
  /** Async job id when known (submit, poll, or failure after 202). */
  jobId?: string;
  /**
   * True when the upstream may already have billed (timeout after submit,
   * body-read failure, 504 after long wait). Callers must not blind re-POST.
   */
  billedRisk?: boolean;
  error?: string;
}

/**
 * One OpenAI-compatible image endpoint.
 */
export interface EndpointConfig {
  /** A friendly id, e.g. "local-proxy", "openai". */
  id: string;
  /** OpenAI-compatible base URL, e.g. "https://api.openai.com/v1". */
  baseURL: string;
  /** Bearer token. Supports ${ENV_VAR} expansion from config. */
  apiKey: string;
  /** Default model id, e.g. "gpt-image-2". */
  model: string;
  /**
   * Request protocol. Defaults to "auto" (classic unless host rule matches).
   * Use "openai-async" only when the relay requires X-Async-Mode on submit.
   */
  mode?: ImageRequestMode;
  /** Override POST path for text-to-image (default /images/generations). */
  imageGenerationPath?: string;
  /** Override POST path for image edits (default /images/edits). */
  imageEditPath?: string;
  /**
   * Poll path template for openai-async (default /images/async-generations/{jobId}).
   * Use {jobId} placeholder.
   */
  asyncPollPathTemplate?: string;
  /** Per-request HTTP timeout override (ms). */
  timeoutMs?: number;
  /** Overall async poll budget override (ms). */
  asyncMaxWaitMs?: number;
}

export interface ImageGenConfig {
  /** Schema version. Missing → treated as v1 (endpoints default mode=auto). */
  version?: number;
  /** Active endpoint id. If unset, the first endpoint is used. */
  defaultEndpoint?: string;
  /** Named endpoints. */
  endpoints?: Record<string, EndpointConfig>;
  /** Default aspect ratio / size / format (applied when params omit them). */
  aspectRatio?: "landscape" | "square" | "portrait";
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  outputFormat?: "png" | "jpeg" | "webp";
}

/** Public status row (no secrets). */
export interface EndpointStatus {
  id: string;
  baseURL: string;
  model: string;
  /** Configured mode (auto | openai | openai-async). */
  mode: ImageRequestMode;
  /** Resolved runtime mode for this baseURL. */
  effectiveMode: RuntimeImageMode;
  modeSource: string;
  hasKey: boolean;
  isDefault: boolean;
}

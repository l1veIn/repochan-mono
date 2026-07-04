/**
 * Shared types for the image-gen-pi package.
 *
 * The core abstraction is `ImageGenProvider` — each backend implements this
 * interface and registers itself with the registry. The extension entry point
 * resolves the active provider + model and dispatches `image_generate` calls.
 */

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface ProviderContext {
  cwd: string;
  sessionId: string;
  getApiKeyForProvider: (provider: string) => Promise<string | undefined>;
  signal?: AbortSignal;
  onProgress?: (message: string, details?: Record<string, unknown>) => void;
}

export interface GenerateParams {
  prompt: string;
  aspectRatio: "landscape" | "square" | "portrait";
  /**
   * Optional explicit output dimensions. When provided, these take precedence
   * over aspectRatio for providers that support arbitrary sizes (FAL).
   * Providers with fixed size tables (OpenAI, Codex, xAI) will snap to the
   * closest supported size.
   */
  width?: number;
  height?: number;
  outputFormat?: "png" | "jpeg" | "webp";
  /** Source image for image-to-image / editing. */
  imageUrl?: string;
  /** Additional style/composition reference images. */
  referenceImageUrls?: string[];
}

export interface GenerateResult {
  success: boolean;
  image?: string;
  mimeType?: string;
  provider: string;
  model: string;
  revisedPrompt?: string;
  error?: string;
}

/** What a provider/backend can do. */
export interface ProviderCapabilities {
  /** "text" = text-to-image, "image" = image-to-image / editing. */
  modalities: ("text" | "image")[];
  /** Max reference images supported (0 = text-only). */
  maxReferenceImages: number;
}

/** A selectable model in the /image_model picker. */
export interface ModelOption {
  /** Unique ID across all providers: `"codex-oauth:gpt-image-2"`. */
  id: string;
  /** Human-readable label for the selector. */
  display: string;
  /** Which provider serves this model. */
  providerName: string;
  /** Provider-specific model identifier. */
  modelName: string;
  /** Short badge: "fast", "quality", "subscription", "value". */
  badge?: string;
  /** One-line description. */
  tag?: string;
}

export interface ImageGenProvider {
  readonly name: string;
  readonly displayName: string;
  isAvailable(ctx: ProviderContext): Promise<boolean>;
  /** Return all models this provider offers. */
  listModels(): ModelOption[];
  /** Capabilities for a specific model (or default). */
  capabilities(modelName?: string): ProviderCapabilities;
  generate(params: GenerateParams, ctx: ProviderContext): Promise<GenerateResult>;
}

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export type SaveMode = "none" | "project" | "global" | "custom";
export type AspectRatio = "landscape" | "square" | "portrait";

export interface ProviderConfig {
  model?: string;
  apiKey?: string;
  /** Custom base URL for OpenAI-compatible relay/proxy stations (openai provider only). */
  baseUrl?: string;
}

export interface ImageGenConfig {
  /** Active provider name. */
  provider?: string;
  /** Selected model id from the catalog (e.g. "codex-oauth:gpt-image-2"). */
  model?: string;
  save?: SaveMode;
  saveDir?: string;
  aspectRatio?: AspectRatio;
  outputFormat?: "png" | "jpeg" | "webp";
  codex?: ProviderConfig;
  fal?: ProviderConfig;
  openai?: ProviderConfig;
  xai?: ProviderConfig;
}

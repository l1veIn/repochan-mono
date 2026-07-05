/**
 * OpenAI API Key Image Generation Provider
 * =========================================
 *
 * Uses a standard OpenAI API key (OPENAI_API_KEY) to call the public
 * Images API at api.openai.com.
 *
 * Supports:
 * - Text-to-image: POST /v1/images/generations
 * - Image-to-image: POST /v1/images/edits
 *
 * Models: gpt-image-1, dall-e-3
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  GenerateParams,
  GenerateResult,
  ImageGenProvider,
  ModelOption,
  ProviderCapabilities,
  ProviderConfig,
  ProviderContext,
} from "../types.js";

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const ASPECT_TO_SIZE: Record<string, string> = {
  landscape: "1536x1024",
  square: "1024x1024",
  portrait: "1024x1536",
};

/**
 * gpt-image-1 supports: 1024x1024, 1536x1024, 1024x1536.
 * dall-e-3 supports: 1024x1024, 1792x1024, 1024x1792.
 * Given desired width/height, snap to the closest supported size for the model.
 */
const DALLE3_SIZES = [
  { w: 1024, h: 1024, label: "1024x1024" },
  { w: 1792, h: 1024, label: "1792x1024" },
  { w: 1024, h: 1792, label: "1024x1792" },
];

function resolveSize(model: string, width?: number, height?: number, aspectRatio?: string): string {
  // dall-e-3 only supports fixed sizes — must snap.
  if (model.includes("dall-e-3")) {
    const supported = DALLE3_SIZES;
    if (width && height) {
      const targetRatio = width / height;
      let best = supported[0];
      let bestDiff = Infinity;
      for (const s of supported) {
        const diff = Math.abs(s.w / s.h - targetRatio);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = s;
        }
      }
      return best.label;
    }
    if (aspectRatio === "landscape") return "1792x1024";
    if (aspectRatio === "portrait") return "1024x1792";
    return "1024x1024";
  }
  // gpt-image-1 / gpt-image-2 support arbitrary sizes — pass through exact
  // dimensions when provided. Clamp to a sane range to avoid API rejection.
  if (width && height) {
    const w = Math.max(256, Math.min(4096, Math.round(width)));
    const h = Math.max(256, Math.min(4096, Math.round(height)));
    return `${w}x${h}`;
  }
  // Fall back to aspectRatio → standard gpt-image sizes.
  if (aspectRatio === "landscape") return "1536x1024";
  if (aspectRatio === "portrait") return "1024x1536";
  return "1024x1024";
}

const MODELS: ModelOption[] = [
  {
    id: "openai:gpt-image-1",
    display: "GPT Image 1 (OpenAI API)",
    providerName: "openai",
    modelName: "gpt-image-1",
    badge: "paid",
    tag: "Public API, text + image editing",
  },
  {
    id: "openai:dall-e-3",
    display: "DALL-E 3 (OpenAI API)",
    providerName: "openai",
    modelName: "dall-e-3",
    badge: "value",
    tag: "Older but widely available, text-to-image",
  },
];

export class OpenAIApiProvider implements ImageGenProvider {
  readonly name = "openai";
  readonly displayName = "OpenAI API";

  private apiKey: string | undefined;
  private modelOverride: string | undefined;
  private baseUrl: string = DEFAULT_OPENAI_BASE;

  configure(config?: ProviderConfig): void {
    this.apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
    this.modelOverride = config?.model;
    this.baseUrl = config?.baseUrl || DEFAULT_OPENAI_BASE;
  }

  async isAvailable(_ctx: ProviderContext): Promise<boolean> {
    return typeof this.apiKey === "string" && this.apiKey.length > 0;
  }

  listModels(): ModelOption[] {
    return MODELS;
  }

  capabilities(modelName?: string): ProviderCapabilities {
    const model = modelName ?? this.modelOverride ?? "gpt-image-1";
    if (model.includes("dall-e-3")) {
      return { modalities: ["text"], maxReferenceImages: 0 };
    }
    return { modalities: ["text", "image"], maxReferenceImages: 1 };
  }

  async generate(params: GenerateParams, ctx: ProviderContext): Promise<GenerateResult> {
    const model = this.modelOverride ?? "gpt-image-1";

    if (!this.apiKey) {
      return {
        success: false,
        provider: this.name,
        model,
        error: "Missing OpenAI API key. Set OPENAI_API_KEY env var or openai.apiKey in config.",
      };
    }

    try {
      const size = resolveSize(model, params.width, params.height, params.aspectRatio);
      const hasSourceImage = !!params.imageUrl?.trim();
      const hasReferenceImages = !!(params.referenceImageUrls && params.referenceImageUrls.length > 0);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
      };

      // --- Image-to-image / multi-reference: use /v1/images/edits ---
      // gpt-image-1/gpt-image-2 edits endpoint accepts reference images.
      // imageUrl = primary source (img2img base); referenceImageUrls = additional character/style refs.
      // Both are sent as "image" form fields (OpenAI multi-image edit format).
      if ((hasSourceImage || hasReferenceImages) && !model.includes("dall-e-3")) {
        ctx.onProgress?.(
          `Requesting image edit via OpenAI API (${model}, ${hasSourceImage ? "1 source" : "0 source"} + ${params.referenceImageUrls?.length ?? 0} refs)…`,
          { provider: this.name, model },
        );

        const formData = new FormData();
        // Primary source image (imageUrl) if present
        if (hasSourceImage) {
          const imageBuffer = readFileSync(resolve(params.imageUrl!.trim()));
          formData.append("image", new Blob([imageBuffer]), "source.png");
        }
        // Reference images (character/style anchors) — sent as additional "image" fields
        if (params.referenceImageUrls) {
          for (const refUrl of params.referenceImageUrls) {
            const trimmed = refUrl.trim();
            if (trimmed) {
              try {
                const refBuffer = readFileSync(resolve(trimmed));
                formData.append("image", new Blob([refBuffer]), "reference.png");
              } catch {
                // Skip unreadable reference files rather than failing the whole request
              }
            }
          }
        }
        // If only referenceImageUrls (no imageUrl), the first reference becomes the required "image"
        // FormData naturally handles this — at least one "image" field is present.
        formData.append("prompt", params.prompt);
        formData.append("model", model);
        formData.append("size", size);
        formData.append("n", "1");

        const response = await fetch(`${this.baseUrl}/images/edits`, {
          method: "POST",
          headers,
          body: formData,
          signal: ctx.signal,
        });

        return await this.parseResponse(response, model);
      }

      // --- Text-to-image: POST /v1/images/generations ---
      ctx.onProgress?.(`Requesting image generation via OpenAI API (${model}, ${size})…`, {
        provider: this.name,
        model,
      });

      const body: Record<string, unknown> = {
        model,
        prompt: params.prompt,
        size,
        n: 1,
      };
      // gpt-image-1 returns base64 by default; dall-e-3 needs response_format
      if (model.includes("dall-e-3")) {
        body.response_format = "b64_json";
      }

      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctx.signal,
      });

      return await this.parseResponse(response, model);
    } catch (error) {
      return { success: false, provider: this.name, model, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async parseResponse(response: Response, model: string): Promise<GenerateResult> {
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, provider: this.name, model, error: `OpenAI API error (${response.status}): ${errorText}` };
    }

    const data = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
    };

    const item = data.data?.[0];
    if (!item) {
      return { success: false, provider: this.name, model, error: "OpenAI API returned no image data." };
    }

    // gpt-image-1 returns b64_json directly; dall-e-3 may return url or b64_json
    if (item.b64_json) {
      return {
        success: true,
        provider: this.name,
        model,
        image: item.b64_json,
        mimeType: "image/png",
        revisedPrompt: item.revised_prompt,
      };
    }

    if (item.url) {
      // Download the URL
      const imgResponse = await fetch(item.url);
      if (!imgResponse.ok) {
        return { success: false, provider: this.name, model, error: `Failed to download image (${imgResponse.status}).` };
      }
      const base64 = Buffer.from(await imgResponse.arrayBuffer()).toString("base64");
      return {
        success: true,
        provider: this.name,
        model,
        image: base64,
        mimeType: "image/png",
        revisedPrompt: item.revised_prompt,
      };
    }

    return { success: false, provider: this.name, model, error: "OpenAI API returned neither b64_json nor url." };
  }
}

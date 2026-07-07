/**
 * OpenRouter Image Generation Provider
 * ====================================
 *
 * Uses OpenRouter's image generation API. This covers OpenRouter-compatible
 * relay stations such as Switch Base when they expose the same /images shape.
 *
 * Supports:
 * - Text-to-image: POST /api/v1/images
 * - Image references: input_references[] with data URLs
 */

import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import type {
  GenerateParams,
  GenerateResult,
  ImageGenProvider,
  ModelOption,
  ProviderCapabilities,
  ProviderConfig,
  ProviderContext,
} from "../types.js";

const DEFAULT_OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "google/gemini-2.5-flash-image";

const ASPECT_TO_SIZE: Record<string, string> = {
  landscape: "1536x1024",
  square: "1024x1024",
  portrait: "1024x1536",
};

const MODELS: ModelOption[] = [
  {
    id: "openrouter:google/gemini-2.5-flash-image",
    display: "Gemini 2.5 Flash Image (OpenRouter)",
    providerName: "openrouter",
    modelName: DEFAULT_MODEL,
    badge: "relay",
    tag: "OpenRouter/Switch Base image generation, text + image references",
  },
];

function resolveSize(width?: number, height?: number, aspectRatio?: string): string {
  if (width && height) {
    const w = Math.max(256, Math.min(3840, Math.round(width / 16) * 16));
    const h = Math.max(256, Math.min(3840, Math.round(height / 16) * 16));
    return `${w}x${h}`;
  }
  return ASPECT_TO_SIZE[aspectRatio ?? "square"] ?? "1024x1024";
}

function imageFileToDataUrl(filePath: string): string {
  const absPath = resolve(filePath);
  const data = readFileSync(absPath);
  const ext = extname(absPath).toLowerCase().replace(".", "") || "png";
  const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  return `data:${mimeType};base64,${data.toString("base64")}`;
}

export class OpenRouterProvider implements ImageGenProvider {
  readonly name = "openrouter";
  readonly displayName = "OpenRouter";

  private apiKey: string | undefined;
  private modelOverride: string | undefined;
  private baseUrl: string = DEFAULT_OPENROUTER_BASE;

  configure(config?: ProviderConfig): void {
    this.apiKey = config?.apiKey || process.env.OPENROUTER_API_KEY;
    this.modelOverride = config?.model;
    this.baseUrl = config?.baseUrl || DEFAULT_OPENROUTER_BASE;
  }

  async isAvailable(_ctx: ProviderContext): Promise<boolean> {
    return typeof this.apiKey === "string" && this.apiKey.length > 0;
  }

  listModels(): ModelOption[] {
    const models = [...MODELS];
    if (this.modelOverride && !models.some((m) => m.modelName === this.modelOverride)) {
      models.unshift({
        id: `openrouter:${this.modelOverride}`,
        display: `${this.modelOverride} (OpenRouter)`,
        providerName: "openrouter",
        modelName: this.modelOverride,
        badge: "custom",
        tag: "Configured OpenRouter/Switch Base image model",
      });
    }
    return models;
  }

  capabilities(_modelName?: string): ProviderCapabilities {
    return { modalities: ["text", "image"], maxReferenceImages: 4 };
  }

  async generate(params: GenerateParams, ctx: ProviderContext): Promise<GenerateResult> {
    const model = this.modelOverride ?? DEFAULT_MODEL;
    if (!this.apiKey) {
      return {
        success: false,
        provider: this.name,
        model,
        error: "Missing OpenRouter API key. Set OPENROUTER_API_KEY env var or openrouter.apiKey in config.",
      };
    }

    try {
      const inputReferences: string[] = [];
      if (params.imageUrl?.trim()) {
        inputReferences.push(imageFileToDataUrl(params.imageUrl.trim()));
      }
      if (params.referenceImageUrls) {
        for (const ref of params.referenceImageUrls.slice(0, 3)) {
          if (ref.trim()) inputReferences.push(imageFileToDataUrl(ref.trim()));
        }
      }

      const size = resolveSize(params.width, params.height, params.aspectRatio);
      ctx.onProgress?.(
        `Requesting image generation via OpenRouter (${model}, ${size}, refs=${inputReferences.length})...`,
        { provider: this.name, model, size, referenceCount: inputReferences.length },
      );

      const body: Record<string, unknown> = {
        model,
        prompt: params.prompt,
        size,
      };
      if (inputReferences.length > 0) {
        body.input_references = inputReferences;
      }

      const response = await fetch(`${this.baseUrl}/images`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
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
      return { success: false, provider: this.name, model, error: `OpenRouter API error (${response.status}): ${errorText}` };
    }

    const data = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
    };
    const item = data.data?.[0];
    if (!item) {
      return { success: false, provider: this.name, model, error: "OpenRouter API returned no image data." };
    }
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
      const imgResponse = await fetch(item.url);
      if (!imgResponse.ok) {
        return { success: false, provider: this.name, model, error: `Failed to download image (${imgResponse.status}).` };
      }
      return {
        success: true,
        provider: this.name,
        model,
        image: Buffer.from(await imgResponse.arrayBuffer()).toString("base64"),
        mimeType: "image/png",
        revisedPrompt: item.revised_prompt,
      };
    }

    return { success: false, provider: this.name, model, error: "OpenRouter API returned neither b64_json nor url." };
  }
}

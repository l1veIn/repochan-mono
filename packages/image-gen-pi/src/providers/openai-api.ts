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

const OPENAI_BASE = "https://api.openai.com/v1";
const ASPECT_TO_SIZE: Record<string, string> = {
  landscape: "1536x1024",
  square: "1024x1024",
  portrait: "1024x1536",
};

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

  configure(config?: ProviderConfig): void {
    this.apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
    this.modelOverride = config?.model;
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
      const size = ASPECT_TO_SIZE[params.aspectRatio] ?? "1024x1024";
      const hasSourceImage = !!params.imageUrl?.trim();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
      };

      // --- Image-to-image: use /v1/images/edits ---
      if (hasSourceImage && !model.includes("dall-e-3")) {
        ctx.onProgress?.(`Requesting image edit via OpenAI API (${model})…`, { provider: this.name, model });

        const formData = new FormData();
        const imageBuffer = readFileSync(resolve(params.imageUrl!.trim()));
        formData.append("image", new Blob([imageBuffer]), "source.png");
        formData.append("prompt", params.prompt);
        formData.append("model", model);
        formData.append("size", size);
        formData.append("n", "1");

        const response = await fetch(`${OPENAI_BASE}/images/edits`, {
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

      const response = await fetch(`${OPENAI_BASE}/images/generations`, {
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

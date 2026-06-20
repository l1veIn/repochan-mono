/**
 * xAI (Grok) Image Generation Provider
 * =====================================
 *
 * Uses XAI_API_KEY env var or xai.apiKey in config to call xAI's
 * OpenAI-compatible image API at api.x.ai.
 *
 * Model: grok-2-image (text-to-image)
 */

import type {
  GenerateParams,
  GenerateResult,
  ImageGenProvider,
  ModelOption,
  ProviderCapabilities,
  ProviderConfig,
  ProviderContext,
} from "../types.js";

const XAI_BASE = "https://api.x.ai/v1";
const ASPECT_TO_SIZE: Record<string, string> = {
  landscape: "1536x1024",
  square: "1024x1024",
  portrait: "1024x1536",
};

const MODELS: ModelOption[] = [
  {
    id: "xai:grok-2-image",
    display: "Grok 2 Image (xAI)",
    providerName: "xai",
    modelName: "grok-2-image",
    badge: "paid",
    tag: "xAI's native image generation, text-to-image",
  },
];

interface XaiImageResponse {
  data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  error?: { message: string };
}

export class XaiProvider implements ImageGenProvider {
  readonly name = "xai";
  readonly displayName = "xAI (Grok)";

  private apiKey: string | undefined;

  configure(config?: ProviderConfig): void {
    this.apiKey = config?.apiKey || process.env.XAI_API_KEY;
  }

  async isAvailable(_ctx: ProviderContext): Promise<boolean> {
    return typeof this.apiKey === "string" && this.apiKey.length > 0;
  }

  listModels(): ModelOption[] {
    return MODELS;
  }

  capabilities(_modelName?: string): ProviderCapabilities {
    return { modalities: ["text"], maxReferenceImages: 0 };
  }

  async generate(params: GenerateParams, ctx: ProviderContext): Promise<GenerateResult> {
    const model = "grok-2-image";

    if (!this.apiKey) {
      return {
        success: false,
        provider: this.name,
        model,
        error: "Missing xAI API key. Set XAI_API_KEY env var or xai.apiKey in config.",
      };
    }

    try {
      const size = ASPECT_TO_SIZE[params.aspectRatio] ?? "1024x1024";

      ctx.onProgress?.(`Requesting image generation via xAI (${model})…`, {
        provider: this.name,
        model,
      });

      const response = await fetch(`${XAI_BASE}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt: params.prompt,
          size,
          n: 1,
          response_format: "b64_json",
        }),
        signal: ctx.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          provider: this.name,
          model,
          error: `xAI API error (${response.status}): ${errorText}`,
        };
      }

      const data = (await response.json()) as XaiImageResponse;

      if (data.error) {
        return { success: false, provider: this.name, model, error: data.error.message };
      }

      const item = data.data?.[0];
      if (!item) {
        return { success: false, provider: this.name, model, error: "xAI API returned no image data." };
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

      return { success: false, provider: this.name, model, error: "xAI API returned neither b64_json nor url." };
    } catch (error) {
      return { success: false, provider: this.name, model, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/**
 * FAL.ai Image Generation Provider
 * =================================
 *
 * Queue-based REST API. Requires FAL_KEY env var or fal.apiKey in config.
 *
 * Curated catalog includes the most popular FAL models across providers
 * (Google Nano Banana, OpenAI GPT Image 2, Black Forest Labs FLUX, etc).
 * Users can also specify a custom model ID via config or /image_model.
 *
 * Image-to-image support:
 * - nano-banana-pro: accepts reference images
 * - gpt-image-2: has a dedicated image-to-image endpoint
 * - Other models: text-only
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

const FAL_QUEUE_BASE = "https://queue.fal.run";
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 180_000;

const ASPECT_TO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  landscape: { width: 1536, height: 1024 },
  square: { width: 1024, height: 1024 },
  portrait: { width: 1024, height: 1536 },
};

// ---------------------------------------------------------------------------
// Model catalog — curated popular models
// ---------------------------------------------------------------------------

const MODELS: ModelOption[] = [
  // --- Google ---
  {
    id: "fal:nano-banana-pro",
    display: "Nano Banana Pro (FAL)",
    providerName: "fal",
    modelName: "fal-ai/nano-banana-pro",
    badge: "quality",
    tag: "Google Gemini 3 Pro Image, semantic reasoning, up to 14 ref images",
  },
  {
    id: "fal:nano-banana-2",
    display: "Nano Banana 2 (FAL)",
    providerName: "fal",
    modelName: "fal-ai/nano-banana/nano-banana-2",
    badge: "fast",
    tag: "Google SOTA, fast 1-4 step generation + editing",
  },
  // --- OpenAI ---
  {
    id: "fal:gpt-image-2",
    display: "GPT Image 2 (FAL)",
    providerName: "fal",
    modelName: "fal-ai/gpt-image-2",
    badge: "quality",
    tag: "OpenAI's latest via FAL, fine typography, text + image editing",
  },
  // --- Black Forest Labs FLUX 2 ---
  {
    id: "fal:flux-2-pro",
    display: "FLUX 2 Pro (FAL)",
    providerName: "fal",
    modelName: "fal-ai/blackforest-labs/flux-2/pro",
    badge: "quality",
    tag: "Latest FLUX, style transfer, sequential editing",
  },
  {
    id: "fal:flux-2-klein",
    display: "FLUX 2 Klein 9B (FAL)",
    providerName: "fal",
    modelName: "fal-ai/blackforest-labs/flux-2/klein",
    badge: "value",
    tag: "Enhanced realism, crisp text, native editing",
  },
  // --- Black Forest Labs FLUX 1 ---
  {
    id: "fal:flux-schnell",
    display: "FLUX 1 Schnell (FAL)",
    providerName: "fal",
    modelName: "fal-ai/flux/schnell",
    badge: "fast",
    tag: "Fastest, cheapest — 4 steps, great for iteration",
  },
  {
    id: "fal:flux-dev",
    display: "FLUX 1 Dev (FAL)",
    providerName: "fal",
    modelName: "fal-ai/flux/dev",
    badge: "value",
    tag: "Balanced quality and speed — 28 steps",
  },
  {
    id: "fal:flux-pro-ultra",
    display: "FLUX 1.1 Pro Ultra (FAL)",
    providerName: "fal",
    modelName: "fal-ai/flux-pro/v1.1-ultra",
    badge: "quality",
    tag: "Up to 2K resolution, maximum detail",
  },
  // --- Others ---
  {
    id: "fal:ideogram-v3",
    display: "Ideogram V3 (FAL)",
    providerName: "fal",
    modelName: "fal-ai/recraft/ideogram/v3",
    badge: "value",
    tag: "Posters, logos, exceptional typography",
  },
  {
    id: "fal:recraft-v3",
    display: "Recraft V3 (FAL)",
    providerName: "fal",
    modelName: "fal-ai/recraft/v3",
    badge: "value",
    tag: "Brand styles, vector art, long text generation",
  },
  {
    id: "fal:seedream-4-5",
    display: "Seedream 4.5 (FAL)",
    providerName: "fal",
    modelName: "fal-ai/bytedance/seedream/v4-5",
    badge: "value",
    tag: "ByteDance unified generation + editing",
  },
];

/** Models that support image-to-image / editing. */
const EDIT_CAPABLE = new Set([
  "fal-ai/nano-banana-pro",
  "fal-ai/gpt-image-2",
  "fal-ai/blackforest-labs/flux-2/pro",
  "fal-ai/blackforest-labs/flux-2/klein",
  "fal-ai/bytedance/seedream/v4-5",
]);

interface FalQueueStatus {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  error?: string;
}

interface FalQueueResult {
  images?: Array<{ url: string }>;
  image?: { url: string };
}

export class FalProvider implements ImageGenProvider {
  readonly name = "fal";
  readonly displayName = "FAL.ai";

  private apiKey: string | undefined;
  private modelOverride: string | undefined;

  configure(config?: ProviderConfig): void {
    this.apiKey = config?.apiKey || process.env.FAL_KEY;
    this.modelOverride = config?.model;
  }

  async isAvailable(_ctx: ProviderContext): Promise<boolean> {
    return typeof this.apiKey === "string" && this.apiKey.length > 0;
  }

  listModels(): ModelOption[] {
    return MODELS;
  }

  capabilities(modelName?: string): ProviderCapabilities {
    const model = modelName ?? this.modelOverride ?? "";
    if (EDIT_CAPABLE.has(model)) {
      // nano-banana-pro supports up to 14 refs; others typically 1
      const maxRefs = model === "fal-ai/nano-banana-pro" ? 14 : 1;
      return { modalities: ["text", "image"], maxReferenceImages: maxRefs };
    }
    return { modalities: ["text"], maxReferenceImages: 0 };
  }

  /** Get the active model — override or first catalog entry. */
  private getActiveModel(): string {
    return this.modelOverride ?? "fal-ai/flux/schnell";
  }

  async generate(params: GenerateParams, ctx: ProviderContext): Promise<GenerateResult> {
    const model = this.getActiveModel();

    if (!this.apiKey) {
      return {
        success: false,
        provider: this.name,
        model,
        error: "Missing FAL API key. Set FAL_KEY env var or fal.apiKey in image-gen.json.",
      };
    }

    try {
      // Use explicit dimensions if provided, otherwise map from aspectRatio
      const dims = (params.width && params.height)
        ? { width: params.width, height: params.height }
        : (ASPECT_TO_DIMENSIONS[params.aspectRatio] ?? ASPECT_TO_DIMENSIONS.square);
      const hasSourceImage = !!params.imageUrl?.trim();
      const caps = this.capabilities(model);

      // Determine endpoint — some models have dedicated edit endpoints
      let endpoint = model;
      if (hasSourceImage && caps.modalities.includes("image")) {
        if (model === "fal-ai/gpt-image-2") {
          endpoint = "fal-ai/gpt-image-2/image-to-image";
        }
      }

      const submitUrl = `${FAL_QUEUE_BASE}/${endpoint}`;
      ctx.onProgress?.(`Submitting to FAL (${model})…`, { provider: this.name, model });

      // --- Build payload ---
      const payload: Record<string, unknown> = {
        prompt: params.prompt,
        image_size: { width: dims.width, height: dims.height },
        num_images: 1,
      };

      // Model-specific defaults
      if (model.includes("schnell")) {
        payload.num_inference_steps = 4;
      }

      // Image-to-image: attach source image
      if (hasSourceImage && caps.modalities.includes("image")) {
        if (model === "fal-ai/nano-banana-pro") {
          // nano-banana-pro accepts reference_image_urls array
          const refs = [params.imageUrl!.trim()];
          if (params.referenceImageUrls) {
            refs.push(...params.referenceImageUrls.slice(0, 13));
          }
          payload.reference_image_urls = refs;
        } else {
          // gpt-image-2 edit endpoint and others use image_url
          payload.image_url = params.imageUrl!.trim();
        }
      }

      // --- Submit ---
      const submitResponse = await fetch(submitUrl, {
        method: "POST",
        headers: { Authorization: `Key ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctx.signal,
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        return { success: false, provider: this.name, model, error: `FAL submit failed (${submitResponse.status}): ${errorText}` };
      }

      const submitBody = (await submitResponse.json()) as { request_id: string };
      const requestId = submitBody.request_id;
      if (!requestId) {
        return { success: false, provider: this.name, model, error: "FAL submit did not return a request_id." };
      }

      // --- Poll ---
      const statusUrl = `${FAL_QUEUE_BASE}/${endpoint}/requests/${requestId}/status`;
      const startTime = Date.now();

      ctx.onProgress?.("Waiting for FAL to process…", { requestId });

      let status: FalQueueStatus["status"] = "IN_QUEUE";
      while (status !== "COMPLETED") {
        if (ctx.signal?.aborted) return { success: false, provider: this.name, model, error: "Aborted." };
        if (Date.now() - startTime > POLL_TIMEOUT_MS) {
          return { success: false, provider: this.name, model, error: `FAL timed out after ${POLL_TIMEOUT_MS / 1000}s.` };
        }
        await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));

        const statusResponse = await fetch(statusUrl, {
          headers: { Authorization: `Key ${this.apiKey}` },
          signal: ctx.signal,
        });
        if (!statusResponse.ok) continue;

        const statusBody = (await statusResponse.json()) as FalQueueStatus;
        status = statusBody.status;

        if (status === "FAILED") {
          return { success: false, provider: this.name, model, error: statusBody.error || "FAL generation failed." };
        }
      }

      // --- Get result ---
      const resultUrl = `${FAL_QUEUE_BASE}/${endpoint}/requests/${requestId}/get`;
      const resultResponse = await fetch(resultUrl, {
        headers: { Authorization: `Key ${this.apiKey}` },
        signal: ctx.signal,
      });
      if (!resultResponse.ok) {
        return { success: false, provider: this.name, model, error: `FAL get result failed (${resultResponse.status}).` };
      }

      const resultBody = (await resultResponse.json()) as FalQueueResult;
      const imageUrl = resultBody.images?.[0]?.url ?? resultBody.image?.url;
      if (!imageUrl) {
        return { success: false, provider: this.name, model, error: "FAL result did not contain an image URL." };
      }

      // --- Download → base64 ---
      ctx.onProgress?.("Downloading generated image…");
      const imageResponse = await fetch(imageUrl, { signal: ctx.signal });
      if (!imageResponse.ok) {
        return { success: false, provider: this.name, model, error: `Failed to download FAL image (${imageResponse.status}).` };
      }

      const base64 = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
      const contentType = imageResponse.headers.get("content-type") || "image/png";

      return { success: true, provider: this.name, model, image: base64, mimeType: contentType };
    } catch (error) {
      return { success: false, provider: this.name, model, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

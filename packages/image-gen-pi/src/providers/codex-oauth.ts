/**
 * Codex OAuth Image Generation Provider
 * =====================================
 *
 * Uses Pi's built-in `openai-codex` provider auth to call the Codex Responses
 * backend with the native `image_generation` tool (gpt-image-2).
 *
 * Supports:
 * - Text-to-image (default)
 * - Image-to-image / editing (pass imageUrl — sent as input_image content)
 */

import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import type {
  GenerateParams,
  GenerateResult,
  ImageGenProvider,
  ModelOption,
  ProviderCapabilities,
  ProviderContext,
} from "../types.js";

const PROVIDER_NAME = "openai-codex";
const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
const OPENAI_BETA_HEADER = "responses=experimental";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

const ASPECT_TO_SIZE: Record<string, string> = {
  landscape: "1536x1024",
  square: "1024x1024",
  portrait: "1024x1536",
};

// ---------------------------------------------------------------------------
// Model catalog
// ---------------------------------------------------------------------------

const MODELS: ModelOption[] = [
  {
    id: "codex-oauth:gpt-image-2",
    display: "GPT Image 2 (Codex OAuth)",
    providerName: "codex-oauth",
    modelName: "gpt-image-2",
    badge: "subscription",
    tag: "ChatGPT Plus/Pro subscription, text + image editing",
  },
];

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) {
    throw new Error("OpenAI Codex auth token is not a JWT. Run /login for openai-codex.");
  }
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Failed to decode OpenAI Codex auth token: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function extractChatGptAccountId(token: string): string {
  const payload = decodeJwtPayload(token);
  const authClaims = payload[JWT_CLAIM_PATH];
  if (!authClaims || typeof authClaims !== "object") {
    throw new Error("Codex token missing ChatGPT auth claims. Run /login for openai-codex.");
  }
  const accountId = (authClaims as Record<string, unknown>).chatgpt_account_id;
  if (typeof accountId !== "string" || accountId.length === 0) {
    throw new Error("Codex token missing chatgpt_account_id. Run /login for openai-codex.");
  }
  return accountId;
}

// ---------------------------------------------------------------------------
// Image file reading for image-to-image
// ---------------------------------------------------------------------------

function readImageAsDataUrl(filePath: string): string {
  const absPath = resolve(filePath);
  const data = readFileSync(absPath);
  const ext = extname(absPath).toLowerCase().replace(".", "") || "png";
  const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  return `data:${mimeType};base64,${data.toString("base64")}`;
}

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

interface ParsedCodexResponse {
  imageBase64?: string;
  revisedPrompt?: string;
  text: string[];
  responseId?: string;
  usage?: unknown;
}

type CodexSseEvent =
  | { type: "error"; message?: string; code?: string }
  | { type: "response.failed"; response?: { error?: { message?: string } } }
  | { type: "response.created"; response?: { id?: string } }
  | { type: "response.output_text.delta"; delta?: string }
  | {
      type: "response.output_item.done";
      item?: {
        type?: string;
        id?: string | number;
        status?: string;
        result?: string;
        revised_prompt?: string;
      };
    }
  | { type: "response.completed"; response?: { id?: string; usage?: unknown } };

function parseSseDataLines(chunk: string): string | undefined {
  const data = chunk
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n")
    .trim();
  return data && data !== "[DONE]" ? data : undefined;
}

function handleCodexEvent(event: CodexSseEvent, parsed: ParsedCodexResponse): void {
  switch (event.type) {
    case "error": {
      const e = event as Extract<CodexSseEvent, { type: "error" }>;
      throw new Error(`Codex error: ${e.message || e.code || JSON.stringify(event)}`);
    }
    case "response.failed": {
      const e = event as Extract<CodexSseEvent, { type: "response.failed" }>;
      throw new Error(e.response?.error?.message || "Codex response failed.");
    }
    case "response.created": {
      const e = event as Extract<CodexSseEvent, { type: "response.created" }>;
      if (typeof e.response?.id === "string") parsed.responseId = e.response.id;
      break;
    }
    case "response.output_text.delta": {
      const e = event as Extract<CodexSseEvent, { type: "response.output_text.delta" }>;
      if (typeof e.delta === "string") parsed.text.push(e.delta);
      break;
    }
    case "response.output_item.done": {
      const e = event as Extract<CodexSseEvent, { type: "response.output_item.done" }>;
      const item = e.item;
      if (item?.type === "image_generation_call") {
        if (typeof item.result !== "string" || item.result.length === 0) {
          throw new Error("Codex image_generation_call did not contain image data.");
        }
        parsed.imageBase64 = item.result;
        parsed.revisedPrompt = typeof item.revised_prompt === "string" ? item.revised_prompt : undefined;
      }
      break;
    }
    case "response.completed": {
      const e = event as Extract<CodexSseEvent, { type: "response.completed" }>;
      if (typeof e.response?.id === "string") parsed.responseId = e.response.id;
      if (e.response?.usage) parsed.usage = e.response.usage;
      break;
    }
  }
}

async function parseCodexSse(response: Response, signal?: AbortSignal): Promise<ParsedCodexResponse> {
  if (!response.body) throw new Error("Codex response did not include a stream body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parsed: ParsedCodexResponse = { text: [] };

  try {
    while (true) {
      if (signal?.aborted) throw new Error("Image generation was aborted.");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const chunk = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const data = parseSseDataLines(chunk);
        if (data) handleCodexEvent(JSON.parse(data) as CodexSseEvent, parsed);
        separator = buffer.indexOf("\n\n");
      }
    }
    const remaining = parseSseDataLines(buffer);
    if (remaining) handleCodexEvent(JSON.parse(remaining) as CodexSseEvent, parsed);
  } finally {
    try {
      await reader.cancel();
    } catch {
      // stream may already be closed
    }
    reader.releaseLock();
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Retry helpers
// ---------------------------------------------------------------------------

function isRetryableStatus(status: number, errorText: string): boolean {
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  return /rate.?limit|overloaded|service.?unavailable|upstream.?connect|connection.?refused/i.test(errorText);
}

function backoffMs(attempt: number): number {
  const jitter = 0.9 + Math.random() * 0.2;
  return BASE_DELAY_MS * 2 ** (attempt - 1) * jitter;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class CodexOAuthProvider implements ImageGenProvider {
  readonly name = "codex-oauth";
  readonly displayName = "Codex OAuth (ChatGPT → gpt-image-2)";

  async isAvailable(ctx: ProviderContext): Promise<boolean> {
    const token = await ctx.getApiKeyForProvider(PROVIDER_NAME);
    return typeof token === "string" && token.length > 0;
  }

  listModels(): ModelOption[] {
    return MODELS;
  }

  capabilities(_modelName?: string): ProviderCapabilities {
    return { modalities: ["text", "image"], maxReferenceImages: 4 };
  }

  async generate(params: GenerateParams, ctx: ProviderContext): Promise<GenerateResult> {
    try {
      const token = await ctx.getApiKeyForProvider(PROVIDER_NAME);
      if (!token) {
        return {
          success: false,
          provider: this.name,
          model: "gpt-image-2",
          error: "Missing openai-codex credentials. Run /login and select ChatGPT Plus/Pro (Codex).",
        };
      }

      const accountId = extractChatGptAccountId(token);
      const outputFormat = params.outputFormat ?? "png";
      const size = ASPECT_TO_SIZE[params.aspectRatio] ?? "1024x1024";

      // --- Build input content (text + optional reference images) ---
      const content: Array<Record<string, unknown>> = [
        { type: "input_text", text: params.prompt },
      ];

      // Image-to-image: add source image and references
      const hasSourceImages = (params.imageUrl && params.imageUrl.trim()) ||
        (params.referenceImageUrls && params.referenceImageUrls.length > 0);

      if (params.imageUrl?.trim()) {
        content.push({ type: "input_image", image_url: readImageAsDataUrl(params.imageUrl.trim()) });
      }
      if (params.referenceImageUrls) {
        for (const ref of params.referenceImageUrls.slice(0, 3)) {
          if (ref.trim()) content.push({ type: "input_image", image_url: readImageAsDataUrl(ref.trim()) });
        }
      }

      const modality = hasSourceImages ? "image-to-image" : "text-to-image";
      ctx.onProgress?.(`Requesting gpt-image-2 generation via Codex (${modality}, ${size})…`, {
        provider: this.name,
        size,
        modality,
      });

      const requestBody = {
        model: "gpt-5.5",
        store: false,
        stream: true,
        prompt_cache_key: ctx.sessionId,
        instructions: hasSourceImages
          ? "You are generating or editing bitmap image assets. Use the provided reference image(s) together with the text prompt. Call the image_generation tool exactly once."
          : "You are generating bitmap image assets. For this request, call the image_generation tool exactly once. Do not answer with only text unless image generation is unavailable.",
        input: [{ role: "user", content }],
        tools: [{ type: "image_generation", output_format: outputFormat, size }],
        tool_choice: "auto",
        parallel_tool_calls: false,
        text: { verbosity: "low" },
      };

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "chatgpt-account-id": accountId,
        originator: "image-gen-pi",
        "OpenAI-Beta": OPENAI_BETA_HEADER,
        accept: "text/event-stream",
        "content-type": "application/json",
      };

      const body = JSON.stringify(requestBody);

      for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        if (ctx.signal?.aborted) {
          return { success: false, provider: this.name, model: "gpt-image-2", error: "Image generation was aborted." };
        }

        const response = await fetch(CODEX_RESPONSES_URL, { method: "POST", headers, body, signal: ctx.signal });

        if (!response.ok) {
          const errorText = await response.text();
          if (attempt <= MAX_RETRIES && isRetryableStatus(response.status, errorText)) {
            const delay = backoffMs(attempt);
            ctx.onProgress?.(`Retrying in ${Math.round(delay)}ms (attempt ${attempt}/${MAX_RETRIES})…`);
            await new Promise<void>((r) => setTimeout(r, delay));
            continue;
          }
          return { success: false, provider: this.name, model: "gpt-image-2", error: `Codex request failed (${response.status}): ${errorText}` };
        }

        const parsed = await parseCodexSse(response, ctx.signal);
        if (!parsed.imageBase64) {
          const textOutput = parsed.text.join("").trim();
          return {
            success: false,
            provider: this.name,
            model: "gpt-image-2",
            error: textOutput ? `Codex did not return an image. Response text: ${textOutput}` : "Codex did not return an image.",
          };
        }

        return {
          success: true,
          provider: this.name,
          model: "gpt-image-2",
          image: parsed.imageBase64,
          mimeType: outputFormat === "jpeg" ? "image/jpeg" : `image/${outputFormat}`,
          revisedPrompt: parsed.revisedPrompt,
        };
      }

      return { success: false, provider: this.name, model: "gpt-image-2", error: "Codex generation failed after all retries." };
    } catch (error) {
      return { success: false, provider: this.name, model: "gpt-image-2", error: error instanceof Error ? error.message : String(error) };
    }
  }
}

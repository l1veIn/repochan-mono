/**
 * Native Codex /responses transport.
 *
 * Codex has no dedicated image endpoint. gpt-image-2 is reached by POSTing to
 * `https://chatgpt.com/backend-api/codex/responses` with an `image_generation`
 * tool, authenticated via a Codex OAuth access token (see ../auth/). The
 * upstream responds with an SSE stream of events; image bytes arrive as a
 * base64 `result` on an `image_generation_call` event.
 *
 * Mirrors the rewrite done by 170-carry/codex-tools (proxy_service.rs).
 *
 * Auth retry policy: a 401 from the upstream triggers ONE refresh + retry.
 * This is the only retry codex mode performs — it is not a full-generation
 * replay (the upstream has not produced an image when it rejects the token),
 * so the global "never auto-retry a generation" invariant still holds.
 */

import { randomUUID } from "node:crypto";
import type { EndpointConfig, GenerateParams } from "../types.js";
import {
  endpointUrl,
  ImageGenError,
  isGptImage2Model,
} from "../http.js";
import { getValidAccessToken } from "../auth/codex-auth-store.js";
import type { ModeContext, SubmitOutcome } from "./shared.js";

/** Controller model used to drive the /responses call. */
const CODEX_CONTROLLER_MODEL = "gpt-5.5";

/** Codex client version/UA strings (must look like the real client). */
const CODEX_ORIGINATOR = "codex_cli_rs";
const CODEX_CLIENT_VERSION = "0.144.0";
const CODEX_USER_AGENT = `codex_cli_rs/${CODEX_CLIENT_VERSION}`;

export type CodexModeContext = ModeContext;

/**
 * Build the /responses request body from OpenAI-style generate params.
 * Exported for unit tests (no network).
 */
export function buildCodexResponsesBody(args: {
  endpoint: EndpointConfig;
  params: GenerateParams;
  size: string;
}): Record<string, unknown> {
  const { endpoint, params, size } = args;
  if (!isGptImage2Model(endpoint.model)) {
    throw new ImageGenError(
      `Codex transport only supports gpt-image-2 (got model "${endpoint.model}").`,
    );
  }

  const tool: Record<string, unknown> = {
    type: "image_generation",
    model: endpoint.model,
    action: params.referenceImages?.length ? "edit" : "generate",
    size,
  };
  if (params.quality) tool.quality = params.quality;
  if (params.outputFormat) tool.output_format = params.outputFormat;

  // Build the user message content: optional reference images first, then text.
  const content: Array<Record<string, unknown>> = [];
  if (params.referenceImages?.length) {
    for (const ref of params.referenceImages) {
      const b64 = Buffer.from(ref.data).toString("base64");
      const mime = ref.mimeType || "image/png";
      content.push({
        type: "input_image",
        image_url: `data:${mime};base64,${b64}`,
      });
    }
  }
  content.push({ type: "input_text", text: params.prompt });

  return {
    model: CODEX_CONTROLLER_MODEL,
    stream: true,
    store: false,
    instructions: "",
    parallel_tool_calls: true,
    reasoning: { effort: "medium", summary: "auto" },
    input: [
      {
        type: "message",
        role: "user",
        content,
      },
    ],
    tools: [tool],
    tool_choice: { type: "image_generation" },
  };
}

/**
 * Parse a buffered Codex SSE response and return the first image (b64) found.
 * Exported for unit tests.
 */
export function parseCodexResponsesSSE(text: string): { b64: string; revisedPrompt?: string } {
  // SSE events are separated by blank lines. Each event may have `data:` lines.
  const events = text.split(/\r?\n\r?\n/);
  for (const evt of events) {
    const dataLines = evt
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim());
    if (!dataLines.length) continue;
    // A single event may carry multiple data lines; OpenAI streams one JSON
    // object per data line. Concatenate only when a line is itself partial,
    // but in practice each data line is a complete JSON object.
    for (const line of dataLines) {
      if (!line || line === "[DONE]") continue;
      let obj: unknown;
      try {
        obj = JSON.parse(line);
      } catch {
        continue; // skip non-JSON keepalive/partial lines
      }
      const result = findImageGenerationResult(obj);
      if (result) return result;
    }
  }
  throw new ImageGenError(
    "Codex /responses stream completed without an image_generation_call result.",
  );
}

/** Walk a parsed SSE payload object for an image_generation_call with a result. */
function findImageGenerationResult(node: unknown): { b64: string; revisedPrompt?: string } | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (obj.type === "image_generation_call" && typeof obj.result === "string" && obj.result) {
    const revised = typeof obj.revised_prompt === "string" ? obj.revised_prompt : undefined;
    return { b64: obj.result, revisedPrompt: revised };
  }
  // Also accept a top-level `response.output[]` array shape (non-streamed).
  if (Array.isArray(obj.output)) {
    for (const item of obj.output) {
      const found = findImageGenerationResult(item);
      if (found) return found;
    }
  }
  // Recurse one level into nested objects/arrays for safety.
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findImageGenerationResult(item);
        if (found) return found;
      }
    } else if (value && typeof value === "object") {
      const found = findImageGenerationResult(value);
      if (found) return found;
    }
  }
  return null;
}

/** Build the headers for an upstream /responses call. */
function buildCodexHeaders(args: { accessToken: string; accountId: string }): Record<string, string> {
  return {
    Authorization: `Bearer ${args.accessToken}`,
    "ChatGPT-Account-Id": args.accountId,
    Accept: "text/event-stream",
    "Content-Type": "application/json",
    Originator: CODEX_ORIGINATOR,
    Version: CODEX_CLIENT_VERSION,
    session_id: randomUUID(),
    "User-Agent": CODEX_USER_AGENT,
    Connection: "Keep-Alive",
  };
}

/**
 * Generate via the Codex /responses transport.
 * Performs at most one 401 → refresh → retry.
 */
export async function generateCodex(ctx: CodexModeContext): Promise<SubmitOutcome> {
  const url = endpointUrl(ctx.endpoint, ctx.endpoint.imageGenerationPath || "/responses");
  const body = buildCodexResponsesBody({
    endpoint: ctx.endpoint,
    params: ctx.params,
    size: ctx.size,
  });

  const sendOnce = async (forceRefresh: boolean): Promise<Response> => {
    const { access_token, tokens } = await getValidAccessToken(forceRefresh, ctx.fetchFn);
    const headers = buildCodexHeaders({ accessToken: access_token, accountId: tokens.account_id });
    return ctx.fetchFn(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctx.signal,
    });
  };

  let res = await sendOnce(false);
  if (res.status === 401) {
    // Single auth refresh + retry. A second 401 surfaces to the caller.
    res = await sendOnce(true);
  }

  const text = await res.text();
  if (!res.ok) {
    const billedRisk = res.status < 500 ? false : true;
    throw new ImageGenError(
      `Codex /responses failed (HTTP ${res.status}): ${text.slice(0, 300)}` +
        (res.status === 401 ? " — token rejected after refresh; re-run `codex login`." : ""),
      { billedRisk },
    );
  }

  const { b64 } = parseCodexResponsesSSE(text);
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  return { bytes };
}

/**
 * Convenience helper for the dispatcher: is this endpoint configured for codex OAuth?
 */
export function isCodexEndpoint(endpoint: EndpointConfig): boolean {
  return endpoint.auth?.kind === "codex";
}

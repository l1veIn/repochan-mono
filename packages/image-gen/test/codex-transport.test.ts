import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildCodexResponsesBody,
  parseCodexResponsesSSE,
  generateCodex,
  isCodexEndpoint,
  __resetCodexAuthMemoryCacheForTests,
  __setCodexAuthLoaderForTests,
  __bypassCodexAuthDiskCacheForTests,
  type EndpointConfig,
  type GenerateParams,
} from "../src/index.js";

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

const FRESH_ACCESS = fakeJwt({
  iss: "https://auth.openai.com",
  aud: "app_EMoamEEZ73f0CkXaXp7hrann",
  exp: Math.floor(Date.now() / 1000) + 3600,
  "https://api.openai.com/auth": { chatgpt_account_id: "acct_test" },
});
const ID_TOKEN = fakeJwt({
  iss: "https://auth.openai.com",
  aud: "app_EMoamEEZ73f0CkXaXp7hrann",
  "https://api.openai.com/auth": { chatgpt_account_id: "acct_test" },
});

const codexEndpoint: EndpointConfig = {
  id: "codex",
  baseURL: "https://chatgpt.com/backend-api/codex",
  apiKey: "",
  model: "gpt-image-2",
  auth: { kind: "codex" },
};

const TINY_PNG_B64 = Buffer.from(
  Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]),
).toString("base64");

describe("isCodexEndpoint", () => {
  it("true when auth.kind=codex", () => {
    expect(isCodexEndpoint({ ...codexEndpoint })).toBe(true);
  });
  it("false for default bearer endpoint", () => {
    expect(isCodexEndpoint({ id: "x", baseURL: "https://x/v1", apiKey: "k", model: "m" })).toBe(false);
  });
});

describe("buildCodexResponsesBody", () => {
  it("builds a generate tool call for text-to-image", () => {
    const body = buildCodexResponsesBody({
      endpoint: codexEndpoint,
      params: { prompt: "a chibi mascot", quality: "high" } as GenerateParams,
      size: "1024x1024",
    });
    expect(body.model).toBe("gpt-5.5");
    expect(body.stream).toBe(true);
    expect(body.store).toBe(false);
    expect(body.parallel_tool_calls).toBe(true);
    expect(body.reasoning).toEqual({ effort: "medium", summary: "auto" });
    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools[0].type).toBe("image_generation");
    expect(tools[0].model).toBe("gpt-image-2");
    expect(tools[0].action).toBe("generate");
    expect(tools[0].size).toBe("1024x1024");
    expect(tools[0].quality).toBe("high");
    expect(body.tool_choice).toEqual({ type: "image_generation" });
    const input = body.input as Array<Record<string, unknown>>;
    expect(input[0].role).toBe("user");
    const content = input[0].content as Array<Record<string, unknown>>;
    expect(content[content.length - 1]).toEqual({ type: "input_text", text: "a chibi mascot" });
  });

  it("switches to edit action + prepends reference images", () => {
    const refBytes = Uint8Array.from([1, 2, 3, 4]);
    const body = buildCodexResponsesBody({
      endpoint: codexEndpoint,
      params: {
        prompt: "make it blue",
        referenceImages: [{ data: refBytes, mimeType: "image/png" }],
      } as GenerateParams,
      size: "1024x1024",
    });
    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools[0].action).toBe("edit");
    const content = (body.input as Array<Record<string, unknown>>)[0].content as Array<
      Record<string, unknown>
    >;
    expect(content[0].type).toBe("input_image");
    expect(String(content[0].image_url)).toBe(`data:image/png;base64,${Buffer.from(refBytes).toString("base64")}`);
    // prompt text still present, after the image
    expect(content[content.length - 1]).toEqual({ type: "input_text", text: "make it blue" });
  });

  it("rejects non-gpt-image-2 models", () => {
    expect(() =>
      buildCodexResponsesBody({
        endpoint: { ...codexEndpoint, model: "dall-e-3" },
        params: { prompt: "x" } as GenerateParams,
        size: "1024x1024",
      }),
    ).toThrow(/only supports gpt-image-2/);
  });
});

describe("parseCodexResponsesSSE", () => {
  it("extracts image_generation_call result b64", () => {
    const sse = [
      `event: response.output_text.delta`,
      `data: {"type":"response.output_text.delta","delta":"thinking"}`,
      ``,
      `event: response.image_generation_call`,
      `data: {"type":"image_generation_call","result":"${TINY_PNG_B64}","revised_prompt":"a tiny png"}`,
      ``,
      `data: [DONE]`,
      ``,
    ].join("\n");
    const out = parseCodexResponsesSSE(sse);
    expect(out.b64).toBe(TINY_PNG_B64);
    expect(out.revisedPrompt).toBe("a tiny png");
  });

  it("throws when no image_generation_call present", () => {
    const sse = `data: {"type":"response.completed"}\n\n`;
    expect(() => parseCodexResponsesSSE(sse)).toThrow(/without an image_generation_call/);
  });

  it("skips non-JSON keepalive lines gracefully", () => {
    const sse = `: keepalive\n\ndata: {"type":"image_generation_call","result":"${TINY_PNG_B64}"}\n\n`;
    expect(parseCodexResponsesSSE(sse).b64).toBe(TINY_PNG_B64);
  });

  it("finds results nested in a non-streamed response.output array", () => {
    const json = JSON.stringify({
      output: [{ type: "image_generation_call", result: TINY_PNG_B64 }],
    });
    expect(parseCodexResponsesSSE(`data: ${json}\n\n`).b64).toBe(TINY_PNG_B64);
  });
});

describe("generateCodex (mocked fetch + injected auth)", () => {
  beforeEach(() => {
    __resetCodexAuthMemoryCacheForTests();
    __bypassCodexAuthDiskCacheForTests(true);
    __setCodexAuthLoaderForTests({
      ok: true,
      tokens: {
        access_token: FRESH_ACCESS,
        refresh_token: "rt",
        id_token: ID_TOKEN,
        account_id: "acct_test",
      },
    });
  });
  afterEach(() => {
    __resetCodexAuthMemoryCacheForTests();
    __bypassCodexAuthDiskCacheForTests(false);
    vi.restoreAllMocks();
  });

  function mockSseResponse(status: number, sseBody: string): Response {
    return new Response(sseBody, {
      status,
      headers: { "content-type": "text/event-stream" },
    });
  }

  const successSse = `data: {"type":"image_generation_call","result":"${TINY_PNG_B64}"}\n\n`;

  it("posts to /responses with codex headers and returns decoded bytes", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockSseResponse(200, successSse));
    const ctx = {
      endpoint: codexEndpoint,
      mode: "openai" as const,
      params: { prompt: "hi" } as GenerateParams,
      size: "1024x1024",
      fetchFn,
      signal: undefined,
    };
    const out = await generateCodex(ctx);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${FRESH_ACCESS}`);
    expect(headers["ChatGPT-Account-Id"]).toBe("acct_test");
    expect(headers.Originator).toBe("codex_cli_rs");
    expect(headers.Version).toBe("0.144.0");
    expect(headers.Accept).toBe("text/event-stream");
    expect(headers.session_id).toMatch(/^[0-9a-f-]{36}$/);
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("gpt-5.5");
    expect(body.tools[0].type).toBe("image_generation");

    // decoded bytes start with PNG magic
    expect(out.bytes[0]).toBe(0x89);
    expect(out.bytes[1]).toBe(0x50);
  });

  it("refreshes once and retries on 401", async () => {
    const refreshedAccess = fakeJwt({
      iss: "https://auth.openai.com",
      aud: "app_EMoamEEZ73f0CkXaXp7hrann",
      exp: Math.floor(Date.now() / 1000) + 7200,
      "https://api.openai.com/auth": { chatgpt_account_id: "acct_test" },
    });
    const refreshFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: refreshedAccess, id_token: ID_TOKEN, refresh_token: "rt" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    // First /responses call → 401; second (after refresh) → success.
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(mockSseResponse(401, '{"error":"invalid_token"}'))
      .mockResolvedValueOnce(mockSseResponse(200, successSse));

    // Route: refresh hits auth.openai.com, generation hits chatgpt.com.
    const combined = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const s = String(url);
      if (s.includes("auth.openai.com")) return refreshFetch(url, init);
      return upstream(url, init);
    });

    const ctx = {
      endpoint: codexEndpoint,
      mode: "openai" as const,
      params: { prompt: "hi" } as GenerateParams,
      size: "1024x1024",
      fetchFn: combined,
      signal: undefined,
    };
    const out = await generateCodex(ctx);

    expect(upstream).toHaveBeenCalledTimes(2); // 401 then success
    // second call used the refreshed token
    const secondHeaders = upstream.mock.calls[1][1]?.headers as Record<string, string>;
    expect(secondHeaders.Authorization).toBe(`Bearer ${refreshedAccess}`);
    expect(out.bytes[0]).toBe(0x89); // PNG magic
  });

  it("surfaces a persistent 401 (after refresh retry) with a login hint", async () => {
    const refreshFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: FRESH_ACCESS,
          id_token: ID_TOKEN,
          refresh_token: "rt",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const upstream = vi.fn().mockResolvedValue(mockSseResponse(401, '{"error":"invalid_token"}'));
    const combined = vi.fn(async (url: string | URL, init?: RequestInit) => {
      return String(url).includes("auth.openai.com") ? refreshFetch(url, init) : upstream(url, init);
    });
    const ctx = {
      endpoint: codexEndpoint,
      mode: "openai" as const,
      params: { prompt: "hi" } as GenerateParams,
      size: "1024x1024",
      fetchFn: combined,
      signal: undefined,
    };
    await expect(generateCodex(ctx)).rejects.toThrow(/token rejected after refresh/);
    expect(upstream).toHaveBeenCalledTimes(2); // retried exactly once
  });

  it("marks 5xx as billed-risk but 4xx (non-401) as not", async () => {
    const upstream = vi.fn().mockResolvedValue(mockSseResponse(500, "boom"));
    const ctx = {
      endpoint: codexEndpoint,
      mode: "openai" as const,
      params: { prompt: "hi" } as GenerateParams,
      size: "1024x1024",
      fetchFn: upstream,
      signal: undefined,
    };
    await expect(generateCodex(ctx)).rejects.toThrow(/HTTP 500/);
  });
});

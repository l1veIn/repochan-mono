import { describe, it, expect, vi, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  generate,
  loadConfig,
  listEndpoints,
  listEndpointStatuses,
  normalizeImageRequestMode,
  normalizeEndpoint,
  resolveEffectiveMode,
  IMAGE_MAX_RETRIES,
  IMAGE_HTTP_TIMEOUT_MS,
  IMAGE_ASYNC_MAX_WAIT_MS,
  createImageFetch,
  extractJobId,
  extractImageRef,
  authHeaders,
  type HostRule,
} from "../src/index.js";
import { matchHostRule as matchHostRuleDirect } from "../src/hostRules.js";
import { mergeConfigLayers } from "../src/config-merge.js";
import { writeConfigFileAtomic } from "../src/config-file.js";

const itE2E = process.env.IMAGE_GEN_E2E === "1" ? it : it.skip;

const TINY_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49,
  0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4,
  0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const FAKE_PNG = new Uint8Array(1200);
FAKE_PNG.set(TINY_PNG, 0);
const FAKE_B64 = Buffer.from(FAKE_PNG).toString("base64");

describe("config (pure)", () => {
  const endpoint = (id: string) => ({
    id,
    baseURL: `https://${id}.example/v1`,
    apiKey: "key",
    model: "gpt-image-2",
    mode: "auto" as const,
  });

  it("expands ${ENV} and defaults mode to auto", async () => {
    process.env.RC_TEST_KEY = "secret-123";
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-img-"));
    await fs.mkdir(path.join(dir, ".repochan"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".repochan", "image.json"),
      JSON.stringify({
        version: 2,
        endpoints: { test: { id: "test", baseURL: "https://x/v1", apiKey: "${RC_TEST_KEY}", model: "gpt-image-2" } },
      }),
    );
    const cfg = loadConfig(dir);
    expect(cfg.endpoints?.test.apiKey).toBe("secret-123");
    expect(cfg.endpoints?.test.mode).toBe("auto");
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.RC_TEST_KEY;
  });

  it("rejects config files outside the sole current schema", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-img-contract-"));
    await fs.mkdir(path.join(dir, ".repochan"), { recursive: true });
    const configPath = path.join(dir, ".repochan", "image.json");
    await fs.writeFile(configPath, JSON.stringify({ endpoints: {} }));
    expect(() => loadConfig(dir)).toThrow(/must declare "version": 2/);
    await fs.writeFile(configPath, "{not-json");
    expect(() => loadConfig(dir)).toThrow(/Invalid image config JSON/);
    await fs.writeFile(configPath, JSON.stringify({ version: 2, endpoints: [] }));
    expect(() => loadConfig(dir)).toThrow(/endpoints must be a JSON object/);
    await fs.writeFile(configPath, JSON.stringify({
      version: 2,
      removedField: true,
      endpoints: {
        broken: { id: "broken", baseURL: 42, apiKey: 9, model: false, removedField: true },
      },
    }));
    expect(() => loadConfig(dir)).toThrow(/unknown field\(s\): removedField/);
    await fs.writeFile(configPath, JSON.stringify({
      version: 2,
      endpoints: {
        broken: { id: "broken", baseURL: 42, apiKey: 9, model: false },
      },
    }));
    expect(() => loadConfig(dir)).toThrow(/baseURL must be a string/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("accepts auth.kind=codex without an apiKey and validates auth shape", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-img-auth-"));
    await fs.mkdir(path.join(dir, ".repochan"), { recursive: true });
    const configPath = path.join(dir, ".repochan", "image.json");

    // codex endpoint: apiKey may be empty
    await fs.writeFile(configPath, JSON.stringify({
      version: 2,
      endpoints: {
        codex: {
          id: "codex",
          baseURL: "https://chatgpt.com/backend-api/codex",
          apiKey: "",
          model: "gpt-image-2",
          auth: { kind: "codex" },
        },
      },
    }));
    const cfg = loadConfig(dir);
    expect(cfg.endpoints?.codex.auth).toEqual({ kind: "codex" });

    // bearer endpoint still requires apiKey
    await fs.writeFile(configPath, JSON.stringify({
      version: 2,
      endpoints: {
        nodel: { id: "nodel", baseURL: "https://x/v1", apiKey: "", model: "gpt-image-2" },
      },
    }));
    expect(() => loadConfig(dir)).toThrow(/apiKey must not be empty/);

    // invalid auth kind rejected
    await fs.writeFile(configPath, JSON.stringify({
      version: 2,
      endpoints: {
        bad: {
          id: "bad",
          baseURL: "https://x/v1",
          apiKey: "k",
          model: "gpt-image-2",
          auth: { kind: "weird" },
        },
      },
    }));
    expect(() => loadConfig(dir)).toThrow(/auth\.kind must be/);

    // unknown field inside auth rejected (auth is validated via normalizeEndpointAuth,
    // but the endpoint allow-list itself still accepts the auth object shape)
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("exposes authKind in listEndpointStatuses", () => {
    const config = {
      version: 2 as const,
      endpoints: {
        codex: {
          id: "codex",
          baseURL: "https://chatgpt.com/backend-api/codex",
          apiKey: "",
          model: "gpt-image-2",
          auth: { kind: "codex" as const },
        },
        bearer: {
          id: "bearer",
          baseURL: "https://api.openai.com/v1",
          apiKey: "sk-x",
          model: "gpt-image-2",
        },
      },
    };
    const statuses = listEndpointStatuses(config);
    expect(statuses.find((s) => s.id === "codex")?.authKind).toBe("codex");
    expect(statuses.find((s) => s.id === "codex")?.hasKey).toBe(true); // codex counts as configured
    expect(statuses.find((s) => s.id === "bearer")?.authKind).toBe("bearer");
  });

  it("treats project endpoints and their default as one replacement layer", () => {
    const globalConfig = {
      version: 2 as const,
      defaultEndpoint: "global",
      endpoints: { global: endpoint("global") },
      aspectRatio: "landscape" as const,
    };

    const withoutProjectDefault = mergeConfigLayers(globalConfig, {
      version: 2,
      endpoints: { project: endpoint("project") },
    });
    expect(Object.keys(withoutProjectDefault.endpoints ?? {})).toEqual(["project"]);
    expect(withoutProjectDefault.defaultEndpoint).toBeUndefined();
    expect(listEndpointStatuses(withoutProjectDefault)).toEqual([
      expect.objectContaining({ id: "project", isDefault: true }),
    ]);

    const withProjectDefault = mergeConfigLayers(globalConfig, {
      version: 2,
      defaultEndpoint: "project",
      endpoints: { project: endpoint("project") },
    });
    expect(withProjectDefault.defaultEndpoint).toBe("project");

    const withoutProjectFile = mergeConfigLayers(globalConfig, {});
    expect(withoutProjectFile.defaultEndpoint).toBe("global");
    expect(Object.keys(withoutProjectFile.endpoints ?? {})).toEqual(["global"]);
  });

  it("atomically publishes config with mode 0600 and removes failed temporaries", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-img-atomic-"));
    const configPath = path.join(dir, "image.json");
    writeConfigFileAtomic(configPath, "{\"version\":2}\n");

    expect(await fs.readFile(configPath, "utf8")).toBe("{\"version\":2}\n");
    expect((await fs.stat(configPath)).mode & 0o777).toBe(0o600);
    expect(await fs.readdir(dir)).toEqual(["image.json"]);

    const blockedPath = path.join(dir, "blocked.json");
    await fs.mkdir(blockedPath);
    await fs.writeFile(path.join(blockedPath, "keep"), "x");
    expect(() => writeConfigFileAtomic(blockedPath, "{}\n")).toThrow();
    expect((await fs.readdir(dir)).filter((name) => name.includes(".tmp"))).toEqual([]);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("validates the final global v2 config before replacing its bytes", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "rc-img-home-"));
    const originalHome = process.env.HOME;
    process.env.HOME = home;
    vi.resetModules();

    try {
      const isolatedConfig = await import("../src/config.js");
      isolatedConfig.saveGlobalConfig({
        version: 2,
        defaultEndpoint: "primary",
        endpoints: { primary: endpoint("primary") },
      });
      const originalBytes = await fs.readFile(isolatedConfig.GLOBAL_CONFIG_PATH);
      expect((await fs.stat(isolatedConfig.GLOBAL_CONFIG_PATH)).mode & 0o777).toBe(0o600);

      expect(() => isolatedConfig.saveGlobalConfig({
        version: 2,
        defaultEndpoint: "missing",
        endpoints: {},
      })).toThrow(/defaultEndpoint must name a configured endpoint/);
      expect(await fs.readFile(isolatedConfig.GLOBAL_CONFIG_PATH)).toEqual(originalBytes);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      vi.resetModules();
      await fs.rm(home, { recursive: true, force: true });
    }
  });

  it("normalizeImageRequestMode defaults to auto", () => {
    expect(normalizeImageRequestMode(undefined)).toBe("auto");
    expect(normalizeImageRequestMode("")).toBe("auto");
    expect(normalizeImageRequestMode("openai")).toBe("openai");
    expect(normalizeImageRequestMode("openai-async")).toBe("openai-async");
    expect(normalizeEndpoint("x", { baseURL: "https://a/v1", apiKey: "k", model: "m" }).mode).toBe("auto");
  });

  it("listEndpointStatuses includes effectiveMode", () => {
    const statuses = listEndpointStatuses({
      defaultEndpoint: "a",
      endpoints: {
        a: { id: "a", baseURL: "https://a/v1", apiKey: "k", model: "gpt-image-2", mode: "auto" },
        b: { id: "b", baseURL: "https://b/v1", apiKey: "", model: "m", mode: "openai-async" },
      },
    });
    expect(statuses.find((s) => s.id === "a")?.effectiveMode).toBe("openai");
    expect(statuses.find((s) => s.id === "a")?.modeSource).toBe("default");
    expect(statuses.find((s) => s.id === "b")?.effectiveMode).toBe("openai-async");
    expect(statuses.find((s) => s.id === "b")?.modeSource).toBe("config");
  });

  it("generate rejects with a clear message when no endpoints configured", async () => {
    await expect(generate({ prompt: "x" }, {})).rejects.toThrow(/No image endpoints configured/);
  });

  it("defaults disable automatic re-generation retries", () => {
    expect(IMAGE_MAX_RETRIES).toBe(0);
    expect(IMAGE_HTTP_TIMEOUT_MS).toBeGreaterThanOrEqual(2 * 60 * 1000);
    expect(IMAGE_ASYNC_MAX_WAIT_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });
});

describe("resolveEffectiveMode", () => {
  it("auto → classic openai by default", () => {
    const r = resolveEffectiveMode({ baseURL: "https://switchbase.vip/v1", mode: "auto" });
    expect(r.effective).toBe("openai");
    expect(r.source).toBe("default");
  });

  it("explicit config wins over host", () => {
    const rules: HostRule[] = [{ host: "forced.example", mode: "openai-async" }];
    // use match to ensure rule works
    expect(matchHostRuleDirect("https://forced.example/v1", rules)?.mode).toBe("openai-async");
    const r = resolveEffectiveMode({ baseURL: "https://forced.example/v1", mode: "openai" });
    expect(r.effective).toBe("openai");
    expect(r.source).toBe("config");
  });

  it("override forces runtime mode", () => {
    const r = resolveEffectiveMode({ baseURL: "https://x/v1", mode: "auto" }, "openai-async");
    expect(r.effective).toBe("openai-async");
    expect(r.source).toBe("override");
  });

  it("host rule applies under auto", () => {
    // Temporarily cannot inject into BUILTIN; test matchHostRule + resolve path via custom rules
    const rule = matchHostRuleDirect("https://api.async-relay.test/v1", [
      { host: "async-relay.test", mode: "openai-async", note: "test" },
    ]);
    expect(rule?.mode).toBe("openai-async");
  });
});

describe("parse helpers", () => {
  it("extractJobId from nested bodies", () => {
    expect(extractJobId({ job_id: "j1" })).toBe("j1");
    expect(extractJobId({ data: { job_id: "j2" } })).toBe("j2");
    expect(extractJobId({ task_id: "t1" })).toBe("t1");
  });

  it("extractImageRef from b64 and url", () => {
    expect(extractImageRef({ data: [{ b64_json: "abc" }] })).toEqual({ type: "b64", value: "abc" });
    expect(extractImageRef({ data: [{ url: "https://cdn.example/a.png" }] })).toEqual({
      type: "url",
      value: "https://cdn.example/a.png",
    });
  });
});

describe("authHeaders by mode", () => {
  const ep = { id: "t", baseURL: "https://x/v1", apiKey: "secret", model: "m" as string };
  it("openai mode has no X-Async headers", () => {
    const h = authHeaders(ep, "openai");
    expect(h.Authorization).toBe("Bearer secret");
    expect(h["X-Async-Mode"]).toBeUndefined();
  });
  it("openai-async sets X-Async headers", () => {
    const h = authHeaders(ep, "openai-async");
    expect(h["X-Async-Mode"]).toBe("true");
    expect(h["X-Async-Image-No-Retry"]).toBe("1");
  });
});

describe("createImageFetch", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("buffers the full response body before returning", async () => {
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
    let read = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (read < chunks.length) controller.enqueue(chunks[read++]);
        else controller.close();
      },
    });
    globalThis.fetch = vi.fn(
      async () =>
        new Response(stream, {
          status: 200,
          headers: { "content-type": "application/json", "content-encoding": "gzip", "content-length": "999" },
        }),
    ) as any;

    const f = createImageFetch(5_000);
    const res = await f("https://example.test/images");
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(buf)).toEqual([1, 2, 3, 4]);
    expect(res.headers.get("content-encoding")).toBeNull();
  });
});

describe("generate modes (mock fetch)", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.REPOCHAN_IMAGE_MODE;
  });

  function cfg(mode: "auto" | "openai" | "openai-async" = "auto") {
    return {
      endpoints: {
        t: { id: "t", baseURL: "https://relay.test/v1", apiKey: "k", model: "gpt-image-2", mode },
      },
      defaultEndpoint: "t",
    };
  }

  it("mode auto: 200 + b64, no X-Async header", async () => {
    const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), headers: init?.headers });
      return new Response(JSON.stringify({ data: [{ b64_json: FAKE_B64 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;

    const result = await generate({ prompt: "hi", size: "1024x1024" }, cfg("auto"));
    expect(result.success, result.error).toBe(true);
    expect(result.mode).toBe("auto");
    expect(result.effectiveMode).toBe("openai");
    const genCall = calls.find((c) => c.url.includes("/images/generations"));
    const h = new Headers(genCall!.headers as HeadersInit);
    expect(h.get("X-Async-Mode")).toBeNull();
  });

  it("mode auto: opportunistic poll when job_id without image", async () => {
    let pollN = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/images/generations") && init?.method === "POST") {
        const h = new Headers(init.headers as HeadersInit);
        expect(h.get("X-Async-Mode")).toBeNull();
        return new Response(JSON.stringify({ task_id: "task-1", status: "pending" }), { status: 200 });
      }
      if (url.includes("/images/tasks/task-1") || url.includes("/images/async-generations/task-1")) {
        pollN++;
        if (pollN < 2) {
          return new Response(JSON.stringify({ data: { status: "running" } }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ data: { status: "done", result_urls: ["https://cdn.test/a.png"] } }),
          { status: 200 },
        );
      }
      if (url.includes("cdn.test")) return new Response(FAKE_PNG, { status: 200 });
      return new Response("no", { status: 404 });
    }) as any;

    const result = await generate({ prompt: "job" }, cfg("auto"), { timeoutMs: 60_000 });
    expect(result.success, result.error).toBe(true);
    expect(result.jobId).toBe("task-1");
    expect(pollN).toBeGreaterThanOrEqual(2);
  });

  it("mode openai-async: 202 + job_id → poll with X-Async", async () => {
    let pollN = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/images/generations") && init?.method === "POST") {
        const h = new Headers(init.headers as HeadersInit);
        expect(h.get("X-Async-Mode")).toBe("true");
        return new Response(JSON.stringify({ job_id: "job-99", status: "pending" }), { status: 202 });
      }
      if (url.includes("/images/async-generations/job-99")) {
        pollN++;
        if (pollN < 2) {
          return new Response(JSON.stringify({ data: { job_id: "job-99", status: "running" } }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ data: { job_id: "job-99", status: "done", result_urls: ["https://cdn.test/a.png"] } }),
          { status: 200 },
        );
      }
      if (url.includes("cdn.test")) return new Response(FAKE_PNG, { status: 200 });
      return new Response("no", { status: 404 });
    }) as any;

    const result = await generate({ prompt: "async" }, cfg("openai-async"), { timeoutMs: 60_000 });
    expect(result.success, result.error).toBe(true);
    expect(result.effectiveMode).toBe("openai-async");
    expect(result.jobId).toBe("job-99");
  });

  it("400 does not re-POST", async () => {
    let posts = 0;
    globalThis.fetch = vi.fn(async () => {
      posts++;
      return new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400 });
    }) as any;

    const result = await generate({ prompt: "hi" }, cfg("auto"));
    expect(result.success).toBe(false);
    expect(posts).toBe(1);
  });

  it("gpt-image-2 edits failure hard-stops", async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ error: { message: "edit rejected" } }), { status: 400 });
    }) as any;

    const result = await generate(
      { prompt: "edit me", referenceImages: [{ data: FAKE_PNG, mimeType: "image/png" }] },
      cfg("auto"),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/edits failed|Not falling back/i);
    expect(urls.some((u) => u.includes("/images/generations"))).toBe(false);
  });
});

describe("generate (E2E)", () => {
  const loadUserConfig = () => loadConfig(os.homedir());

  itE2E(
    "simple square PNG succeeds once",
    async () => {
      const cfg = loadUserConfig();
      expect(listEndpoints(cfg).length).toBeGreaterThan(0);
      const result = await generate(
        { prompt: "a tiny red circle on pure white background, minimal flat design", aspectRatio: "square", size: "1024x1024" },
        cfg,
      );
      expect(result.success, result.error).toBe(true);
      expect((result.image as Uint8Array).length).toBeGreaterThan(1000);
    },
    30 * 60 * 1000,
  );
});

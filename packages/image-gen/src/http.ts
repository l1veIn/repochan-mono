/**
 * Shared HTTP helpers for image generation.
 * - Buffered body read (avoids truncated/gzip parse races)
 * - Mode-aware auth headers (no X-Async on classic openai)
 */

import type { EndpointConfig, RuntimeImageMode } from "./types.js";

/** Single HTTP attempt budget (submit / poll tick / download). */
export const IMAGE_HTTP_TIMEOUT_MS = 5 * 60 * 1000;

/** Long read budget for slow gpt-image-2 sync jobs. */
export const IMAGE_HTTP_LONG_TIMEOUT_MS = 30 * 60 * 1000;

/** Overall wait for async job completion. */
export const IMAGE_ASYNC_MAX_WAIT_MS = 20 * 60 * 1000;

/** Poll interval for async job status. */
export const IMAGE_ASYNC_POLL_MS = 2000;

/** Never auto-replay full image generations from the client. */
export const IMAGE_MAX_RETRIES = 0;

/** Suggested agent bash timeout (ms) covering async budget + slack. */
export const IMAGE_AGENT_BASH_TIMEOUT_MS = IMAGE_ASYNC_MAX_WAIT_MS + 2 * 60 * 1000;

export function combineAbortSignals(
  signals: Array<AbortSignal | undefined | null>,
): AbortSignal | undefined {
  const list = signals.filter((s): s is AbortSignal => s != null);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(list);
  const controller = new AbortController();
  for (const s of list) {
    if (s.aborted) {
      controller.abort(s.reason);
      return controller.signal;
    }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

export function baseUrl(endpoint: EndpointConfig): string {
  return endpoint.baseURL.replace(/\/$/, "");
}

/**
 * Join baseURL + path, avoiding double /v1 when base already ends with /v1
 * and path starts with /v1/....
 */
export function endpointUrl(endpoint: EndpointConfig, path: string): string {
  const base = baseUrl(endpoint);
  const p = path.startsWith("/") ? path : `/${path}`;
  for (const prefix of ["/v1", "/v2", "/api/v3"]) {
    if (base.endsWith(prefix) && p.startsWith(`${prefix}/`)) {
      return `${base}${p.slice(prefix.length)}`;
    }
  }
  return `${base}${p}`;
}

/**
 * Auth headers. Classic openai: Bearer only.
 * openai-async: X-Async-Mode + X-Async-Image-No-Retry.
 */
export function authHeaders(
  endpoint: EndpointConfig,
  mode: RuntimeImageMode,
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${endpoint.apiKey}`,
    ...extra,
  };
  if (mode === "openai-async") {
    headers["X-Async-Mode"] = "true";
    headers["X-Async-Image-No-Retry"] = "1";
  }
  return headers;
}

/**
 * Fetch that fully buffers the body and strips content-encoding after decode
 * so JSON parse never races a closing socket or double-gunzips.
 */
export function createImageFetch(timeoutMs: number = IMAGE_HTTP_TIMEOUT_MS): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const timeoutSignal =
      typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(timeoutMs)
        : (() => {
            const c = new AbortController();
            setTimeout(() => c.abort(new Error(`Image HTTP timeout after ${timeoutMs}ms`)), timeoutMs);
            return c.signal;
          })();

    const signal = combineAbortSignals([init?.signal, timeoutSignal]);

    let res: Response;
    try {
      res = await fetch(input, { ...init, signal });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("TimeoutError") || msg.includes("aborted") || msg.includes("timeout")) {
        const e = new Error(
          `Image HTTP request timed out or was aborted after ~${Math.round(timeoutMs / 1000)}s. ` +
            `The job may still complete on the relay — check job_id / dashboard before retrying. ` +
            `Original: ${msg}`,
        );
        (e as Error & { billedRisk?: boolean }).billedRisk = true;
        throw e;
      }
      throw err;
    }

    try {
      const body = await res.arrayBuffer();
      const headers = new Headers(res.headers);
      headers.delete("content-encoding");
      headers.delete("content-length");
      headers.set("content-length", String(body.byteLength));
      return new Response(body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const e = new Error(
        `Failed reading image response body (${res.status}): ${msg}. ` +
          `The upstream may still have generated the image — avoid blind retries.`,
      );
      (e as Error & { billedRisk?: boolean }).billedRisk = true;
      throw e;
    }
  };
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new Error("aborted"));
      },
      { once: true },
    );
  });
}

export async function downloadUrl(
  url: string,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const res = await fetchFn(url, { signal });
  if (!res.ok) {
    throw new Error(`Failed to download image url (${res.status}): ${url.slice(0, 160)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export function isGptImage2Model(model: string): boolean {
  return String(model || "")
    .toLowerCase()
    .includes("gpt-image-2");
}

export function pngMagicOk(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

/** Error with optional jobId / billedRisk for GenerateResult. */
export class ImageGenError extends Error {
  jobId?: string;
  billedRisk?: boolean;
  constructor(message: string, opts?: { jobId?: string; billedRisk?: boolean }) {
    super(message);
    this.name = "ImageGenError";
    this.jobId = opts?.jobId;
    this.billedRisk = opts?.billedRisk;
  }
}

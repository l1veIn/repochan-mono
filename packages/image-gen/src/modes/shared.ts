/**
 * Shared generate helpers used by openai + openai-async modes.
 */

import type { EndpointConfig, GenerateParams, RuntimeImageMode } from "../types.js";
import {
  authHeaders,
  downloadUrl,
  endpointUrl,
  IMAGE_ASYNC_MAX_WAIT_MS,
  IMAGE_ASYNC_POLL_MS,
  ImageGenError,
  isGptImage2Model,
  sleep,
} from "../http.js";
import {
  errorMessageFromBody,
  extractImageRef,
  extractJobId,
  isJobFailedStatus,
  isJobSuccessStatus,
  normalizeJob,
  parseJson,
  type ImageRef,
} from "../parse.js";

export type ModeContext = {
  endpoint: EndpointConfig;
  /** Runtime mode only (never auto). */
  mode: RuntimeImageMode;
  params: GenerateParams;
  size: string;
  fetchFn: typeof fetch;
  signal?: AbortSignal;
  asyncMaxWaitMs?: number;
};

export async function imageRefToBytes(
  ref: ImageRef,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (ref.type === "b64") {
    return new Uint8Array(Buffer.from(ref.value, "base64"));
  }
  return downloadUrl(ref.value, fetchFn, signal);
}

export function generationPath(endpoint: EndpointConfig): string {
  return endpoint.imageGenerationPath || "/images/generations";
}

export function editPath(endpoint: EndpointConfig): string {
  return endpoint.imageEditPath || "/images/edits";
}

function applyJobTemplate(template: string, jobId: string): string {
  return template
    .replace(/\{jobId\}/g, encodeURIComponent(jobId))
    .replace(/\{taskId\}/g, encodeURIComponent(jobId));
}

/** Primary + fallback poll paths (GET only — never re-POST). */
export function asyncPollUrls(endpoint: EndpointConfig, jobId: string, mode: RuntimeImageMode): string[] {
  if (endpoint.asyncPollPathTemplate) {
    return [endpointUrl(endpoint, applyJobTemplate(endpoint.asyncPollPathTemplate, jobId))];
  }
  const asyncGen = endpointUrl(endpoint, applyJobTemplate("/images/async-generations/{jobId}", jobId));
  const tasks = endpointUrl(endpoint, applyJobTemplate("/images/tasks/{jobId}", jobId));
  // openai-async: prefer async-generations; classic auto: try both (GET)
  return mode === "openai-async" ? [asyncGen, tasks] : [tasks, asyncGen];
}

export function asyncPollUrl(endpoint: EndpointConfig, jobId: string, mode: RuntimeImageMode): string {
  return asyncPollUrls(endpoint, jobId, mode)[0];
}

/** Build generations JSON body. gpt-image-2 omits response_format when fragile. */
export function generationsBody(
  endpoint: EndpointConfig,
  params: GenerateParams,
  size: string,
  opts?: { includeResponseFormat?: boolean },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: endpoint.model,
    prompt: params.prompt,
    n: 1,
    size,
  };
  if (params.quality) {
    body.quality = params.quality;
  }
  const includeRf = opts?.includeResponseFormat ?? !isGptImage2Model(endpoint.model);
  if (includeRf) {
    body.response_format = "url";
  }
  return body;
}

export async function pollJobUntilDone(
  ctx: ModeContext,
  jobId: string,
): Promise<Uint8Array> {
  const maxWait = ctx.asyncMaxWaitMs ?? ctx.endpoint.asyncMaxWaitMs ?? IMAGE_ASYNC_MAX_WAIT_MS;
  const pollMs = IMAGE_ASYNC_POLL_MS;
  const deadline = Date.now() + maxWait;
  const paths = asyncPollUrls(ctx.endpoint, jobId, ctx.mode);
  let pathIndex = 0;
  let statusPath = paths[0];
  let lastRaw: unknown;

  while (Date.now() < deadline) {
    if (ctx.signal?.aborted) {
      throw new ImageGenError(String(ctx.signal.reason ?? "aborted while polling image job"), {
        jobId,
        billedRisk: true,
      });
    }

    const res = await ctx.fetchFn(statusPath, {
      headers: { Authorization: `Bearer ${ctx.endpoint.apiKey}` },
      signal: ctx.signal,
    });
    const text = await res.text();

    // 404 on primary → try alternate poll path once (still GET only)
    if ((res.status === 404 || res.status === 405) && pathIndex + 1 < paths.length) {
      pathIndex++;
      statusPath = paths[pathIndex];
      continue;
    }

    let raw: unknown;
    try {
      raw = parseJson(text, "Async job status");
      lastRaw = raw;
    } catch {
      if (pathIndex + 1 < paths.length) {
        pathIndex++;
        statusPath = paths[pathIndex];
        continue;
      }
      throw new ImageGenError(`Async job status non-JSON at ${statusPath}: ${text.slice(0, 200)}`, {
        jobId,
        billedRisk: true,
      });
    }

    const job = normalizeJob(raw);

    if (isJobSuccessStatus(job.status) || job.status === "done") {
      if (job.resultUrls.length) {
        return downloadUrl(job.resultUrls[0], ctx.fetchFn, ctx.signal);
      }
      const ref = extractImageRef(raw);
      if (ref) return imageRefToBytes(ref, ctx.fetchFn, ctx.signal);
      throw new ImageGenError(`Async job ${jobId} done but no result urls/image`, {
        jobId,
        billedRisk: true,
      });
    }

    if (isJobFailedStatus(job.status)) {
      throw new ImageGenError(`Async job ${jobId} failed: ${job.error || "unknown error"}`, {
        jobId,
        billedRisk: true,
      });
    }

    // No status but image present → success
    if (!job.status) {
      const ref = extractImageRef(raw);
      if (ref) return imageRefToBytes(ref, ctx.fetchFn, ctx.signal);
    }

    await sleep(pollMs, ctx.signal);
  }

  void lastRaw;
  throw new ImageGenError(
    `Async job ${jobId} still not done after ${Math.round(maxWait / 1000)}s. ` +
      `Check ${statusPath} before re-submitting.`,
    { jobId, billedRisk: true },
  );
}

export type SubmitOutcome = {
  bytes: Uint8Array;
  jobId?: string;
};

/**
 * Handle a generations/edits HTTP response shared by both modes.
 * - 202 / job_id without image → poll
 * - image in body → download
 * - errors → throw ImageGenError
 */
export async function handleImageSubmitResponse(
  ctx: ModeContext,
  res: Response,
  text: string,
  label: string,
  opts?: { allowOpportunisticPoll?: boolean },
): Promise<SubmitOutcome> {
  let parsed: unknown;
  try {
    parsed = parseJson(text, label);
  } catch (err) {
    throw new ImageGenError(err instanceof Error ? err.message : String(err), { billedRisk: res.status < 500 });
  }

  const jobId = extractJobId(parsed);
  const imageRef = extractImageRef(parsed);

  // Prefer image if present even with job_id
  if (imageRef && res.ok) {
    const bytes = await imageRefToBytes(imageRef, ctx.fetchFn, ctx.signal);
    return { bytes, jobId };
  }

  // Async submit
  const wantPoll =
    res.status === 202 ||
    (jobId && !imageRef && (ctx.mode === "openai-async" || opts?.allowOpportunisticPoll));

  if (wantPoll && jobId) {
    try {
      const bytes = await pollJobUntilDone(ctx, jobId);
      return { bytes, jobId };
    } catch (err) {
      if (err instanceof ImageGenError) throw err;
      throw new ImageGenError(err instanceof Error ? err.message : String(err), {
        jobId,
        billedRisk: true,
      });
    }
  }

  if (wantPoll && !jobId) {
    throw new ImageGenError(`${label} (${res.status}) looks async but missing job_id: ${text.slice(0, 300)}`, {
      billedRisk: true,
    });
  }

  if (!res.ok) {
    const msg = errorMessageFromBody(parsed, text);
    if (res.status === 504) {
      throw new ImageGenError(
        `Image API 504 sync wait timeout: ${msg}. ` +
          `Job may still finish in the background — do not re-submit the same prompt. ` +
          `If this relay requires async submit headers, set mode openai-async (or add a host rule) and retry once deliberately.`,
        { jobId, billedRisk: true },
      );
    }
    throw new ImageGenError(`${label} error ${res.status}: ${msg}`, {
      jobId,
      billedRisk: res.status >= 500,
    });
  }

  if (!imageRef) {
    throw new ImageGenError(`${label} returned no image data: ${text.slice(0, 300)}`, { jobId });
  }

  const bytes = await imageRefToBytes(imageRef, ctx.fetchFn, ctx.signal);
  return { bytes, jobId };
}

export async function postGenerations(ctx: ModeContext): Promise<SubmitOutcome> {
  const path = generationPath(ctx.endpoint);
  const url = endpointUrl(ctx.endpoint, path);
  const body = generationsBody(ctx.endpoint, ctx.params, ctx.size, {
    // Always accept url; gpt-image-2 still gets response_format on async relays which expect it
    includeResponseFormat: true,
  });

  // For classic openai + gpt-image-2, match IC: omit response_format for t2i
  if (ctx.mode === "openai" && isGptImage2Model(ctx.endpoint.model)) {
    delete body.response_format;
  }

  const res = await ctx.fetchFn(url, {
    method: "POST",
    headers: {
      ...authHeaders(ctx.endpoint, ctx.mode),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: ctx.signal,
  });
  const text = await res.text();
  return handleImageSubmitResponse(ctx, res, text, "Image generations", {
    allowOpportunisticPoll: ctx.mode === "openai",
  });
}

export async function postEdits(ctx: ModeContext): Promise<SubmitOutcome> {
  const refs = ctx.params.referenceImages ?? [];
  if (!refs.length) throw new ImageGenError("postEdits requires referenceImages");

  const form = new FormData();
  form.set("model", ctx.endpoint.model);
  form.set("prompt", ctx.params.prompt);
  form.set("n", "1");
  form.set("size", ctx.size);
  if (!(ctx.mode === "openai" && isGptImage2Model(ctx.endpoint.model))) {
    form.set("response_format", "url");
  }

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    const blob = new Blob([Buffer.from(ref.data)], { type: ref.mimeType || "image/png" });
    form.append("image", blob, `reference-${i}.png`);
  }

  const url = endpointUrl(ctx.endpoint, editPath(ctx.endpoint));
  const res = await ctx.fetchFn(url, {
    method: "POST",
    headers: authHeaders(ctx.endpoint, ctx.mode),
    body: form,
    signal: ctx.signal,
  });
  const text = await res.text();

  // gpt-image-2: hard stop on edits failure — never fall back to generations (double-bill)
  if (!res.ok && isGptImage2Model(ctx.endpoint.model)) {
    let parsed: unknown;
    try {
      parsed = parseJson(text, "Image edits");
    } catch {
      parsed = null;
    }
    const msg = errorMessageFromBody(parsed, text);
    const jobId = parsed ? extractJobId(parsed) : undefined;
    throw new ImageGenError(
      `GPT-Image-2 /images/edits failed (${res.status}): ${msg}. ` +
        `Not falling back to /images/generations (avoids double billing). Retry deliberately if needed.`,
      { jobId, billedRisk: true },
    );
  }

  return handleImageSubmitResponse(ctx, res, text, "Image edits", {
    allowOpportunisticPoll: ctx.mode === "openai",
  });
}


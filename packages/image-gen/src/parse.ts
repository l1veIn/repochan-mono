/**
 * Response mining for OpenAI-compatible and 65535-style image APIs.
 * Accepts url / b64 and a few nested aliases (bounded depth).
 */

export type ImageRef =
  | { type: "b64"; value: string; mimeType?: string }
  | { type: "url"; value: string };

export type OpenAIImageItem = {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
};

export type OpenAIImageResponse = {
  created?: number;
  data?: OpenAIImageItem[] | Record<string, unknown>;
  error?: { message?: string; code?: string; type?: string };
  job_id?: string;
  task_id?: string;
  taskId?: string;
  status?: string;
  status_url?: string;
  result_urls?: string[];
  message?: string;
  code?: number;
};

const URL_KEY_HINTS = ["url", "image_url", "imageUrl", "result_url", "resultUrl", "download_url", "output_url"];
const B64_KEY_HINTS = ["b64_json", "base64", "image_base64", "imageBase64"];
const JOB_KEY_HINTS = ["job_id", "task_id", "taskId", "submit_id", "video_id", "videoId"];

export function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON (${text.length} bytes): ${text.slice(0, 200)}`);
  }
}

function looksLikeImageUrl(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (text.startsWith("data:image/")) return true;
  if (!/^https?:\/\//i.test(text) && !text.startsWith("/")) return false;
  const clean = text.split("?", 1)[0].split("#", 1)[0].toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp)$/.test(clean) || /^https?:\/\//i.test(text);
}

/** Extract first image ref from an OpenAI-shaped or nested body. */
export function extractImageRef(body: unknown, depth = 0): ImageRef | undefined {
  if (depth > 6 || body == null) return undefined;

  if (typeof body === "string") {
    if (looksLikeImageUrl(body)) return { type: "url", value: body };
    // long base64 blob without data: prefix
    if (body.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(body.slice(0, 80))) {
      return { type: "b64", value: body.replace(/\s/g, "") };
    }
    return undefined;
  }

  if (Array.isArray(body)) {
    for (const item of body) {
      const found = extractImageRef(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  if (typeof body !== "object") return undefined;
  const obj = body as Record<string, unknown>;

  // Standard OpenAI data[0]
  if (Array.isArray(obj.data)) {
    const first = obj.data[0];
    if (first && typeof first === "object") {
      const item = first as OpenAIImageItem;
      if (item.b64_json) return { type: "b64", value: item.b64_json };
      if (item.url) return { type: "url", value: item.url };
    }
  }

  for (const key of B64_KEY_HINTS) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) {
      return { type: "b64", value: v.trim(), mimeType: (obj.mime_type || obj.mimeType) as string | undefined };
    }
  }

  for (const key of URL_KEY_HINTS) {
    const v = obj[key];
    if (typeof v === "string" && looksLikeImageUrl(v)) return { type: "url", value: v };
  }

  if (Array.isArray(obj.result_urls) && obj.result_urls.length) {
    const u = obj.result_urls[0];
    if (typeof u === "string") return { type: "url", value: u };
  }

  // Nested common containers
  for (const key of ["data", "result", "results", "output", "outputs", "images"]) {
    if (key in obj) {
      const found = extractImageRef(obj[key], depth + 1);
      if (found) return found;
    }
  }

  return undefined;
}

/** Extract job/task id from submit or status envelopes. */
export function extractJobId(body: unknown, depth = 0): string | undefined {
  if (depth > 5 || body == null) return undefined;
  if (typeof body !== "object") return undefined;

  if (Array.isArray(body)) {
    for (const item of body) {
      const id = extractJobId(item, depth + 1);
      if (id) return id;
    }
    return undefined;
  }

  const obj = body as Record<string, unknown>;
  for (const key of JOB_KEY_HINTS) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  // Some relays use id starting with "task" / "job"
  if (typeof obj.id === "string") {
    const id = obj.id.trim();
    if (/^(task|job)/i.test(id) || id.length > 12) {
      // only treat bare id as job if nested under data or top-level async
      if (depth === 0 || obj.status != null || obj.result_urls != null) return id;
    }
  }

  if (obj.data != null) {
    const nested = extractJobId(obj.data, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

export type NormalizedJob = {
  jobId: string;
  status: string;
  resultUrls: string[];
  error?: string;
};

const SUCCESS = new Set([
  "done",
  "success",
  "successful",
  "succeed",
  "succeeded",
  "completed",
  "complete",
  "finished",
  "ok",
  "ready",
]);
const FAILED = new Set(["failed", "failure", "fail", "error", "errored", "canceled", "cancelled", "timeout", "rejected", "expired"]);

export function normalizeJob(raw: unknown): NormalizedJob {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const data =
    obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)
      ? (obj.data as Record<string, unknown>)
      : obj;

  const jobId =
    (typeof data.job_id === "string" && data.job_id) ||
    (typeof obj.job_id === "string" && obj.job_id) ||
    (typeof data.task_id === "string" && data.task_id) ||
    (typeof obj.task_id === "string" && obj.task_id) ||
    "";

  const status = String(data.status || data.task_status || obj.status || obj.task_status || "")
    .trim()
    .toLowerCase();

  const resultUrls: string[] = [];
  const pushUrls = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const u of v) if (typeof u === "string" && u) resultUrls.push(u);
    } else if (typeof v === "string" && v) {
      resultUrls.push(v);
    }
  };
  pushUrls(data.result_urls);
  pushUrls(obj.result_urls);

  const errObj = data.error && typeof data.error === "object" ? (data.error as Record<string, unknown>) : {};
  const error =
    (typeof data.error_message === "string" && data.error_message) ||
    (typeof obj.error_message === "string" && obj.error_message) ||
    (typeof errObj.message === "string" && errObj.message) ||
    (typeof data.fail_reason === "string" && data.fail_reason) ||
    (typeof obj.message === "string" && obj.code && obj.code !== 0 ? obj.message : undefined) ||
    (typeof data.error_code === "string" && data.error_code) ||
    undefined;

  return { jobId, status, resultUrls, error: error ? String(error) : undefined };
}

export function isJobSuccessStatus(status: string): boolean {
  return SUCCESS.has(status.toLowerCase());
}

export function isJobFailedStatus(status: string): boolean {
  return FAILED.has(status.toLowerCase());
}

export function errorMessageFromBody(parsed: unknown, fallbackText: string): string {
  if (parsed && typeof parsed === "object") {
    const o = parsed as OpenAIImageResponse & Record<string, unknown>;
    if (o.error?.message) return o.error.message;
    if (typeof o.message === "string" && o.message) return o.message;
  }
  return fallbackText.slice(0, 300);
}

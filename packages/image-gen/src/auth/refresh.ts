/**
 * Codex OAuth token refresh.
 *
 * POSTs a refresh_token grant to the OpenAI OAuth issuer and returns the
 * refreshed payload. image-gen never persists tokens itself here — the caller
 * (codex-auth-store) owns the cache. Mirrors codex-tools auth.rs:728-812.
 */

import { CODEX_CLIENT_ID, CODEX_USER_AGENT, extractAudience, extractIssuer } from "./codex-auth.js";

/** Response from the OAuth /token endpoint on a refresh grant. */
export interface RefreshedTokenPayload {
  access_token: string;
  id_token: string;
  /** May be absent — callers reuse the previous refresh_token. */
  refresh_token?: string;
  /** Epoch seconds (typical OAuth response field). */
  expires_in?: number;
}

export class CodexAuthError extends Error {
  /** Distinguishable from transport/ImageGenError. */
  readonly code: "auth_refresh_failed" | "auth_unauthorized" | "auth_unreachable";
  readonly status?: number;
  constructor(
    message: string,
    code: CodexAuthError["code"],
    opts?: { status?: number },
  ) {
    super(message);
    this.name = "CodexAuthError";
    this.code = code;
    this.status = opts?.status;
  }
}

/** Build the URL-encoded refresh request body. Exported for tests. */
export function buildRefreshForm(args: {
  refreshToken: string;
  clientId: string;
}): string {
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", args.refreshToken);
  params.set("client_id", args.clientId);
  return params.toString();
}

/**
 * Refresh the access token. Returns the new payload; does not cache.
 * Callers decide whether to write the cache.
 *
 * @param fetchFn injectable fetch (tests); defaults to global fetch.
 */
export async function refreshAccessToken(args: {
  refreshToken: string;
  idToken: string;
  fetchFn?: typeof fetch;
}): Promise<RefreshedTokenPayload> {
  const issuer = extractIssuer(args.idToken);
  const url = `${issuer}/oauth/token`;
  const clientId = extractAudience(args.idToken) ?? CODEX_CLIENT_ID;
  const body = buildRefreshForm({ refreshToken: args.refreshToken, clientId });
  const fetchFn = args.fetchFn ?? fetch;

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": CODEX_USER_AGENT,
        Accept: "application/json",
      },
      body,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CodexAuthError(
      `Codex token refresh request failed: ${msg}`,
      "auth_unreachable",
    );
  }

  if (res.status === 401 || res.status === 403) {
    const text = await safeText(res);
    throw new CodexAuthError(
      `Codex token refresh rejected (${res.status}). Run \`codex login\` again. Body: ${text.slice(0, 200)}`,
      "auth_unauthorized",
      { status: res.status },
    );
  }
  if (!res.ok) {
    const text = await safeText(res);
    throw new CodexAuthError(
      `Codex token refresh failed (HTTP ${res.status}): ${text.slice(0, 200)}`,
      "auth_refresh_failed",
      { status: res.status },
    );
  }

  const parsed = await res.json().catch(() => null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CodexAuthError(
      "Codex token refresh response was not a JSON object.",
      "auth_refresh_failed",
    );
  }
  const json = parsed as Record<string, unknown>;
  const access_token = typeof json.access_token === "string" ? json.access_token : "";
  const id_token = typeof json.id_token === "string" ? json.id_token : "";
  if (!access_token || !id_token) {
    throw new CodexAuthError(
      "Codex token refresh response missing access_token/id_token.",
      "auth_refresh_failed",
    );
  }
  const refresh_token =
    typeof json.refresh_token === "string" && json.refresh_token ? json.refresh_token : undefined;
  const expires_in =
    typeof json.expires_in === "number" && Number.isFinite(json.expires_in)
      ? json.expires_in
      : undefined;

  return { access_token, id_token, refresh_token, expires_in };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

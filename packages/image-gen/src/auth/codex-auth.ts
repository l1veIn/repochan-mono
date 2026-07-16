/**
 * Codex OAuth token layer.
 *
 * RepoChan image-gen reads tokens produced by the official `codex login`
 * (stored at ~/.codex/auth.json) and refreshes short-lived access tokens via
 * the OpenAI OAuth issuer. image-gen NEVER writes back to ~/.codex/ — that
 * directory is owned by the Codex CLI. Refreshed access tokens are cached at
 * ~/.repochan/codex-token-cache.json.
 *
 * Mirrors the token-handling of 170-carry/codex-tools (auth.rs), which has been
 * verified to drive gpt-image-2 through the Codex /responses backend.
 */

import { join } from "node:path";
import { homedir } from "node:os";

/** Path to the official Codex CLI token store (read-only from image-gen). */
export const CODEX_AUTH_PATH = join(homedir(), ".codex", "auth.json");

/** Path image-gen uses to cache refreshed access tokens. */
export const CODEX_TOKEN_CACHE_PATH = join(homedir(), ".repochan", "codex-token-cache.json");

/** OAuth issuer for Codex tokens. */
export const CODEX_TOKEN_ISSUER = "https://auth.openai.com";

/**
 * Public client id used by codex_vscode / codex-tools. Reused so refresh
 * requests look identical to the official clients (avoid anti-abuse blocks).
 */
export const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

/** User-Agent sent on token refresh. Matches codex-tools (avoids 403s). */
export const CODEX_USER_AGENT = "codex-tools/0.1";

/** Clock skew tolerated when judging JWT expiry (seconds). */
export const CODEX_EXPIRY_SKEW_S = 60;

/** A resolved Codex token set — the fields image-gen actually consumes. */
export interface CodexTokenSet {
  access_token: string;
  refresh_token: string;
  id_token: string;
  /** ChatGPT account id, sent as the ChatGPT-Account-Id header upstream. */
  account_id: string;
}

/** Shape persisted in ~/.repochan/codex-token-cache.json. */
export interface CodexTokenCache {
  access_token: string;
  /** Optional — only present when we refreshed and the issuer returned one. */
  refresh_token?: string;
  /** Epoch ms when the cached access_token was written. */
  cached_at: number;
}

/** Decoded JWT payload (only the claims image-gen cares about). */
interface JwtClaims {
  exp?: number;
  aud?: string | string[];
  iss?: string;
  email?: string;
  sub?: string;
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: string;
    chatgpt_plan_type?: string;
    chatgpt_user_id?: string;
  };
  [key: string]: unknown;
}

/**
 * Decode a JWT payload without verifying the signature. image-gen trusts the
 * signature check performed by the upstream Codex backend; here we only read
 * claims (exp/aud/account_id) for local cache/expiry decisions.
 */
export function decodeJwtPayload(jwt: string): JwtClaims | null {
  const parts = String(jwt || "").split(".");
  if (parts.length < 2) return null;
  const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  // base64url may omit padding; pad to a multiple of 4 for atob.
  const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
  try {
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as JwtClaims) : null;
  } catch {
    return null;
  }
}

/** Epoch-ms expiry for an access token JWT, or null when not encoded. */
export function accessTokenExpiresAtMs(jwt: string): number | null {
  const claims = decodeJwtPayload(jwt);
  if (!claims || typeof claims.exp !== "number") return null;
  return claims.exp * 1000;
}

/** True when the access token is expired or about to expire (within skew). */
export function isAccessTokenExpired(jwt: string, now: number = Date.now()): boolean {
  const expMs = accessTokenExpiresAtMs(jwt);
  if (expMs === null) {
    // No exp claim → be conservative and treat as expired so we refresh.
    return true;
  }
  return now >= expMs - CODEX_EXPIRY_SKEW_S * 1000;
}

/** Extract the ChatGPT account id from a token set / id_token. */
export function extractAccountId(
  idToken: string,
  explicit?: string,
): string | null {
  if (explicit && explicit.trim()) return explicit.trim();
  const claims = decodeJwtPayload(idToken);
  const fromClaim = claims?.["https://api.openai.com/auth"]?.chatgpt_account_id;
  return fromClaim && String(fromClaim).trim() ? String(fromClaim).trim() : null;
}

/** Extract the OAuth audience claim (used as client_id on refresh). */
export function extractAudience(idToken: string): string | null {
  const claims = decodeJwtPayload(idToken);
  if (!claims?.aud) return null;
  return Array.isArray(claims.aud)
    ? claims.aud.find((a) => typeof a === "string" && a.trim()) ?? null
    : typeof claims.aud === "string" && claims.aud.trim()
      ? claims.aud
      : null;
}

/** Extract the issuer claim (falls back to the constant when absent). */
export function extractIssuer(idToken: string): string {
  const claims = decodeJwtPayload(idToken);
  if (claims?.iss && typeof claims.iss === "string" && /^https?:\/\//.test(claims.iss)) {
    return claims.iss.replace(/\/$/, "");
  }
  return CODEX_TOKEN_ISSUER;
}

/**
 * Codex token store: read-only loader + memory/file cache for refreshed tokens.
 *
 * - ~/.codex/auth.json is owned by the Codex CLI. We ONLY read it.
 * - Refreshed access tokens are cached at ~/.repochan/codex-token-cache.json
 *   (0600, atomic) so subsequent process invocations reuse them instead of
 *   hammering the OAuth issuer.
 * - In-process, we also keep a module-level cache to avoid re-reading files
 *   across multiple generate() calls in one CLI run.
 */

import { readFileSync } from "node:fs";
import {
  CODEX_AUTH_PATH,
  CODEX_TOKEN_CACHE_PATH,
  type CodexTokenCache,
  type CodexTokenSet,
  extractAccountId,
  isAccessTokenExpired,
} from "./codex-auth.js";
import { refreshAccessToken } from "./refresh.js";
import { writeConfigFileAtomic } from "../config-file.js";

/** What loadCodexAuth returns when the Codex store is missing/invalid. */
export type CodexAuthLoadResult =
  | { ok: true; tokens: CodexTokenSet }
  | { ok: false; reason: "missing" | "unparseable" | "incomplete"; detail: string };

/**
 * Read + parse ~/.codex/auth.json. Accepts both shapes the Codex CLI has used:
 *   - modern: { tokens: { access_token, refresh_token, id_token, account_id } }
 *   - legacy / flat: { access_token, id_token, refresh_token }
 *
 * Never throws on missing/invalid files — returns a discriminated result so
 * callers can surface a friendly "run codex login" message.
 */
export function loadCodexAuth(): CodexAuthLoadResult {
  let source: string;
  try {
    source = readFileSync(CODEX_AUTH_PATH, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        ok: false,
        reason: "missing",
        detail: `No Codex auth file at ${CODEX_AUTH_PATH}. Run \`codex login\` first.`,
      };
    }
    return {
      ok: false,
      reason: "unparseable",
      detail: `Cannot read ${CODEX_AUTH_PATH}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (err) {
    return {
      ok: false,
      reason: "unparseable",
      detail: `Invalid JSON at ${CODEX_AUTH_PATH}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return parseCodexAuthJson(parsed);
}

/** Parse the already-loaded JSON value. Exported for tests. */
export function parseCodexAuthJson(value: unknown): CodexAuthLoadResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "unparseable", detail: "Codex auth root must be a JSON object." };
  }
  const root = value as Record<string, unknown>;
  const tokensField = root.tokens;
  const tokens =
    tokensField && typeof tokensField === "object" && !Array.isArray(tokensField)
      ? (tokensField as Record<string, unknown>)
      : root;

  const access_token = strng(tokens.access_token);
  const id_token = strng(tokens.id_token);
  const refresh_token = strng(tokens.refresh_token);
  const explicitAccountId = strng(tokens.account_id);

  const missing = [
    !access_token && "access_token",
    !id_token && "id_token",
    !refresh_token && "refresh_token",
  ].filter(Boolean);
  if (missing.length) {
    return {
      ok: false,
      reason: "incomplete",
      detail: `Codex auth missing token field(s): ${missing.join(", ")}. Re-run \`codex login\`.`,
    };
  }

  const account_id = extractAccountId(id_token, explicitAccountId);
  if (!account_id) {
    return {
      ok: false,
      reason: "incomplete",
      detail: "Could not derive chatgpt_account_id from id_token. Re-run `codex login`.",
    };
  }

  return {
    ok: true,
    tokens: { access_token, id_token, refresh_token, account_id },
  };
}

function strng(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * In-memory cache of the most recently used token set. Keyed by refresh_token
 * so a re-login under the same process invalidates the cache naturally.
 */
let memoryCache: { refresh_token: string; tokens: CodexTokenSet } | null = null;

/** Test-only loader override (avoids hitting the real ~/.codex/auth.json). */
let loaderOverride: CodexAuthLoadResult | null = null;

/**
 * Resolve a Codex token set, preferring the in-memory cache, then the auth.json
 * file. Does NOT refresh — use getValidAccessToken() for that.
 */
export function resolveCodexTokenSet(): CodexAuthLoadResult {
  const loaded = loaderOverride ?? loadCodexAuth();
  if (!loaded.ok) return loaded;
  if (memoryCache && memoryCache.refresh_token === loaded.tokens.refresh_token) {
    return { ok: true, tokens: memoryCache.tokens };
  }
  // Prefer a refreshed access_token from the cache file if the refresh_token matches.
  const cached = bypassDiskCacheForTests ? null : readTokenCache();
  if (cached && cached.refresh_token && cached.refresh_token === loaded.tokens.refresh_token) {
    const merged: CodexTokenSet = { ...loaded.tokens, access_token: cached.access_token };
    memoryCache = { refresh_token: loaded.tokens.refresh_token, tokens: merged };
    return { ok: true, tokens: merged };
  }
  memoryCache = { refresh_token: loaded.tokens.refresh_token, tokens: loaded.tokens };
  return { ok: true, tokens: loaded.tokens };
}

/** Read the ~/.repochan/codex-token-cache.json (missing → null). */
export function readTokenCache(): CodexTokenCache | null {
  try {
    const raw = readFileSync(CODEX_TOKEN_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<CodexTokenCache>;
    if (typeof parsed?.access_token === "string" && typeof parsed?.cached_at === "number") {
      return { access_token: parsed.access_token, refresh_token: parsed.refresh_token, cached_at: parsed.cached_at };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist a refreshed access token to the cache file (atomic, 0600). */
export function writeTokenCache(cache: CodexTokenCache): void {
  writeConfigFileAtomic(CODEX_TOKEN_CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
}

/**
 * Return a non-expired Codex access token, refreshing when necessary.
 *
 * @param forceRefresh refresh even if the current token looks fresh (used
 *   after a 401 from the image backend).
 */
export async function getValidAccessToken(
  forceRefresh = false,
  fetchFn?: typeof fetch,
): Promise<{ access_token: string; tokens: CodexTokenSet }> {
  const resolved = resolveCodexTokenSet();
  if (!resolved.ok) {
    throw new Error(
      `Codex auth unavailable: ${resolved.detail}` +
        " (image-gen reads ~/.codex/auth.json — run `codex login`).",
    );
  }

  const tokens = resolved.tokens;
  const needsRefresh =
    forceRefresh || isAccessTokenExpired(tokens.access_token);

  if (!needsRefresh) {
    return { access_token: tokens.access_token, tokens };
  }

  const refreshed = await refreshAccessToken({
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    fetchFn,
  });

  const next: CodexTokenSet = {
    access_token: refreshed.access_token,
    id_token: refreshed.id_token,
    refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
    account_id: tokens.account_id,
  };
  memoryCache = { refresh_token: next.refresh_token, tokens: next };
  try {
    if (!bypassDiskCacheForTests) {
      writeTokenCache({
        access_token: next.access_token,
        refresh_token: next.refresh_token,
        cached_at: Date.now(),
      });
    }
  } catch {
    // Cache write is best-effort; the in-memory cache still works this run.
  }
  return { access_token: next.access_token, tokens: next };
}

/** Test-only: reset the in-memory cache between unit tests. */
export function __resetCodexAuthMemoryCacheForTests(): void {
  memoryCache = null;
  loaderOverride = null;
}

/**
 * Test-only: also reset the in-memory cache AND bypass the on-disk cache file
 * (so tests do not leak tokens through ~/.repochan/codex-token-cache.json).
 */
let bypassDiskCacheForTests = false;
export function __bypassCodexAuthDiskCacheForTests(on: boolean): void {
  bypassDiskCacheForTests = on;
}

/** Test-only: inject the load result so file IO can be skipped. */
export function __setCodexAuthLoaderForTests(result: CodexAuthLoadResult | null): void {
  loaderOverride = result;
}

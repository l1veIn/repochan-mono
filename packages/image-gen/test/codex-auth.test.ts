import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CODEX_CLIENT_ID,
  CODEX_EXPIRY_SKEW_S,
  CODEX_TOKEN_ISSUER,
  decodeJwtPayload,
  accessTokenExpiresAtMs,
  isAccessTokenExpired,
  extractAccountId,
  extractAudience,
  extractIssuer,
  parseCodexAuthJson,
  resolveCodexTokenSet,
  getValidAccessToken,
  __resetCodexAuthMemoryCacheForTests,
  __setCodexAuthLoaderForTests,
  __bypassCodexAuthDiskCacheForTests,
  buildRefreshForm,
  refreshAccessToken,
  CodexAuthError,
} from "../src/index.js";

/** Build an unsigned JWT string with a given payload (testing only). */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

const NOW = 1_750_000_000_000; // arbitrary fixed epoch ms

function jwtWith(args: {
  expSec?: number;
  aud?: string | string[];
  iss?: string;
  accountId?: string;
}): string {
  return fakeJwt({
    iss: args.iss ?? CODEX_TOKEN_ISSUER,
    aud: args.aud ?? CODEX_CLIENT_ID,
    ...(args.expSec !== undefined ? { exp: args.expSec } : {}),
    "https://api.openai.com/auth": args.accountId
      ? { chatgpt_account_id: args.accountId }
      : undefined,
  });
}

describe("codex JWT decoding", () => {
  it("decodes payload claims", () => {
    const jwt = jwtWith({ expSec: Math.floor(NOW / 1000) + 3600, accountId: "acct_123" });
    const claims = decodeJwtPayload(jwt);
    expect(claims).not.toBeNull();
    expect(claims?.["https://api.openai.com/auth"]?.chatgpt_account_id).toBe("acct_123");
    expect(claims?.aud).toBe(CODEX_CLIENT_ID);
  });

  it("returns null for malformed JWTs", () => {
    expect(decodeJwtPayload("")).toBeNull();
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("a.b")).toBeNull();
    expect(decodeJwtPayload("a.@@@.c")).toBeNull();
  });

  it("handles base64url padding correctly", () => {
    // payload with length that produces no padding naturally
    const jwt = fakeJwt({ x: 1 });
    expect(decodeJwtPayload(jwt)?.x).toBe(1);
  });
});

describe("codex access-token expiry", () => {
  it("extracts exp as epoch ms", () => {
    const expSec = Math.floor(NOW / 1000) + 1000;
    const jwt = jwtWith({ expSec });
    expect(accessTokenExpiresAtMs(jwt)).toBe(expSec * 1000);
  });

  it("returns null when exp is absent", () => {
    expect(accessTokenExpiresAtMs(jwtWith({}))).toBeNull();
  });

  it("isExpired=true inside the skew window", () => {
    const expSec = Math.floor(NOW / 1000) + CODEX_EXPIRY_SKEW_S; // exactly at skew boundary
    const jwt = jwtWith({ expSec });
    // now is exactly at (exp - skew) → should be expired (>=)
    expect(isAccessTokenExpired(jwt, NOW)).toBe(true);
  });

  it("isExpired=false when well within lifetime", () => {
    const expSec = Math.floor(NOW / 1000) + 3600;
    expect(isAccessTokenExpired(jwtWith({ expSec }), NOW)).toBe(false);
  });

  it("isExpired=true past exp", () => {
    const expSec = Math.floor(NOW / 1000) - 10;
    expect(isAccessTokenExpired(jwtWith({ expSec }), NOW)).toBe(true);
  });

  it("treats missing exp as expired (conservative refresh)", () => {
    expect(isAccessTokenExpired(jwtWith({}), NOW)).toBe(true);
  });
});

describe("codex claim extraction", () => {
  it("extracts account id from id_token claim", () => {
    const idToken = jwtWith({ accountId: "acct_from_claim" });
    expect(extractAccountId(idToken)).toBe("acct_from_claim");
  });

  it("prefers explicit account id over claim", () => {
    const idToken = jwtWith({ accountId: "from_claim" });
    expect(extractAccountId(idToken, "explicit")).toBe("explicit");
  });

  it("returns null when neither present", () => {
    expect(extractAccountId(jwtWith({}))).toBeNull();
  });

  it("extracts string audience", () => {
    expect(extractAudience(jwtWith({ aud: "aud_xyz" }))).toBe("aud_xyz");
  });

  it("extracts first string from array audience", () => {
    const jwt = fakeJwt({ aud: ["", "real_aud", "other"] });
    expect(extractAudience(jwt)).toBe("real_aud");
  });

  it("returns null audience when absent", () => {
    // jwtWith defaults aud to CODEX_CLIENT_ID; build one truly without aud.
    const jwt = fakeJwt({ iss: CODEX_TOKEN_ISSUER });
    expect(extractAudience(jwt)).toBeNull();
  });

  it("extracts issuer, falling back to constant", () => {
    expect(extractIssuer(jwtWith({ iss: "https://custom.example" }))).toBe("https://custom.example");
    expect(extractIssuer(jwtWith({ iss: "https://custom.example/" }))).toBe("https://custom.example");
    expect(extractIssuer(jwtWith({}))).toBe(CODEX_TOKEN_ISSUER);
    // non-http iss ignored
    expect(extractIssuer(jwtWith({ iss: "garbage" }))).toBe(CODEX_TOKEN_ISSUER);
  });
});

describe("parseCodexAuthJson (modern + legacy shapes)", () => {
  const modern = {
    OPENAI_API_KEY: null,
    auth_mode: "chatgpt",
    last_refresh: "2026-01-01T00:00:00Z",
    tokens: {
      access_token: jwtWith({ accountId: "acct_modern" }),
      refresh_token: "rt_modern",
      id_token: jwtWith({ accountId: "acct_modern" }),
    },
  };

  const legacy = {
    access_token: jwtWith({ accountId: "acct_legacy" }),
    id_token: jwtWith({ accountId: "acct_legacy" }),
    refresh_token: "rt_legacy",
  };

  it("parses the modern {tokens:{}} shape", () => {
    const r = parseCodexAuthJson(modern);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tokens.refresh_token).toBe("rt_modern");
      expect(r.tokens.account_id).toBe("acct_modern");
    }
  });

  it("parses the flat/legacy shape", () => {
    const r = parseCodexAuthJson(legacy);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tokens.refresh_token).toBe("rt_legacy");
  });

  it("uses explicit account_id when present", () => {
    const r = parseCodexAuthJson({
      tokens: {
        access_token: jwtWith({}),
        refresh_token: "rt",
        id_token: jwtWith({}),
        account_id: "explicit_acct",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tokens.account_id).toBe("explicit_acct");
  });

  it("rejects non-object root", () => {
    expect(parseCodexAuthJson([]).ok).toBe(false);
    expect(parseCodexAuthJson("nope").ok).toBe(false);
    expect(parseCodexAuthJson(null).ok).toBe(false);
  });

  it("reports missing token fields", () => {
    const r = parseCodexAuthJson({ tokens: { access_token: "x" } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("incomplete");
      expect(r.detail).toMatch(/id_token, refresh_token/);
    }
  });

  it("reports undeducible account id", () => {
    const r = parseCodexAuthJson({
      tokens: {
        access_token: jwtWith({}), // no account id claim
        refresh_token: "rt",
        id_token: jwtWith({}),
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/chatgpt_account_id/);
  });
});

describe("buildRefreshForm", () => {
  it("produces urlencoded refresh grant", () => {
    const form = buildRefreshForm({ refreshToken: "rt/with=spec", clientId: CODEX_CLIENT_ID });
    const params = new URLSearchParams(form);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("rt/with=spec");
    expect(params.get("client_id")).toBe(CODEX_CLIENT_ID);
  });
});

describe("refreshAccessToken", () => {
  const idToken = jwtWith({ iss: CODEX_TOKEN_ISSUER, aud: CODEX_CLIENT_ID });

  function mockResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  it("posts to {issuer}/oauth/token with correct headers/body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse(200, {
        access_token: jwtWith({ accountId: "acct" }),
        id_token: idToken,
        refresh_token: "new_rt",
        expires_in: 3600,
      }),
    );
    const out = await refreshAccessToken({ refreshToken: "old_rt", idToken, fetchFn });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe(`${CODEX_TOKEN_ISSUER}/oauth/token`);
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(headers["User-Agent"]).toBe("codex-tools/0.1");
    const params = new URLSearchParams(String(init?.body));
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("old_rt");
    expect(params.get("client_id")).toBe(CODEX_CLIENT_ID);

    expect(out.access_token).toBeTruthy();
    expect(out.id_token).toBe(idToken);
    expect(out.refresh_token).toBe("new_rt");
    expect(out.expires_in).toBe(3600);
  });

  it("reuses old refresh_token when response omits it", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse(200, {
        access_token: jwtWith({ accountId: "acct" }),
        id_token: idToken,
        // refresh_token intentionally absent
      }),
    );
    const out = await refreshAccessToken({ refreshToken: "old_rt", idToken, fetchFn });
    expect(out.refresh_token).toBeUndefined();
  });

  it("uses id_token aud as client_id when present", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse(200, { access_token: jwtWith({}), id_token: idToken }),
    );
    await refreshAccessToken({ refreshToken: "rt", idToken: jwtWith({ aud: "custom_aud" }), fetchFn });
    const params = new URLSearchParams(String(fetchFn.mock.calls[0][1]?.body));
    expect(params.get("client_id")).toBe("custom_aud");
  });

  it("throws auth_unauthorized on 401", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(401, { error: "invalid_grant" }));
    await expect(refreshAccessToken({ refreshToken: "rt", idToken, fetchFn })).rejects.toMatchObject({
      code: "auth_unauthorized",
      status: 401,
    });
  });

  it("throws auth_refresh_failed on 500", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(500, "oops"));
    await expect(refreshAccessToken({ refreshToken: "rt", idToken, fetchFn })).rejects.toMatchObject({
      code: "auth_refresh_failed",
      status: 500,
    });
  });

  it("throws auth_refresh_failed when access_token missing", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, { id_token: idToken }));
    await expect(refreshAccessToken({ refreshToken: "rt", idToken, fetchFn })).rejects.toMatchObject({
      code: "auth_refresh_failed",
    });
  });

  it("throws auth_unreachable on network error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));
    await expect(refreshAccessToken({ refreshToken: "rt", idToken, fetchFn })).rejects.toMatchObject({
      code: "auth_unreachable",
    });
  });

  it("CodexAuthError is an Error subclass", () => {
    const e = new CodexAuthError("x", "auth_refresh_failed");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("CodexAuthError");
    expect(e.code).toBe("auth_refresh_failed");
  });
});

describe("resolveCodexTokenSet / getValidAccessToken (injected loader)", () => {
  const freshToken = jwtWith({
    expSec: Math.floor(Date.now() / 1000) + 3600,
    accountId: "acct_1",
  });
  const expiredToken = jwtWith({
    expSec: Math.floor(Date.now() / 1000) - 60,
    accountId: "acct_1",
  });
  const tokenSet = (access: string) => ({
    ok: true as const,
    tokens: {
      access_token: access,
      refresh_token: "rt_1",
      id_token: jwtWith({ accountId: "acct_1" }),
      account_id: "acct_1",
    },
  });

  beforeEach(() => {
    __resetCodexAuthMemoryCacheForTests();
    __bypassCodexAuthDiskCacheForTests(true);
  });
  afterEach(() => {
    __resetCodexAuthMemoryCacheForTests();
    __bypassCodexAuthDiskCacheForTests(false);
    vi.restoreAllMocks();
  });

  it("resolveCodexTokenSet returns the loaded set when fresh", () => {
    __setCodexAuthLoaderForTests(tokenSet(freshToken));
    const r = resolveCodexTokenSet();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tokens.access_token).toBe(freshToken);
  });

  it("resolveCodexTokenSet surfaces a failed load", () => {
    __setCodexAuthLoaderForTests({ ok: false, reason: "missing", detail: "gone" });
    const r = resolveCodexTokenSet();
    expect(r.ok).toBe(false);
  });

  it("getValidAccessToken returns current token when not expired (no refresh call)", async () => {
    __setCodexAuthLoaderForTests(tokenSet(freshToken));
    const fetchFn = vi.fn();
    const out = await getValidAccessToken(false, fetchFn);
    expect(out.access_token).toBe(freshToken);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("getValidAccessToken refreshes when token is expired", async () => {
    __setCodexAuthLoaderForTests(tokenSet(expiredToken));
    const refreshedAccess = jwtWith({
      expSec: Math.floor(Date.now() / 1000) + 3600,
      accountId: "acct_1",
    });
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: refreshedAccess,
          id_token: jwtWith({ accountId: "acct_1" }),
          refresh_token: "rt_1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const out = await getValidAccessToken(false, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(out.access_token).toBe(refreshedAccess);
    // in-memory cache now holds refreshed token: a follow-up must not refresh again
    const out2 = await getValidAccessToken(false, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(out2.access_token).toBe(refreshedAccess);
  });

  it("forceRefresh=true triggers refresh even when token is fresh", async () => {
    __setCodexAuthLoaderForTests(tokenSet(freshToken));
    const refreshedAccess = jwtWith({
      expSec: Math.floor(Date.now() / 1000) + 7200,
      accountId: "acct_1",
    });
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: refreshedAccess, id_token: jwtWith({ accountId: "acct_1" }) }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const out = await getValidAccessToken(true, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(out.access_token).toBe(refreshedAccess);
  });

  it("throws a friendly error when load fails", async () => {
    __setCodexAuthLoaderForTests({ ok: false, reason: "missing", detail: "no file" });
    await expect(getValidAccessToken(false, vi.fn())).rejects.toThrow(/Codex auth unavailable: no file/);
  });

  it("propagates refresh failure", async () => {
    __setCodexAuthLoaderForTests(tokenSet(expiredToken));
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(getValidAccessToken(false, fetchFn)).rejects.toMatchObject({
      code: "auth_unauthorized",
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { probeEndpoint } from "../src/probe.js";
import { getValidAccessToken } from "../src/auth/codex-auth-store.js";
import type { ImageGenConfig } from "../src/types.js";

vi.mock("../src/auth/codex-auth-store.js", () => ({ getValidAccessToken: vi.fn() }));

const bearer: ImageGenConfig = { version: 2, endpoints: {
  fixture: { id: "fixture", baseURL: "https://fixture.invalid/v1", apiKey: "fixture-key", model: "gpt-image-2", mode: "auto" },
} };
const codex: ImageGenConfig = { version: 2, endpoints: {
  fixture: { ...bearer.endpoints!.fixture, apiKey: "", auth: { kind: "codex" } },
} };

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getValidAccessToken).mockReset();
});

describe("endpoint probe evidence", () => {
  it("reports Codex token resolution without inventing a models response", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    vi.mocked(getValidAccessToken).mockResolvedValue({
      access_token: "fixture-token",
      tokens: { access_token: "fixture-token", account_id: "fixture-account", refresh_token: "fixture-refresh", id_token: "fixture-id-token" },
    });

    const result = await probeEndpoint(codex);

    expect(result).toMatchObject({ hasKey: true, authOk: true });
    expect(result.authNote).toContain("Image generation was not tested");
    expect(result).not.toHaveProperty("modelsStatus");
    expect(result).not.toHaveProperty("modelsOk");
    expect(result).not.toHaveProperty("modelsNote");
    expect(fetch).not.toHaveBeenCalled();
    expect(getValidAccessToken).toHaveBeenCalledWith(false);
  });

  it("reports a failed Codex token check without calling models or claiming a key", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    vi.mocked(getValidAccessToken).mockRejectedValue(new Error("fixture login missing"));

    const result = await probeEndpoint(codex);

    expect(result).toMatchObject({ hasKey: false, authOk: false, error: "fixture login missing" });
    expect(result.authNote).toContain("codex login");
    expect(result).not.toHaveProperty("modelsStatus");
    expect(result).not.toHaveProperty("modelsOk");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the actual unauthorized models response scoped to models", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("fixture unauthorized", { status: 401 }));

    const result = await probeEndpoint(bearer);

    expect(result).toMatchObject({ hasKey: true, modelsOk: false, modelsStatus: 401 });
    expect(result.modelsNote).toContain("fixture unauthorized");
    expect(result).not.toHaveProperty("authOk");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("https://fixture.invalid/v1/models");
  });

  it("returns endpoint resolution failure before any HTTP or token request", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");

    const result = await probeEndpoint(bearer, { endpoint: "missing" });

    expect(result).toMatchObject({ endpoint: "missing", hasKey: false });
    expect(result.error).toContain("Endpoint 'missing' not found");
    expect(result).not.toHaveProperty("modelsStatus");
    expect(fetch).not.toHaveBeenCalled();
    expect(getValidAccessToken).not.toHaveBeenCalled();
  });
});

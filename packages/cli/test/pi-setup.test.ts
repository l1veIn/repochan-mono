import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { resolveCliRoute } from "../src/index.js";
import { getLoginProviderOptions, hasAvailableModels, saveApiKeyLogin } from "../src/tui/pi-setup-host.js";

function createRegistry() {
  const authStorage = AuthStorage.inMemory();
  return ModelRegistry.inMemory(authStorage);
}

describe("repochan standalone Pi setup routing", () => {
  it("routes the no-argument command to the first-run wizard", () => {
    expect(resolveCliRoute([])).toEqual({ kind: "wizard", newSession: false });
    expect(resolveCliRoute(["--new"])).toEqual({ kind: "wizard", newSession: true });
  });

  it("routes login model and settings outside the RepoChan app", () => {
    expect(resolveCliRoute(["login"])).toEqual({ kind: "piSetup", mode: "login" });
    expect(resolveCliRoute(["model"])).toEqual({ kind: "piSetup", mode: "model" });
    expect(resolveCliRoute(["settings"])).toEqual({ kind: "piSetup", mode: "settings" });
  });

  it("keeps app settings inside the RepoChan app route", () => {
    expect(resolveCliRoute(["app", "settings"])).toMatchObject({
      kind: "app",
      args: ["settings"],
    });
  });

  it("routes legacy RepoNyan-style commands to RepoChan flows", () => {
    expect(resolveCliRoute(["analyze"])).toEqual({ kind: "phase", args: ["analysis"], newSession: false });
    expect(resolveCliRoute(["persona", "--new"])).toEqual({ kind: "phase", args: ["persona"], newSession: true });
    expect(resolveCliRoute(["generate"])).toEqual({ kind: "generate", newSession: false });
    expect(resolveCliRoute(["browse"])).toMatchObject({ kind: "app", args: ["overview"] });
  });
});

describe("repochan standalone Pi setup helpers", () => {
  it("builds login provider options for subscription and API-key auth", () => {
    const registry = createRegistry();

    expect(getLoginProviderOptions(registry, "oauth")).toContainEqual(
      expect.objectContaining({ id: "openai-codex", authType: "oauth" }),
    );
    expect(getLoginProviderOptions(registry, "api_key")).toContainEqual(
      expect.objectContaining({ id: "openai", authType: "api_key" }),
    );
  });

  it("rejects empty API keys without writing credentials", async () => {
    const registry = createRegistry();

    await expect(saveApiKeyLogin(registry, "openai", "   ")).rejects.toThrow("API key cannot be empty");
    expect(registry.authStorage.get("openai")).toBeUndefined();
  });

  it("saves API keys and refreshes available models", async () => {
    const registry = createRegistry();

    await saveApiKeyLogin(registry, "openai", "sk-test");

    expect(registry.authStorage.get("openai")).toEqual({ type: "api_key", key: "sk-test" });
    expect(hasAvailableModels(registry)).toBe(true);
  });

  it("reports no available models before login", () => {
    expect(hasAvailableModels(createRegistry())).toBe(false);
  });
});

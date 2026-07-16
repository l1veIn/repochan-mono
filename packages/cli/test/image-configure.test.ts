import { describe, expect, it } from "vitest";
import { requireImageConfigureProvider } from "../src/commands/image-configure.js";

describe("image configure provider contract", () => {
  it.each(["openai", "codex", "custom", "skip"] as const)("accepts %s", (provider) => {
    expect(requireImageConfigureProvider(provider)).toBe(provider);
  });

  it("rejects preview-era provider aliases", () => {
    expect(() => requireImageConfigureProvider("async")).toThrow("Use openai|codex|custom|skip");
  });

  it("rejects unknown providers", () => {
    expect(() => requireImageConfigureProvider("anthropic")).toThrow(/invalid --provider/);
    expect(() => requireImageConfigureProvider(undefined)).toThrow(/invalid --provider/);
  });
});

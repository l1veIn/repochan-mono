import { describe, expect, it } from "vitest";
import { requireImageConfigureProvider } from "../src/commands/image-configure.js";

describe("image configure provider contract", () => {
  it.each(["openai", "custom", "skip"] as const)("accepts %s", (provider) => {
    expect(requireImageConfigureProvider(provider)).toBe(provider);
  });

  it("rejects preview-era provider aliases", () => {
    expect(() => requireImageConfigureProvider("async")).toThrow("Use openai|custom|skip");
  });
});

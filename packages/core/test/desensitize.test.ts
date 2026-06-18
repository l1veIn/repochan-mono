import { describe, expect, it } from "vitest";
import { desensitize } from "../src/analysis/desensitize.js";

describe("desensitize", () => {
  it("redacts API keys and JWTs", () => {
    const jwt = "eyJaaaaaaaaaaa.eyJbbbbbbbbbbb.ccccccccccccc";
    const result = desensitize(`OPENAI_API_KEY=sk-1234567890abcdef\nconst bearer = "${jwt}";\n`);

    expect(result.text).toContain("[REDACTED]");
    expect(result.text).toContain("[REDACTED_JWT]");
    expect(result.text).not.toContain("sk-1234567890abcdef");
    expect(result.text).not.toContain(jwt);
    expect(result.redactions).toBeGreaterThanOrEqual(2);
  });
});

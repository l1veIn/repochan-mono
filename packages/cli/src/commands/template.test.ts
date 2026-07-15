import { afterEach, describe, expect, it, vi } from "vitest";
import { runTemplateGet } from "./template.js";

afterEach(() => vi.restoreAllMocks());

describe("template commands", () => {
  it("resolves only the canonical template id", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runTemplateGet(process.cwd(), "official/foundation-sheet", { json: true });
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({
      id: "official/foundation-sheet",
      assetType: "foundation_sheet",
    });
    await expect(runTemplateGet(process.cwd(), "foundation_sheet", { json: true }))
      .rejects.toThrow(/No template matching 'foundation_sheet'/);
  });
});

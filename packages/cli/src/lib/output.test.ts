import { describe, it, expect, afterEach, vi } from "vitest";
import { ExtractError } from "@repochan/image-edit";
import {
  ApplyFailurePrintedError,
  UsageError,
  isExtractError,
  printError,
} from "./output.js";
import { ImageMlCapabilityRequiredError } from "./image-ml-capability.js";

// ---------------------------------------------------------------------------
// Structured failure plumbing (design doc "Structured failure plumbing", PR4):
// printError renders ExtractError / UsageError as machine-readable JSON on
// stdout under --json; the human stderr path is unchanged.
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((v) => out.push(String(v)));
  vi.spyOn(console, "error").mockImplementation((v) => err.push(String(v)));
  return { out, err };
}

describe("printError --json", () => {
  it("renders a real ExtractError as { ok:false, error, message, defects, qa }", () => {
    const { out, err } = capture();
    const error = new ExtractError("extractAssets: equal-cell QA failed", [
      { code: "empty_cell", key: "cta", index: 7, detail: "empty foreground" },
    ]);
    printError(error, { json: true });
    expect(err).toEqual([]);
    const payload = JSON.parse(out.join("\n"));
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("ExtractError");
    expect(payload.message).toBe("extractAssets: equal-cell QA failed");
    expect(payload.defects).toEqual([
      { code: "empty_cell", key: "cta", index: 7, detail: "empty foreground" },
    ]);
    expect(payload.qa).toBeNull();
  });

  it("matches ExtractError structurally (cross-package instanceof fallback)", () => {
    const { out } = capture();
    // A rehydrated/cross-realm error: instanceof ExtractError would fail,
    // name + defects duck-typing must still route it to the JSON branch.
    const fake = { name: "ExtractError", message: "qa failed", defects: [{ code: "edge_touch", detail: "d" }], qa: { ok: false } };
    printError(fake, { json: true });
    const payload = JSON.parse(out.join("\n"));
    expect(payload.error).toBe("ExtractError");
    expect(payload.defects).toHaveLength(1);
    expect(payload.qa).toEqual({ ok: false });
  });

  it("renders UsageError as { ok:false, error, message, hint }", () => {
    const { out, err } = capture();
    printError(new UsageError("--rows is required", "Run `repochan --help`."), { json: true });
    expect(err).toEqual([]);
    const payload = JSON.parse(out.join("\n"));
    expect(payload).toEqual({ ok: false, error: "UsageError", message: "--rows is required", hint: "Run `repochan --help`." });
  });

  it("renders a structural missing image-ml error with an exact agent install command", () => {
    const { out, err } = capture();
    printError(new ImageMlCapabilityRequiredError("image edit bg-remove"), { json: true });
    expect(err).toEqual([]);
    expect(JSON.parse(out.join("\n"))).toMatchObject({
      ok: false,
      error: "MissingImageMlCapabilityError",
      code: "REPOCHAN_IMAGE_ML_MISSING",
      capability: "image-ml",
      packageName: "@imgly/background-removal-node",
      requiredVersion: "1.4.5",
      requiredBy: "image edit bg-remove",
      installCommand: "repochan image edit ml install",
    });
  });

  it("shows the install command on stderr for a human missing-capability error", () => {
    const { out, err } = capture();
    printError(new ImageMlCapabilityRequiredError("image edit extract-stickers"));
    expect(out).toEqual([]);
    expect(err.join("\n")).toContain("repochan image edit ml install");
  });

  it("falls back to the human stderr path for generic errors even under --json", () => {
    const { out, err } = capture();
    printError(new Error("plain failure"), { json: true });
    expect(out).toEqual([]);
    expect(err.join("\n")).toContain("plain failure");
  });

  it("keeps the human stderr path for ExtractError without --json", () => {
    const { out, err } = capture();
    printError(new ExtractError("qa failed", [{ code: "empty_cell", detail: "d" }]));
    expect(out).toEqual([]);
    expect(err.join("\n")).toContain("qa failed");
  });
});

describe("isExtractError", () => {
  it("accepts name + defects shape, rejects everything else", () => {
    expect(isExtractError(new ExtractError("x", []))).toBe(true);
    expect(isExtractError({ name: "ExtractError", defects: [] })).toBe(true);
    expect(isExtractError(new UsageError("x"))).toBe(false);
    expect(isExtractError(new Error("ExtractError"))).toBe(false);
    expect(isExtractError({ name: "ExtractError" })).toBe(false);
    expect(isExtractError(null)).toBe(false);
    expect(isExtractError("ExtractError")).toBe(false);
  });
});

describe("ApplyFailurePrintedError", () => {
  it("is a distinguishable sentinel carrying the original failure (PR5 throws it)", () => {
    const cause = new ExtractError("qa failed", []);
    const sentinel = new ApplyFailurePrintedError(cause);
    expect(sentinel).toBeInstanceOf(Error);
    expect(sentinel.name).toBe("ApplyFailurePrintedError");
    expect(sentinel.cause).toBe(cause);
    expect(sentinel instanceof ApplyFailurePrintedError).toBe(true);
  });
});

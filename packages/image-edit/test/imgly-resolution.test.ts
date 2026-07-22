import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IMAGE_ML_PACKAGE_NAME,
  IMAGE_ML_REQUIRED_VERSION,
  MissingImageMlCapabilityError,
  loadImageMlCapability,
  matteImage,
  resolveImageMlEntry,
} from "../src/imgly.js";

describe("optional image ML capability resolution", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers ordinary Node resolution over the explicit install prefix", () => {
    const resolve = vi.fn(() => "/consumer/node_modules/@imgly/background-removal-node/dist/index.js");

    expect(resolveImageMlEntry({ resolve, root: "/managed-prefix" })).toBe(
      "/consumer/node_modules/@imgly/background-removal-node/dist/index.js",
    );
    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith(IMAGE_ML_PACKAGE_NAME);
  });

  it("falls back to a managed install prefix and dynamically imports the resolved entry", async () => {
    const root = path.resolve("/managed-prefix");
    vi.stubEnv("REPOCHAN_IMAGE_ML_ROOT", root);
    const entry = path.join(root, "node_modules", "@imgly", "background-removal-node", "dist", "index.js");
    const removeBackground = vi.fn();
    const resolve = vi.fn((_: string, options?: { paths?: string[] }) => {
      if (!options) throw new Error("not installed in normal Node resolution");
      expect(options.paths).toEqual([root]);
      return entry;
    });
    const importModule = vi.fn(async () => ({ removeBackground }));

    const loaded = await loadImageMlCapability({ resolve, importModule });

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(importModule).toHaveBeenCalledWith(pathToFileURL(entry).href);
    expect(loaded.removeBackground).toBe(removeBackground);
    expect(loaded.publicPath).toBe(pathToFileURL(`${path.dirname(entry)}${path.sep}`).href);
  });

  it("throws a stable structural error when neither resolution path is available", () => {
    const resolve = vi.fn(() => {
      throw Object.assign(new Error("module not found"), { code: "MODULE_NOT_FOUND" });
    });

    let caught: unknown;
    try {
      resolveImageMlEntry({ resolve, root: "/missing-prefix" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingImageMlCapabilityError);
    expect(caught).toMatchObject({
      name: "MissingImageMlCapabilityError",
      code: "REPOCHAN_IMAGE_ML_MISSING",
      capability: "image-ml",
      packageName: IMAGE_ML_PACKAGE_NAME,
      requiredVersion: IMAGE_ML_REQUIRED_VERSION,
    });
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("rejects model sizes that are not bundled by the pinned ML runtime", async () => {
    await expect(
      matteImage(Buffer.alloc(0), "image/png", "large" as unknown as "small"),
    ).rejects.toThrow(/model must be small \| medium \(got "large"\)/);
  });
});

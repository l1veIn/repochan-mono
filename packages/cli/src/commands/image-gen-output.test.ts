import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generate } from "@repochan/image-gen";
import { runImageGen } from "./image.js";
import { printError, UsageError } from "../lib/output.js";

vi.mock("@repochan/image-gen", async (importOriginal) => ({
  ...await importOriginal<typeof import("@repochan/image-gen")>(),
  loadConfig: () => ({ version: 2, endpoints: { fixture: { id: "fixture" } } }),
  generate: vi.fn(),
}));
// Exercise the current shared decode contract without rebuilding workspace dist.
vi.mock("@repochan/image-edit", async () => import("../../../image-edit/src/image-inspect.js"));
vi.mock("ora", () => ({ default: () => ({
  start() { return this; }, fail() {}, succeed() {}, text: "",
}) }));

const temporaryDirectories: string[] = [];
const validPng = readFileSync(new URL("../../../image-gen/test/fixtures/valid.png", import.meta.url));
const generated = {
  success: true, image: validPng, mimeType: "image/png", jobId: "job_generated",
  endpoint: "fixture", model: "fixture", mode: "auto", effectiveMode: "openai", modeSource: "default",
} as const;

afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(generate).mockReset();
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function outputFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "repochan-generation-output-"));
  temporaryDirectories.push(directory);
  return { directory, output: path.join(directory, "image.png") };
}

describe("image generation output", () => {
  it.each(["valid", "fake-magic", "corrupt-idat"])("cleans OS temporary validation files after %s output", async (kind) => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { directory, output } = await outputFixture();
    const bytes = kind === "fake-magic" ? Buffer.alloc(1200) : Buffer.from(validPng);
    if (kind === "fake-magic") validPng.copy(bytes, 0, 0, 8);
    if (kind === "corrupt-idat") {
      const idat = bytes.indexOf(Buffer.from("IDAT"));
      bytes.fill(0, idat + 4, idat + 20);
    }
    vi.mocked(generate).mockResolvedValue({ ...generated, image: bytes });
    const temporary = vi.spyOn(fs, "mkdtemp");

    const failure = await runImageGen(directory, { prompt: "fixture", out: output, json: true }).catch((error) => error);
    if (kind === "valid") expect(failure).toBeUndefined();
    else expect(failure).toMatchObject({ billedRisk: true, jobId: "job_generated" });
    expect(temporary).toHaveBeenCalledTimes(1);
    expect(String(temporary.mock.calls[0][0])).toBe(path.join(os.tmpdir(), "repochan-image-accept-"));
    const temporaryDirectory = await temporary.mock.results[0].value;
    await expect(fs.stat(temporaryDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["png", "jpeg", "webp"])("decodes a real %s image and saves the original bytes", async (format) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { directory } = await outputFixture();
    const output = path.join(directory, `image.${format}`);
    const bytes = readFileSync(new URL(`../../../image-gen/test/fixtures/valid.${format}`, import.meta.url));
    vi.mocked(generate).mockResolvedValue({ ...generated, image: bytes, mimeType: `image/${format}` });

    await runImageGen(directory, { prompt: "fixture", out: output, json: true });
    expect(await readFile(output)).toEqual(bytes);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
      path: output, width: 32, height: 32, mimeType: `image/${format}`, jobId: "job_generated",
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("rejects fake PNG magic without replacing the previous output or regenerating", async () => {
    const { directory, output } = await outputFixture();
    await writeFile(output, "previous image");
    const bytes = Buffer.alloc(1200);
    validPng.copy(bytes, 0, 0, 8);
    vi.mocked(generate).mockResolvedValue({ ...generated, image: bytes });

    const failure = await runImageGen(directory, { prompt: "fixture", out: output, overwrite: true, json: true })
      .catch((error) => error);
    expect(failure).toMatchObject({ jobId: "job_generated", billedRisk: true });
    expect(failure.message).toMatch(/unreadable image|decode/i);
    expect(await readFile(output, "utf8")).toBe("previous image");
    expect(generate).toHaveBeenCalledTimes(1);

    const out = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    printError(failure, { json: true });
    expect(JSON.parse(String(out.mock.calls[0][0]))).toMatchObject({
      ok: false, jobId: "job_generated", billedRisk: true,
    });
    expect(err).not.toHaveBeenCalled();
  });

  it("rejects corrupt pixel data even when format and dimensions are readable", async () => {
    const { directory, output } = await outputFixture();
    const bytes = Buffer.from(validPng);
    const idat = bytes.indexOf(Buffer.from("IDAT"));
    bytes.fill(0, idat + 4, idat + 20);
    // The intact PNG IHDR still advertises valid dimensions; its pixel stream
    // is broken. The shared image-edit full-decode contract rejects this file.
    expect(bytes.readUInt32BE(16)).toBe(32);
    expect(bytes.readUInt32BE(20)).toBe(32);
    vi.mocked(generate).mockResolvedValue({ ...generated, image: bytes });

    await expect(runImageGen(directory, { prompt: "fixture", out: output, json: true }))
      .rejects.toMatchObject({ jobId: "job_generated", billedRisk: true });
    await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("keeps remote generation failure metadata machine readable", async () => {
    const { directory, output } = await outputFixture();
    vi.mocked(generate).mockResolvedValue({
      ...generated, success: false, image: undefined, error: "Unsupported image format", billedRisk: true,
    });
    const failure = await runImageGen(directory, { prompt: "fixture", out: output, json: true })
      .catch((error) => error);
    expect(failure).toMatchObject({ jobId: "job_generated", billedRisk: true });
    const out = vi.spyOn(console, "log").mockImplementation(() => undefined);
    printError(failure, { json: true });
    expect(JSON.parse(String(out.mock.calls[0][0]))).toMatchObject({
      ok: false, jobId: "job_generated", billedRisk: true,
    });
    expect(generate).toHaveBeenCalledTimes(1);
    await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses existing output before submitting a generation", async () => {
    const { directory, output } = await outputFixture();
    await writeFile(output, "previous image");
    vi.mocked(generate).mockResolvedValue(generated);

    await expect(runImageGen(directory, { prompt: "fixture", out: output, json: true }))
      .rejects.toThrow(/output file already exists/);
    expect(generate).not.toHaveBeenCalled();
    expect(await readFile(output, "utf8")).toBe("previous image");
  });

  it("replaces existing output only with explicit overwrite", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { directory, output } = await outputFixture();
    await writeFile(output, "previous image");
    vi.mocked(generate).mockResolvedValue(generated);

    await runImageGen(directory, { prompt: "fixture", out: output, overwrite: true, json: true });
    expect(await readFile(output)).toEqual(Buffer.from(generated.image));
  });

  it("preserves a competing output created while generation is in flight", async () => {
    const { directory, output } = await outputFixture();
    vi.mocked(generate).mockImplementation(async () => {
      await writeFile(output, "competing image");
      return generated;
    });

    await expect(runImageGen(directory, { prompt: "fixture", out: output, json: true }))
      .rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(output, "utf8")).toBe("competing image");
  });
});

describe("image generation references", () => {
  it.each([
    ["png", "png"], ["jpeg", "jpg"], ["webp", "webp"],
    ["png", "jpg"], ["jpeg", "webp"], ["webp", "png"],
  ])("passes real %s reference bytes with their actual MIME despite a .%s extension", async (format, extension) => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { directory, output } = await outputFixture();
    const reference = path.join(directory, `reference.${extension}`);
    const bytes = readFileSync(new URL(`../../../image-gen/test/fixtures/valid.${format}`, import.meta.url));
    await writeFile(reference, bytes);
    vi.mocked(generate).mockResolvedValue(generated);

    await runImageGen(directory, { prompt: "fixture", reference: [reference], out: output, json: true });

    expect(generate).toHaveBeenCalledTimes(1);
    const references = vi.mocked(generate).mock.calls[0][0].referenceImages!;
    expect(references).toHaveLength(1);
    expect(references[0].mimeType).toBe(`image/${format}`);
    expect(references[0].data).toEqual(new Uint8Array(bytes));
  });

  it("rejects unsupported reference bytes before submitting a generation", async () => {
    const { directory, output } = await outputFixture();
    const reference = path.join(directory, "not-an-image.png");
    await writeFile(reference, "this is not an image");
    vi.mocked(generate).mockResolvedValue(generated);

    await expect(runImageGen(directory, { prompt: "fixture", reference: [reference], out: output, json: true }))
      .rejects.toThrow(UsageError);
    expect(generate).not.toHaveBeenCalled();
    await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

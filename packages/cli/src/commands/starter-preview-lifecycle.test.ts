import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeStarterPreviews, previewStarter, type StarterPreviewResult } from "@repochan/browse";
import { openBrowser } from "./browse.js";
import { runStarterPreview } from "./starter-preview.js";

vi.mock("@repochan/browse", () => ({ previewStarter: vi.fn(), closeStarterPreviews: vi.fn() }));
vi.mock("../lib/starter-loader.js", () => ({
  resolveStarterSource: vi.fn(async () => ({ dir: "/fixture" })),
  getStarter: vi.fn(async () => ({ id: "tiny", dir: "/fixture/tiny" })),
}));
vi.mock("./browse.js", () => ({ openBrowser: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const prepared = { id: "tiny", url: "http://127.0.0.1:1234/", port: 1234, reused: false } as StarterPreviewResult;
let previousInt: Function[];
let previousTerm: Function[];
beforeEach(() => {
  previousInt = process.listeners("SIGINT");
  previousTerm = process.listeners("SIGTERM");
  vi.mocked(previewStarter).mockReset();
  vi.mocked(closeStarterPreviews).mockReset().mockResolvedValue(undefined);
  vi.mocked(openBrowser).mockReset();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  // Preserve the test runner's own listeners even if a red test leaves a handler.
  for (const listener of process.listeners("SIGINT")) {
    if (!previousInt.includes(listener)) process.removeListener("SIGINT", listener);
  }
  for (const listener of process.listeners("SIGTERM")) {
    if (!previousTerm.includes(listener)) process.removeListener("SIGTERM", listener);
  }
  vi.restoreAllMocks();
});

describe("starter preview lifecycle", () => {
  it("cancels preparation on the first signal and waits for cleanup through repeated signals", async () => {
    const preparation = deferred<StarterPreviewResult>();
    const cleanup = deferred<void>();
    vi.mocked(previewStarter).mockReturnValue(preparation.promise);
    vi.mocked(closeStarterPreviews).mockImplementationOnce(() => {
      preparation.reject(new Error("Starter preview cancelled"));
      return cleanup.promise;
    });
    let finished = false;
    const pending = runStarterPreview("/fixture", "tiny", { json: true }).finally(() => { finished = true; });
    void pending.catch(() => undefined);
    try {
      await expect.poll(() => vi.mocked(previewStarter).mock.calls.length).toBe(1);
      process.emit("SIGINT");
      expect(closeStarterPreviews).toHaveBeenCalledTimes(1);
      process.emit("SIGINT");
      process.emit("SIGTERM");
      expect(closeStarterPreviews).toHaveBeenCalledTimes(1);
      await Promise.resolve();
      expect(finished).toBe(false);
      cleanup.resolve();
      await pending;
      expect(openBrowser).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
      expect(process.listeners("SIGINT")).toEqual(previousInt);
      expect(process.listeners("SIGTERM")).toEqual(previousTerm);
    } finally {
      preparation.reject(new Error("test cleanup"));
      cleanup.resolve();
      await pending.catch(() => undefined);
    }
  });

  it("closes again if a prepared result arrives after cancellation without publishing it", async () => {
    const preparation = deferred<StarterPreviewResult>();
    vi.mocked(previewStarter).mockReturnValue(preparation.promise);
    const pending = runStarterPreview("/fixture", "tiny", { json: true });
    void pending.catch(() => undefined);
    try {
      await expect.poll(() => vi.mocked(previewStarter).mock.calls.length).toBe(1);
      process.emit("SIGTERM");
      expect(closeStarterPreviews).toHaveBeenCalledTimes(1);
      preparation.resolve(prepared);
      await pending;
      expect(closeStarterPreviews).toHaveBeenCalledTimes(2);
      expect(openBrowser).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    } finally {
      preparation.reject(new Error("test cleanup"));
      await pending.catch(() => undefined);
    }
  });

  it("serves a successful preview until a signal and removes both listeners", async () => {
    vi.mocked(previewStarter).mockResolvedValue(prepared);
    const pending = runStarterPreview("/fixture", "tiny", { json: true });
    await expect.poll(() => vi.mocked(openBrowser).mock.calls.length).toBe(1);
    expect(JSON.parse(String(vi.mocked(console.log).mock.calls[0][0]))).toMatchObject({ ok: true, port: 1234 });
    process.emit("SIGINT");
    await pending;
    expect(process.listeners("SIGINT")).toEqual(previousInt);
    expect(process.listeners("SIGTERM")).toEqual(previousTerm);
  });

  it("cleans and removes signal listeners after preparation fails", async () => {
    vi.mocked(previewStarter).mockRejectedValue(new Error("build failed"));
    await expect(runStarterPreview("/fixture", "tiny", { json: true })).rejects.toThrow("build failed");
    expect(closeStarterPreviews).toHaveBeenCalledTimes(1);
    expect(process.listeners("SIGINT")).toEqual(previousInt);
    expect(process.listeners("SIGTERM")).toEqual(previousTerm);
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it("reports cleanup errors, runs final cleanup, and removes listeners after cancellation", async () => {
    const preparation = deferred<StarterPreviewResult>();
    vi.mocked(previewStarter).mockReturnValue(preparation.promise);
    vi.mocked(closeStarterPreviews).mockImplementationOnce(async () => {
      preparation.reject(new Error("Starter preview cancelled"));
      throw new Error("cleanup failed");
    });
    const pending = runStarterPreview("/fixture", "tiny", { json: true });
    void pending.catch(() => undefined);
    try {
      await expect.poll(() => vi.mocked(previewStarter).mock.calls.length).toBe(1);
      process.emit("SIGTERM");
      await expect(pending).rejects.toThrow("cleanup failed");
      expect(closeStarterPreviews).toHaveBeenCalledTimes(2);
      expect(process.listeners("SIGINT")).toEqual(previousInt);
      expect(process.listeners("SIGTERM")).toEqual(previousTerm);
    } finally {
      preparation.reject(new Error("test cleanup"));
      await pending.catch(() => undefined);
    }
  });
});

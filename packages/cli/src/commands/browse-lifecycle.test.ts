import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeStarterPreviews, createBrowseServer, listenBrowseServer } from "@repochan/browse";
import { openBrowser, runBrowse } from "./browse.js";

vi.mock("node:child_process", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:child_process")>(), spawn: vi.fn(),
}));
vi.mock("@repochan/browse", () => ({ createBrowseServer: vi.fn(), listenBrowseServer: vi.fn(), closeStarterPreviews: vi.fn() }));
vi.mock("../lib/starter-loader.js", () => ({ resolveStarterSource: vi.fn(async () => null), listStartersFromSource: vi.fn(async () => []) }));

let root: string;
let server: http.Server;
let socket: net.Socket | undefined;
let previousInt: Function[];
let previousTerm: Function[];
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-browse-lifecycle-"));
  await fs.mkdir(path.join(root, ".repochan"));
  server = http.createServer();
  previousInt = process.listeners("SIGINT");
  previousTerm = process.listeners("SIGTERM");
  vi.mocked(createBrowseServer).mockReset().mockReturnValue(server);
  vi.mocked(closeStarterPreviews).mockReset().mockResolvedValue(undefined);
  vi.mocked(listenBrowseServer).mockReset().mockImplementation(async (current) => {
    await new Promise<void>((resolve) => current.listen(0, "127.0.0.1", resolve));
    return (current.address() as net.AddressInfo).port;
  });
  vi.mocked(spawn).mockReset();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(async () => {
  socket?.destroy();
  socket = undefined;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const listener of process.listeners("SIGINT")) if (!previousInt.includes(listener)) process.removeListener("SIGINT", listener);
  for (const listener of process.listeners("SIGTERM")) if (!previousTerm.includes(listener)) process.removeListener("SIGTERM", listener);
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe("browse CLI lifecycle", () => {
  it("absorbs a missing browser opener's asynchronous spawn error", () => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
    openBrowser("http://127.0.0.1:1234/");
    expect(() => child.emit("error", Object.assign(new Error("opener missing"), { code: "ENOENT" }))).not.toThrow();
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it("closes a real stalled-header socket and waits for preview cleanup through repeated signals", async () => {
    let releaseCleanup!: () => void;
    const cleanup = new Promise<void>((resolve) => { releaseCleanup = resolve; });
    vi.mocked(closeStarterPreviews).mockReturnValue(cleanup);
    let finished = false;
    const pending = runBrowse(root, { open: false, json: true }).finally(() => { finished = true; });
    void pending.catch(() => undefined);
    try {
      await expect.poll(() => vi.mocked(console.log).mock.calls.length).toBe(1);
      const port = JSON.parse(String(vi.mocked(console.log).mock.calls[0][0])).port;
      socket = net.connect(port, "127.0.0.1");
      await new Promise<void>((resolve, reject) => { socket!.once("connect", resolve); socket!.once("error", reject); });
      socket.write("GET / HTTP/1.1\r\nHost: localhost\r\n");
      process.emit("SIGINT");
      await expect.poll(() => vi.mocked(closeStarterPreviews).mock.calls.length).toBeGreaterThan(0);
      expect(server.listening).toBe(false);
      expect(finished).toBe(false);
      process.emit("SIGINT");
      process.emit("SIGTERM");
      expect(finished).toBe(false);
      releaseCleanup();
      await pending;
      await expect.poll(() => socket!.destroyed).toBe(true);
      expect(process.listeners("SIGINT")).toEqual(previousInt);
      expect(process.listeners("SIGTERM")).toEqual(previousTerm);
    } finally {
      socket?.destroy();
      releaseCleanup();
      process.emit("SIGTERM");
      await pending.catch(() => undefined);
    }
  });
});

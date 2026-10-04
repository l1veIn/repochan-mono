import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runImageEditGifFromFrames } from "./image.js";

vi.mock("@repochan/image-edit", async () => import("../../../image-edit/src/gif-frames.js"));
const temporaryDirectories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("GIF timing CLI binding", () => {
  it("labels the returned first-frame delay honestly when frame timings vary", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-cli-gif-varied-"));
    temporaryDirectories.push(cwd);
    const frame = fileURLToPath(new URL("../../../image-gen/test/fixtures/valid.png", import.meta.url));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runImageEditGifFromFrames(cwd, [frame, frame], { out: "varied.gif", delay: "20,40" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("first frame delay=20ms"));
    expect(log.mock.calls.flat().join(" ")).not.toContain("ms/frame");
  });

  it("reports the actual encoded delay when fps requires centisecond rounding", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-cli-gif-"));
    temporaryDirectories.push(cwd);
    const frame = fileURLToPath(new URL("../../../image-gen/test/fixtures/valid.png", import.meta.url));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runImageEditGifFromFrames(cwd, [frame, frame], { out: "rounded.gif", fps: 30, json: true });
    const output = JSON.parse(String(log.mock.calls.at(-1)![0]));
    const bytes = await fs.readFile(path.join(cwd, "rounded.gif"));
    const delays: number[] = [];
    for (let offset = 0; offset < bytes.length - 7; offset += 1) {
      if (bytes[offset] === 0x21 && bytes[offset + 1] === 0xf9 && bytes[offset + 2] === 4) {
        delays.push(bytes.readUInt16LE(offset + 4) * 10);
      }
    }
    expect(delays).toEqual([30, 30]);
    expect(output.delay).toBe(delays[0]);
  });
});

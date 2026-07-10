import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runOrderResolveReferences } from "./order.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("order resolve-references", () => {
  it("passes the order references array to core and returns absolute image paths", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "repochan-order-refs-"));
    tempDirs.push(projectRoot);

    const sourceDir = path.join(projectRoot, ".repochan", "orders", "ord-source");
    const versionDir = path.join(sourceDir, "versions", "v1");
    const targetDir = path.join(projectRoot, ".repochan", "orders", "ord-target");
    await mkdir(versionDir, { recursive: true });
    await mkdir(targetDir, { recursive: true });
    await writeFile(
      path.join(sourceDir, "order.json"),
      JSON.stringify({ orderId: "ord-source", currentVersion: "v1" }),
      "utf8",
    );
    await writeFile(path.join(versionDir, "reference.png"), "fake png", "utf8");
    await writeFile(
      path.join(targetDir, "order.json"),
      JSON.stringify({
        orderId: "ord-target",
        references: [{ orderId: "ord-source", role: "character" }],
      }),
      "utf8",
    );

    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value) => output.push(String(value)));

    await runOrderResolveReferences(projectRoot, "ord-target", { json: true });

    expect(JSON.parse(output.join("\n"))).toEqual([
      {
        role: "character",
        orderId: "ord-source",
        versionId: "v1",
        files: [path.join(versionDir, "reference.png")],
      },
    ]);
  });
});

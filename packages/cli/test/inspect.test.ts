import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliBin = path.join(cliRoot, "dist", "index.js");

async function tempProject() {
  return mkdtemp(path.join(tmpdir(), "repochan-cli-"));
}

async function runCli(cwd: string, args: string[]) {
  return execFileAsync(process.execPath, [cliBin, ...args], { cwd });
}

describe("repochan inspect smoke", () => {
  it("reports missing protocol state as JSON without creating .repochan", async () => {
    const cwd = await tempProject();
    const { stdout } = await runCli(cwd, ["inspect", "--json"]);

    const result = JSON.parse(stdout) as { exists: boolean; analysis: boolean; orders: string[] };
    expect(result.exists).toBe(false);
    expect(result.analysis).toBe(false);
    expect(result.orders).toEqual([]);
  });

  it("lists orders from a temporary .repochan fixture", async () => {
    const cwd = await tempProject();
    await mkdir(path.join(cwd, ".repochan", "orders"), { recursive: true });
    await writeFile(
      path.join(cwd, ".repochan", "orders", "ord-smoke-001.json"),
      JSON.stringify({ orderId: "ord-smoke-001", status: "draft", assetType: "icon", priority: "normal" }),
      "utf8",
    );

    const { stdout } = await runCli(cwd, ["order", "list", "--json"]);
    const result = JSON.parse(stdout) as { protocol: { exists: boolean }; orders: Array<{ orderId: string }> };
    expect(result.protocol.exists).toBe(true);
    expect(result.orders).toContainEqual(
      expect.objectContaining({ orderId: "ord-smoke-001", status: "draft", assetType: "icon" }),
    );
  });
});

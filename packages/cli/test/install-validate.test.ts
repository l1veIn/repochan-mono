import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parseInstallPiPackageArgs } from "../src/app/install-pi-package.js";

const execFileAsync = promisify(execFile);
const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliBin = path.join(cliRoot, "dist", "index.js");

async function tempProject(prefix = "repochan-cli-m5-") {
  return mkdtemp(path.join(tmpdir(), prefix));
}

async function runCli(cwd: string, args: string[]) {
  return execFileAsync(process.execPath, [cliBin, ...args], { cwd });
}

async function runCliWithInput(cwd: string, args: string[], input: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [cliBin, ...args], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function writeValidProtocolFixture(cwd: string) {
  const root = path.join(cwd, ".repochan");
  await mkdir(path.join(root, "analysis.versions"), { recursive: true });
  await mkdir(path.join(root, "persona", "versions"), { recursive: true });
  await mkdir(path.join(root, "orders", "batches"), { recursive: true });
  await mkdir(path.join(root, "orders", "versions"), { recursive: true });
  await mkdir(path.join(root, "assets", "readme-hero"), { recursive: true });

  await writeFile(path.join(root, "analysis.json"), JSON.stringify({ schemaVersion: "repochan.analysis.v1" }), "utf8");
  await writeFile(path.join(root, "persona", "current.json"), JSON.stringify({ schemaVersion: "repochan.persona.v1" }), "utf8");
  await writeFile(
    path.join(root, "orders", "ord-smoke-001.json"),
    JSON.stringify({
      schemaVersion: "repochan.asset-order.v1",
      orderId: "ord-smoke-001",
      requestType: "new_asset",
      status: "approved",
      assetType: "readme-hero",
      priority: "normal",
      brief: { intent: "hero", mustInclude: [], avoid: [], creativeFreedom: [] },
      deliverables: [],
      acceptanceCriteria: [],
    }),
    "utf8",
  );
  await writeFile(
    path.join(root, "assets", "readme-hero", "manifest.json"),
    JSON.stringify({
      schemaVersion: "repochan.asset-manifest.v1",
      assetId: "readme-hero",
      currentVersion: "v1",
      orderIds: ["ord-smoke-001"],
      versions: [{ versionId: "v1", createdAt: "now", tool: "test", files: [], promptBrief: "", notes: "", provenance: {} }],
      meta: {},
    }),
    "utf8",
  );
}

describe("repochan install and validate smoke", () => {
  it("parses install flags", () => {
    expect(parseInstallPiPackageArgs([])).toEqual({ useLocalWorkspace: false });
    expect(parseInstallPiPackageArgs(["--local"])).toEqual({ useLocalWorkspace: true });
    expect(() => parseInstallPiPackageArgs(["--bad"])).toThrow("Unknown install-pi-package option");
  });

  it("prints install explanation and confirmation prompt before doing anything", async () => {
    const cwd = await tempProject();
    const result = await runCliWithInput(cwd, ["install-pi-package"], "n\n");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Install RepoChan Pi package");
    expect(result.stdout).toContain("repochan-pi");
    expect(result.stdout).toContain("Proceed with installation? (y/N)");
    expect(result.stdout).toContain("Installation cancelled");
    expect(result.stderr).toBe("");
  });

  it("validates a clean directory as ok with a helpful warning", async () => {
    const cwd = await tempProject();
    const { stdout } = await runCli(cwd, ["validate", "--json"]);
    const result = JSON.parse(stdout) as { ok: boolean; warnings: Array<{ code: string }>; problems: unknown[] };

    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "protocol_missing" }));
  });

  it("validates a minimal protocol fixture with orders and assets", async () => {
    const cwd = await tempProject();
    await writeValidProtocolFixture(cwd);

    const { stdout } = await runCli(cwd, ["validate", "--json"]);
    const result = JSON.parse(stdout) as { ok: boolean; checked: { orders: number; assets: number }; problems: unknown[] };

    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.checked.orders).toBe(1);
    expect(result.checked.assets).toBe(1);
  });

  it("reports bad protocol state without mutating it", async () => {
    const cwd = await tempProject();
    await mkdir(path.join(cwd, ".repochan", "orders"), { recursive: true });
    await writeFile(
      path.join(cwd, ".repochan", "orders", "ord-bad-001.json"),
      JSON.stringify({ schemaVersion: "repochan.asset-order.v1", orderId: "ord-bad-001", status: "wat", assetType: "icon" }),
      "utf8",
    );

    const { stdout } = await runCli(cwd, ["validate", "--json"]);
    const result = JSON.parse(stdout) as { ok: boolean; problems: Array<{ code: string }> };

    expect(result.ok).toBe(false);
    expect(result.problems).toContainEqual(expect.objectContaining({ code: "invalid_order_status" }));
    expect(result.problems).toContainEqual(expect.objectContaining({ code: "orders_without_analysis" }));
  });
});

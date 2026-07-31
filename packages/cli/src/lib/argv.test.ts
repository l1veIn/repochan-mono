import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isTopLevelHelpOrVersionRequest, normalizeCliArgv } from "./argv.js";

describe("normalizeCliArgv", () => {
  it("keeps the global version flag bare", () => {
    expect(normalizeCliArgv(["--version"])).toEqual(["--version"]);
  });

  it("preserves the canonical result-version option", () => {
    expect(normalizeCliArgv(["starter", "asset-apply", "hero", "--result-version", "v1"]))
      .toEqual(["starter", "asset-apply", "hero", "--result-version", "v1"]);
    expect(normalizeCliArgv(["order", "get-result", "ord-one", "--result-version", "v1"]))
      .toEqual(["order", "get-result", "ord-one", "--result-version", "v1"]);
  });

  it("allows stdin shorthand for data and starter content files", () => {
    expect(normalizeCliArgv(["starter", "configure", "--content-file", "-"]))
      .toEqual(["starter", "configure", "--content-file=-"]);
    expect(normalizeCliArgv(["persona", "create", "--data-file", "-"]))
      .toEqual(["persona", "create", "--data-file=-"]);
  });

  it("treats only a leading --version as the global identity flag", () => {
    expect(isTopLevelHelpOrVersionRequest(["--version"])).toBe(true);
    expect(isTopLevelHelpOrVersionRequest(["starter", "asset-apply", "hero", "--result-version", "v1"])).toBe(false);
  });

  it("selects a non-current result through the canonical CLI option", () => {
    const cliRoot = fileURLToPath(new URL("../..", import.meta.url));
    const tsx = path.resolve(cliRoot, "../../node_modules/.bin/tsx");
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), "repochan-cli-result-version-"));
    const orderId = "ord-cli-version";
    const versions = ["v1", "v2"].map((versionId) => ({
      versionId,
      createdAt: `2026-01-0${versionId === "v1" ? "1" : "2"}T00:00:00.000Z`,
      files: [`${versionId}.png`],
    }));
    try {
      for (const version of versions) {
        const versionDir = path.join(projectRoot, ".repochan", "orders", orderId, "versions", version.versionId);
        mkdirSync(versionDir, { recursive: true });
        writeFileSync(path.join(versionDir, version.files[0]), `${version.versionId} bytes`);
        writeFileSync(path.join(versionDir, "meta.json"), JSON.stringify(version));
      }
      writeFileSync(path.join(projectRoot, ".repochan", "orders", orderId, "order.json"), JSON.stringify({
        schemaVersion: "repochan.asset-order.v1",
        orderId,
        requestType: "new_asset",
        status: "delivered",
        currentVersion: "v2",
        candidateVersions: [],
        assetType: "test_asset",
        priority: "normal",
        references: [],
        brief: { intent: "test", mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [],
        acceptanceCriteria: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }));

      const invoke = (...args: string[]) => spawnSync(tsx, [path.join(cliRoot, "src/index.ts"), "order", "get-result", orderId, ...args, "--json"], {
        cwd: projectRoot,
        encoding: "utf8",
        // pnpm's .bin/tsx is a .cmd shim on Windows; run it through cmd.exe.
        shell: process.platform === "win32",
      });
      const result = invoke("--result-version", "v1");
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).version.versionId).toBe("v1");
      const extraPositional = invoke("v1");
      expect(extraPositional.status).toBe(1);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("returns structured JSON from the real validate command for a damaged protocol", () => {
    const cliRoot = fileURLToPath(new URL("../..", import.meta.url));
    const tsx = path.resolve(cliRoot, "../../node_modules/.bin/tsx");
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), "repochan-cli-damaged-validate-"));
    try {
      const orderDir = path.join(projectRoot, ".repochan", "orders", "ord-damaged");
      const versionDir = path.join(orderDir, "versions", "v1");
      mkdirSync(versionDir, { recursive: true });
      writeFileSync(path.join(versionDir, "artifact.png"), "artifact bytes");
      writeFileSync(path.join(versionDir, "meta.json"), JSON.stringify({
        versionId: "../escape",
        createdAt: "2026-01-01T00:00:00.000Z",
        files: ["artifact.png"],
      }));
      writeFileSync(path.join(orderDir, "order.json"), JSON.stringify({
        schemaVersion: "repochan.asset-order.v1",
        orderId: "ord-damaged",
        status: "approved",
      }));
      const result = spawnSync(tsx, [path.join(cliRoot, "src/index.ts"), "validate", "--json"], {
        cwd: projectRoot,
        encoding: "utf8",
        shell: process.platform === "win32",
      });
      expect(result.status, result.stderr).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.ok).toBe(false);
      expect(report.problems).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "result_version_mismatch" }),
      ]));
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

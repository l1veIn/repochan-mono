import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_IMAGE_MODEL, GLOBAL_CONFIG_PATH, loadConfig, saveGlobalConfig } from "../../../image-gen/src/config.js";
import { getValidAccessToken } from "../../../image-gen/src/auth/codex-auth-store.js";
import { maybeConfigureImageDuringSetup, runImageConfigure, runImageProbe, runImageStatus } from "./image-configure.js";

const fixture = vi.hoisted(() => ({ home: "" }));

// Exercise current source libraries without rebuilding workspace dist, and
// keep both global config and OAuth paths away from the user's real home.
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const { mkdtempSync } = await import("node:fs");
  fixture.home = mkdtempSync(path.join(actual.tmpdir(), "repochan-configure-feedback-"));
  const homedir = () => fixture.home;
  return { ...actual, homedir, default: { ...actual.default, homedir } };
});
vi.mock("@repochan/image-gen", async () => import("../../../image-gen/src/index.js"));
vi.mock("../../../image-gen/src/auth/codex-auth-store.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../image-gen/src/auth/codex-auth-store.js")>(),
  getValidAccessToken: vi.fn(),
}));

const endpoint = (id: string) => ({
  id, baseURL: `https://${id}.fixture.invalid/v1`, apiKey: "fixture-key", model: "gpt-image-2", mode: "auto" as const,
});
const projectRoot = () => path.join(fixture.home, "project");

beforeEach(async () => {
  await rm(fixture.home, { recursive: true, force: true });
  await mkdir(projectRoot(), { recursive: true });
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected HTTP in configure fixture"));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getValidAccessToken).mockReset();
});
afterAll(async () => rm(fixture.home, { recursive: true, force: true }));

async function projectConfig(endpoints = { project: endpoint("project") }) {
  const file = path.join(projectRoot(), ".repochan", "image.json");
  await mkdir(path.dirname(file), { recursive: true });
  const source = JSON.stringify({ version: 2, endpoints });
  await writeFile(file, source);
  return { file, source };
}

function captureJson() {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  return () => JSON.parse(String(log.mock.calls[0][0]));
}

describe("image configuration feedback", () => {
  it("reports the saved global scope and effective default without exposing credentials", async () => {
    const output = captureJson();

    await runImageConfigure(projectRoot(), {
      provider: "custom", endpointId: "fresh", baseUrl: endpoint("fresh").baseURL, apiKey: "fixture-secret", json: true,
    });

    const result = output();
    expect(result).toMatchObject({
      action: "configured", endpoint: "fresh", scope: "global", effectiveScope: "global",
      effectiveConfigPath: GLOBAL_CONFIG_PATH, effectiveEndpoint: "fresh", projectOverridesGlobal: false,
    });
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
    expect(loadConfig(projectRoot()).defaultEndpoint).toBe("fresh");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports project replacement without changing the project file or its effective endpoint", async () => {
    const overlay = await projectConfig();
    const output = captureJson();

    await runImageConfigure(projectRoot(), {
      provider: "custom", endpointId: "fresh", baseUrl: endpoint("fresh").baseURL, apiKey: "fixture-key", setDefault: true, json: true,
    });

    expect(output()).toMatchObject({
      action: "configured", endpoint: "fresh", scope: "global", effectiveScope: "project",
      effectiveConfigPath: overlay.file, effectiveEndpoint: "project", projectOverridesGlobal: true,
    });
    expect(await readFile(overlay.file, "utf8")).toBe(overlay.source);
    expect(Object.keys(loadConfig(projectRoot()).endpoints!)).toEqual(["project"]);
    const global = JSON.parse(await readFile(GLOBAL_CONFIG_PATH, "utf8"));
    expect(global.defaultEndpoint).toBe("fresh");
    expect(global.endpoints.fresh).toMatchObject({ ...endpoint("fresh"), model: DEFAULT_IMAGE_MODEL });
  });

  it("explains a project override even when it reuses the saved endpoint id", async () => {
    const overlay = await projectConfig({ project: { ...endpoint("project"), model: "gpt-image-2.5-flare" } });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runImageConfigure(projectRoot(), {
      provider: "custom", endpointId: "project", baseUrl: "https://new.fixture.invalid/v1", apiKey: "new-fixture-key", setDefault: true,
    });

    const text = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(text).toContain("Image configuration saved");
    expect(text).toContain(overlay.file);
    expect(text).toContain("replaces global endpoints");
    expect(text).toContain("saved global endpoint is not applied here");
    expect(text).not.toContain("Try: repochan image gen");
    expect(loadConfig(projectRoot()).endpoints!.project.model).toBe("gpt-image-2.5-flare");
  });

  it("preserves a 401 probe in configure JSON without treating the saved config as a health check", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("fixture unauthorized", { status: 401 }));
    const output = captureJson();

    await runImageConfigure(projectRoot(), {
      provider: "custom", endpointId: "fresh", baseUrl: endpoint("fresh").baseURL, apiKey: "fixture-key", json: true, probe: true,
    });

    expect(output()).toMatchObject({ action: "configured", probe: {
      endpoint: "fresh", hasKey: true, modelsStatus: 401, modelsOk: false,
    } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://fresh.fixture.invalid/v1/models");
  });

  it("probes the effective project config and reports a globally saved endpoint hidden by it", async () => {
    await projectConfig();
    const output = captureJson();

    await runImageConfigure(projectRoot(), {
      provider: "custom", endpointId: "fresh", baseUrl: endpoint("fresh").baseURL, apiKey: "fixture-key", setDefault: true, json: true, probe: true,
    });

    const result = output();
    expect(result).toMatchObject({ effectiveEndpoint: "project", projectOverridesGlobal: true, probe: { endpoint: "fresh", hasKey: false } });
    expect(result.probe.error).toContain("Endpoint 'fresh' not found");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports no effective default when an empty project endpoint map replaces the saved global config", async () => {
    await projectConfig({});
    const output = captureJson();

    await runImageConfigure(projectRoot(), {
      provider: "custom", endpointId: "fresh", baseUrl: endpoint("fresh").baseURL, apiKey: "fixture-key", json: true,
    });

    expect(output()).toMatchObject({ effectiveEndpoint: null, effectiveScope: "project", projectOverridesGlobal: true });
    expect(loadConfig(projectRoot()).endpoints).toEqual({});
  });

  it("points status and setup to the project file that replaces global endpoints", async () => {
    saveGlobalConfig({ version: 2, endpoints: { global: endpoint("global") } });
    const overlay = await projectConfig();
    const output = captureJson();

    await runImageStatus(projectRoot(), { json: true });
    expect(output()).toMatchObject({ scope: "project", configPath: overlay.file });
    expect(output().endpoints.map((ep: { id: string }) => ep.id)).toEqual(["project"]);
    expect(JSON.stringify(output())).not.toContain("fixture-key");

    vi.mocked(console.log).mockClear();
    await runImageStatus(projectRoot());
    await maybeConfigureImageDuringSetup(projectRoot(), { yes: true });
    const text = vi.mocked(console.log).mock.calls.map((args) => args.join(" ")).join("\n");
    expect(text).toContain(overlay.file);
    expect(text).not.toContain(GLOBAL_CONFIG_PATH);
    expect(await readFile(overlay.file, "utf8")).toBe(overlay.source);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports global scope when no project config exists", async () => {
    saveGlobalConfig({ version: 2, endpoints: { global: endpoint("global") } });
    const output = captureJson();

    await runImageStatus(projectRoot(), { json: true });
    expect(output()).toMatchObject({ scope: "global", configPath: GLOBAL_CONFIG_PATH });
    expect(output().endpoints.map((ep: { id: string }) => ep.id)).toEqual(["global"]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("image probe CLI evidence", () => {
  beforeEach(() => saveGlobalConfig({ version: 2, endpoints: {
    codex: { ...endpoint("codex"), apiKey: "", auth: { kind: "codex" } },
  } }));

  it("keeps failed Codex auth observations instead of overwriting them with configured status", async () => {
    vi.mocked(getValidAccessToken).mockRejectedValue(new Error("fixture login missing"));
    const output = captureJson();

    await runImageStatus(projectRoot(), { json: true });
    expect(output().endpoints[0].hasKey).toBe(true);
    vi.mocked(console.log).mockClear();
    await runImageProbe(projectRoot(), { json: true });

    const result = output();
    expect(result).toMatchObject({ authKind: "codex", hasKey: false, authOk: false, error: "fixture login missing" });
    expect(result).not.toHaveProperty("modelsStatus");
    expect(result).not.toHaveProperty("modelsOk");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("labels successful Codex token resolution without claiming HTTP or image-generation success", async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue({
      access_token: "fixture-token",
      tokens: { access_token: "fixture-token", account_id: "fixture-account", refresh_token: "fixture-refresh", id_token: "fixture-id-token" },
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runImageProbe(projectRoot());

    const text = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(text).toContain("Codex OAuth token");
    expect(text).toContain("resolved");
    expect(text).toContain("Image generation was not tested");
    expect(text).not.toContain("GET /models");
    expect(text).not.toContain("200");
    expect(fetch).not.toHaveBeenCalled();
  });
});

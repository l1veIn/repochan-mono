import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createOrUpdatePersona,
  createOrders,
  setOrderStatus,
  addOrderRevision,
  createOrderResult,
  readOrder,
  readOrderResult,
} from "../src/entities/index.js";
import { initProtocol } from "../src/protocol/index.js";
import { validateProtocol } from "../src/validation.js";
import { validateInput, ValidationError } from "../src/validate.js";
import {
  AnalysisEnrichParamsSchema,
  InterviewCreateParamsSchema,
  OrderCreateCandidateParamsSchema,
  OrderCreateParamsSchema,
  OrderCreateResultParamsSchema,
  OrderResultVersionSchema,
  OrderSetStatusParamsSchema,
  OrderUpdateParamsSchema,
  PersonaCreateParamsSchema,
  PersonaArtifactSchema,
  PersonaReviewCreateParamsSchema,
  ReviewCreateParamsSchema,
} from "../src/schemas/index.js";
import { Type } from "typebox";
import { canonicalAnalysis, seedUpstream } from "../test-support/fixtures.js";
import * as publicProtocol from "../src/protocol/public.js";

describe("unified validation layer", () => {
  let tmpRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-core-validate-"));
    projectRoot = tmpRoot;
    await initProtocol(projectRoot);
    await seedUpstream(projectRoot);
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  // ── validateInput core function ──────────────────────────────

  describe("validateInput", () => {
    it("passes silently on valid input", () => {
      expect(() =>
        validateInput("test", Type.Object({ a: Type.String() }), { a: "hello" }),
      ).not.toThrow();
    });

    it("throws ValidationError with field paths on invalid input", () => {
      try {
        validateInput("test", Type.Object({ a: Type.String(), b: Type.Number() }), { a: 123, b: "not a number" });
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        const err = e as ValidationError;
        // Should report ALL errors, not just the first
        expect(err.errors.length).toBeGreaterThanOrEqual(2);
        expect(err.message).toContain("test");
      }
    });

    it("includes schema name in error message for agent readability", () => {
      try {
        validateInput("persona.create", PersonaCreateParamsSchema, { persona: { name: "X" } });
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as Error).message).toContain("persona.create");
        // Should mention the missing required field
        expect((e as Error).message).toContain("rolePrompt");
      }
    });

    it("requires non-empty file arrays for result and candidate creation", () => {
      expect(() => validateInput("order.create_result", OrderCreateResultParamsSchema, { orderId: "ord-files-001", files: [] }))
        .toThrow(/files.*fewer than 1 items/);
      expect(() => validateInput("order.create_candidate", OrderCreateCandidateParamsSchema, { orderId: "ord-files-001" }))
        .toThrow(/required properties files/);
    });

    it("rejects unknown fields in fixed Persona narrative objects", () => {
      const persona = {
        name: "Strict",
        rolePrompt: "strict mascot",
        artStyle: "flat anime",
        world: {
          name: "World",
          coreRule: "Rules are explicit.",
          atmosphere: "Clear",
          relationshipToCharacter: "Home",
          removedField: true,
        },
      };
      expect(() => validateInput("persona.create", PersonaCreateParamsSchema, { persona })).toThrow(/additional properties/);
      expect(() => validateInput("persona.artifact", PersonaArtifactSchema, {
        ...persona,
        schemaVersion: "repochan.persona.v2",
        generatedAt: "2026-07-15T00:00:00.000Z",
        provenance: { tool: "test" },
      })).toThrow(/additional properties/);
    });

    it("forbids delivered/current result state in order.create payloads", () => {
      const base = {
        orderId: "ord-born-delivered",
        requestType: "new_asset",
        assetType: "icon",
        brief: { intent: "icon", mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [],
        acceptanceCriteria: [],
      };
      expect(() => validateInput("order.create", OrderCreateParamsSchema, { order: { ...base, status: "delivered" } }))
        .toThrow(/order\.create/);
      expect(() => validateInput("order.create", OrderCreateParamsSchema, { order: { ...base, currentVersion: "ghost" } }))
        .toThrow(/additional properties/);
      expect(() => validateInput("order.create", OrderCreateParamsSchema, { order: { ...base, candidateVersions: ["c1"] } }))
        .toThrow(/additional properties/);
      expect(() => validateInput("order.create_result", OrderCreateResultParamsSchema, { orderId: "ord-flags", files: ["x.png"], unexpectedControl: true }))
        .toThrow(/additional properties/);
    });

    it("keeps published result metadata creation-only", () => {
      const result = {
        versionId: "v1",
        createdAt: "2026-01-01T00:00:00.000Z",
        files: ["asset.png"],
      };
      for (const derived of [
        { updatedAt: "2026-01-02T00:00:00.000Z" },
        { tiles: [{ file: "tile.png", row: 0, col: 0 }] },
        { stickers: ["sticker.png"] },
        { stickersConfig: { rows: 1, cols: 1 } },
      ]) {
        expect(() => validateInput("order.result_version", OrderResultVersionSchema, { ...result, ...derived }))
          .toThrow(/additional properties/);
      }
    });

    it("rejects unknown fields on every representative public write contract", () => {
      const cases: Array<{ action: string; schema: any; value: Record<string, unknown> }> = [
        {
          action: "persona.create",
          schema: PersonaCreateParamsSchema,
          value: { persona: { name: "X", rolePrompt: "visual tags", artStyle: "cel" }, removedFlag: true },
        },
        {
          action: "interview.create",
          schema: InterviewCreateParamsSchema,
          value: { interview: { summary: "summary", keyConstraints: [] }, removedFlag: true },
        },
        {
          action: "analysis.enrich",
          schema: AnalysisEnrichParamsSchema,
          value: { abstract: { summary: "summary" }, removedFlag: true },
        },
        {
          action: "order.update",
          schema: OrderUpdateParamsSchema,
          value: { orderId: "ord-unknown-field", overwrite: true, patch: {}, removedFlag: true },
        },
        {
          action: "review.create",
          schema: ReviewCreateParamsSchema,
          value: { orderId: "ord-unknown-field", versionId: "v1", verdict: "pass", removedFlag: true },
        },
        {
          action: "persona.review",
          schema: PersonaReviewCreateParamsSchema,
          value: { verdict: "pass", notes: "ok", removedFlag: true },
        },
      ];
      for (const entry of cases) {
        expect(() => validateInput(entry.action, entry.schema, entry.value), entry.action)
          .toThrow(/additional properties/);
      }
    });

    it("keeps the public protocol module on its explicit safe allowlist", () => {
      expect(Object.keys(publicProtocol).sort()).toEqual([
        "PROTOCOL_DIR", "exists", "hasInterview", "initProtocol", "inspectProtocol", "listJsonFiles",
        "orderDir", "orderJsonPath", "orderReferencesDir", "orderVersionDir", "orderVersionsDir",
        "personaCandidatePath", "personaCandidatesDir", "personaReviewPath", "personaReviewVersionsDir",
        "protocolRoot", "protocolVersionPath", "readAnalysisArtifact", "readInterviewArtifact", "readJson",
        "readJsonIfExists", "readPersonaArtifact", "readPersonaReviewArtifact", "readReviewArtifact",
        "relativeProtocolPath", "requireAnalysis", "requireInterview", "requirePersona", "reviewJsonPath",
        "reviewVersionsDir", "root", "safeProtocolPath", "stamp", "stampForPath", "stripProtocolPrefix",
      ].sort());
    });
  });

  it("reports malformed stored analysis and persona artifacts", async () => {
    await fs.writeFile(path.join(projectRoot, ".repochan/analysis/current.json"), "{}\n");
    const invalidAnalysis = await validateProtocol(projectRoot);
    expect(invalidAnalysis.ok).toBe(false);
    expect(invalidAnalysis.problems.some((entry) => entry.code === "invalid_analysis_artifact")).toBe(true);

    await fs.writeFile(
      path.join(projectRoot, ".repochan/analysis/current.json"),
      `${JSON.stringify(canonicalAnalysis(), null, 2)}\n`,
    );
    await fs.writeFile(path.join(projectRoot, ".repochan/persona/current.json"), "{}\n");
    const invalidPersona = await validateProtocol(projectRoot);
    expect(invalidPersona.ok).toBe(false);
    expect(invalidPersona.problems.some((entry) => entry.code === "invalid_persona_artifact")).toBe(true);
  });

  it("order.create rejects a delivered birth state before writing an order directory", async () => {
    await expect(createOrders(projectRoot, {
      order: {
        orderId: "ord-born-runtime",
        requestType: "new_asset",
        assetType: "icon",
        brief: { intent: "icon", mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [], status: "delivered",
      },
    })).rejects.toThrow(/order\.create/);
    await expect(fs.stat(path.join(projectRoot, ".repochan/orders/ord-born-runtime"))).rejects.toThrow();
  });

  it("reports incomplete result metadata and materialization", async () => {
    const orderId = "ord-incomplete-metadata";
    const versionDir = path.join(projectRoot, ".repochan", "orders", orderId, "versions", "v1");
    await fs.mkdir(versionDir, { recursive: true });
    const version = {
      versionId: "v1",
      createdAt: "2026-01-01T00:00:00.000Z",
      tool: "manual-upload",
      files: ["missing.png", "nested\\escape.png", "Hero.png", "hero.png"],
    };
    await fs.writeFile(path.join(versionDir, "Hero.png"), "artifact bytes");
    await fs.writeFile(path.join(versionDir, "meta.json"), JSON.stringify(version));
    await fs.writeFile(path.join(projectRoot, ".repochan", "orders", orderId, "order.json"), JSON.stringify({
      schemaVersion: "repochan.asset-order.v1",
      orderId,
      status: "delivered",
      currentVersion: "v1",
      requestType: "new_asset", assetType: "icon",
      brief: { intent: "icon", mustInclude: [], avoid: [], creativeFreedom: [] }, deliverables: [], acceptanceCriteria: [],
      candidateVersions: [], priority: "normal", references: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    }));

    const result = await validateProtocol(projectRoot);
    expect(result.ok).toBe(false);
    expect(result.problems.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "missing_result_file",
      "invalid_result_file_record",
      "duplicate_result_file_record",
    ]));
    expect(result.problems.find(({ code }) => code === "missing_result_file")?.suggestion)
      .toMatch(/publish a new evidence-bearing result version/);
    await expect(readOrderResult(projectRoot, orderId, "v1"))
      .rejects.toThrow(/missing or is not a non-empty regular file/);
  });

  it("rejects a file-backed result without required metadata", async () => {
    const orderId = "ord-file-without-meta";
    const versionDir = path.join(projectRoot, ".repochan", "orders", orderId, "versions", "v1");
    await fs.mkdir(versionDir, { recursive: true });
    await fs.writeFile(path.join(versionDir, "artifact.png"), "artifact bytes");
    await fs.writeFile(path.join(projectRoot, ".repochan", "orders", orderId, "order.json"), JSON.stringify({
      schemaVersion: "repochan.asset-order.v1",
      orderId,
      status: "approved",
      requestType: "new_asset", assetType: "icon",
      brief: { intent: "icon", mustInclude: [], avoid: [], creativeFreedom: [] }, deliverables: [], acceptanceCriteria: [],
      candidateVersions: [], priority: "normal", references: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    }));

    const result = await validateProtocol(projectRoot);
    expect(result.ok).toBe(false);
    expect(result.problems).toContainEqual(expect.objectContaining({ code: "missing_result_meta" }));
    await expect(readOrderResult(projectRoot, orderId, "v1")).rejects.toThrow(/missing meta\.json/);
  });

  it("uses one strict stored-order schema for reads and validation", async () => {
    await createOrders(projectRoot, { order: {
      orderId: "ord-strict-reader", requestType: "new_asset", assetType: "icon",
      brief: { intent: "icon", mustInclude: [], avoid: [], creativeFreedom: [] }, deliverables: [], acceptanceCriteria: [],
    } });
    const file = path.join(projectRoot, ".repochan/orders/ord-strict-reader/order.json");
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    raw.unknownLifecycleIndex = [];
    await fs.writeFile(file, JSON.stringify(raw));
    await expect(readOrder(projectRoot, "ord-strict-reader")).rejects.toThrow(/additional properties/);
    expect((await validateProtocol(projectRoot)).problems).toContainEqual(expect.objectContaining({ code: "invalid_order_artifact" }));
  });

  it("rejects unknown result metadata fields through the strict result schema", async () => {
    await createOrders(projectRoot, { order: {
      orderId: "ord-strict-result", requestType: "new_asset", assetType: "icon",
      brief: { intent: "icon", mustInclude: [], avoid: [], creativeFreedom: [] }, deliverables: [], acceptanceCriteria: [],
    } });
    await setOrderStatus(projectRoot, "ord-strict-result", "approved");
    const source = path.join(projectRoot, "strict-result.png");
    await fs.writeFile(source, "bytes");
    await createOrderResult(projectRoot, { orderId: "ord-strict-result", versionId: "v1", files: [source], tool: "manual" });
    const meta = path.join(projectRoot, ".repochan/orders/ord-strict-result/versions/v1/meta.json");
    const raw = JSON.parse(await fs.readFile(meta, "utf8"));
    raw.lifecycleRole = "current";
    await fs.writeFile(meta, JSON.stringify(raw));
    await expect(readOrderResult(projectRoot, "ord-strict-result", "v1")).rejects.toThrow(/additional properties/);
    expect((await validateProtocol(projectRoot)).problems).toContainEqual(expect.objectContaining({ code: "invalid_result_meta" }));
  });

  it("rejects a symlinked protocol root", async () => {
    const protocol = path.join(projectRoot, ".repochan");
    const real = path.join(projectRoot, "protocol-real");
    await fs.rename(protocol, real);
    await fs.symlink(real, protocol);
    const report = await validateProtocol(projectRoot);
    expect(report.ok).toBe(false);
    expect(report.problems).toContainEqual(expect.objectContaining({ code: "unsafe_protocol_root" }));
  });

  it("rejects a result version reached through a symlink like the business read path does", async () => {
    const orderId = "ord-symlink-result";
    const outsideVersion = path.join(tmpRoot, "outside-version");
    await fs.mkdir(outsideVersion, { recursive: true });
    await fs.writeFile(path.join(outsideVersion, "result.png"), "outside bytes");
    const version = {
      versionId: "v1",
      createdAt: "2026-01-01T00:00:00.000Z",
      files: ["result.png"],
    };
    await fs.writeFile(path.join(outsideVersion, "meta.json"), JSON.stringify(version));
    const versionsDir = path.join(projectRoot, ".repochan", "orders", orderId, "versions");
    await fs.mkdir(versionsDir, { recursive: true });
    await fs.symlink(outsideVersion, path.join(versionsDir, "v1"));
    await fs.writeFile(path.join(projectRoot, ".repochan", "orders", orderId, "order.json"), JSON.stringify({
      schemaVersion: "repochan.asset-order.v1",
      orderId,
      status: "delivered",
      currentVersion: "v1",
      requestType: "new_asset", assetType: "icon",
      brief: { intent: "icon", mustInclude: [], avoid: [], creativeFreedom: [] }, deliverables: [], acceptanceCriteria: [],
      candidateVersions: [], priority: "normal", references: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    }));

    const result = await validateProtocol(projectRoot);
    expect(result.ok).toBe(false);
    expect(result.problems).toContainEqual(expect.objectContaining({ code: "unsafe_result_path" }));
    await expect(readOrderResult(projectRoot, orderId, "v1")).rejects.toThrow(/refuses symlink path/);
  });

  it("audits raw order/version topology and lifecycle pointers", async () => {
    const orderId = "ord-topology-audit";
    const orderDir = path.join(projectRoot, ".repochan", "orders", orderId);
    const versionsDir = path.join(orderDir, "versions");
    const diskV1 = { versionId: "v1", createdAt: "2026-01-01T00:00:00.000Z", files: ["v1.png"] };
    const diskExtra = { versionId: "v-extra", createdAt: "2026-01-02T00:00:00.000Z", files: ["extra.png"] };
    for (const version of [diskV1, diskExtra]) {
      const versionDir = path.join(versionsDir, version.versionId);
      await fs.mkdir(versionDir, { recursive: true });
      await fs.writeFile(path.join(versionDir, version.files[0]), "bytes");
      await fs.writeFile(path.join(versionDir, "meta.json"), JSON.stringify(version));
    }
    await fs.mkdir(path.join(versionsDir, "bad version"), { recursive: true });
    await fs.writeFile(path.join(versionsDir, "loose.txt"), "not a version");
    const outsideVersion = path.join(tmpRoot, "outside-topology-version");
    await fs.mkdir(outsideVersion, { recursive: true });
    await fs.symlink(outsideVersion, path.join(versionsDir, "v-link"));

    await fs.writeFile(path.join(orderDir, "order.json"), JSON.stringify({
      schemaVersion: "repochan.asset-order.v1",
      orderId,
      status: "delivered",
      currentVersion: "v1",
      candidateVersions: ["v-extra", "v-missing", "v-extra"],
      requestType: "new_asset", assetType: "icon",
      brief: { intent: "icon", mustInclude: [], avoid: [], creativeFreedom: [] }, deliverables: [], acceptanceCriteria: [],
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    }));

    await fs.mkdir(path.join(projectRoot, ".repochan", "orders", "BAD ORDER"));
    await fs.writeFile(path.join(projectRoot, ".repochan", "orders", "stray.txt"), "not an order");
    const outsideOrder = path.join(tmpRoot, "outside-order");
    await fs.mkdir(outsideOrder, { recursive: true });
    await fs.symlink(outsideOrder, path.join(projectRoot, ".repochan", "orders", "ord-symlink-topology"));

    const result = await validateProtocol(projectRoot);
    expect(result.ok).toBe(false);
    expect(result.checked).toEqual({ orders: 1, results: 2 });
    expect(result.problems.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "invalid_order_directory",
      "invalid_order_entry",
      "unsafe_order_path",
      "invalid_result_version_directory",
      "invalid_result_entry",
      "unsafe_result_path",
      "duplicate_candidate_version",
      "missing_lifecycle_result",
    ]));
  });

  it("is total and rejects unknown order fields", async () => {
    const orderId = "ord-unknown-field";
    const orderDir = path.join(projectRoot, ".repochan", "orders", orderId);
    await fs.mkdir(orderDir, { recursive: true });
    await fs.writeFile(path.join(orderDir, "order.json"), JSON.stringify({
      schemaVersion: "repochan.asset-order.v1",
      orderId,
      status: "approved",
      candidateVersions: [],
      requestType: "new_asset", assetType: "icon",
      brief: { intent: "icon", mustInclude: [], avoid: [], creativeFreedom: [] }, deliverables: [], acceptanceCriteria: [],
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      unknownIndex: [{ versionId: "../../escape" }],
    }));

    await expect(validateProtocol(projectRoot)).resolves.toEqual(expect.objectContaining({
      ok: false,
      problems: expect.arrayContaining([expect.objectContaining({ code: "invalid_order_artifact" })]),
    }));
  });

  // ── Persona schema gate ──────────────────────────────────────

  describe("persona.create schema gate", () => {
    it("rejects persona missing required name and rolePrompt", async () => {
      await expect(
        createOrUpdatePersona(projectRoot, { persona: { personality: "nice" } }, "create"),
      ).rejects.toThrow(/persona\.create/);
    });

    it("rejects persona with non-string rolePrompt", async () => {
      await expect(
        createOrUpdatePersona(projectRoot, { persona: { name: "Test", rolePrompt: 123 } }, "create"),
      ).rejects.toThrow(/rolePrompt/);
    });

    it("accepts persona with name + rolePrompt + artStyle", async () => {
      const result = await createOrUpdatePersona(projectRoot, {
        persona: { name: "Spiria", rolePrompt: "1girl, purple hair, violet eyes", artStyle: "cel-shaded anime" },
        overwrite: true,
      }, "create");
      expect((result.data as any).name).toBe("Spiria");
    });
  });

  // ── Order status machine ─────────────────────────────────────

  describe("order.set_status state machine", () => {
    beforeEach(async () => {
      await createOrders(projectRoot, {
        order: {
          orderId: "ord-machine-001",
          requestType: "new_asset",
          assetType: "icon",
          brief: { intent: "icon", mustInclude: [], avoid: [], creativeFreedom: [] },
          deliverables: [],
          acceptanceCriteria: [],
        },
      });
    });

    it("allows draft → approved", async () => {
      const order = await setOrderStatus(projectRoot, "ord-machine-001", "approved");
      expect(order.status).toBe("approved");
    });

    it("allows draft → cancelled", async () => {
      const order = await setOrderStatus(projectRoot, "ord-machine-001", "cancelled");
      expect(order.status).toBe("cancelled");
    });

    it("rejects illegal draft → delivered jump", async () => {
      await expect(
        setOrderStatus(projectRoot, "ord-machine-001", "delivered"),
      ).rejects.toThrow(/illegal transition draft→delivered/);
    });

    it("rejects delivered → draft resurrection", async () => {
      // draft → approved → in_progress → delivered
      await setOrderStatus(projectRoot, "ord-machine-001", "approved");
      await setOrderStatus(projectRoot, "ord-machine-001", "in_progress");
      const sourceFile = path.join(projectRoot, "machine-result.png");
      await fs.writeFile(sourceFile, "machine result bytes");
      await createOrderResult(projectRoot, {
        orderId: "ord-machine-001",
        versionId: "v1",
        files: [sourceFile],
        tool: "manual-upload",
      });

      // Now try to go back to draft — should be rejected
      await expect(
        setOrderStatus(projectRoot, "ord-machine-001", "draft"),
      ).rejects.toThrow(/illegal transition delivered→draft/);
    });

    it("rejects cancelled → delivered (cannot skip from cancelled)", async () => {
      await setOrderStatus(projectRoot, "ord-machine-001", "cancelled");
      await expect(
        setOrderStatus(projectRoot, "ord-machine-001", "delivered"),
      ).rejects.toThrow(/illegal transition cancelled→delivered/);
    });

    it("rejects in_progress → delivered without a materialized current result", async () => {
      await setOrderStatus(projectRoot, "ord-machine-001", "approved");
      await setOrderStatus(projectRoot, "ord-machine-001", "in_progress");
      await expect(
        setOrderStatus(projectRoot, "ord-machine-001", "delivered"),
      ).rejects.toThrow(/cannot mark.*delivered without a current result version/);
      const order = JSON.parse(await fs.readFile(path.join(projectRoot, ".repochan/orders/ord-machine-001/order.json"), "utf8"));
      expect(order.status).toBe("in_progress");
    });

    it("rejects delivered when the current result metadata points to missing bytes", async () => {
      await setOrderStatus(projectRoot, "ord-machine-001", "approved");
      await setOrderStatus(projectRoot, "ord-machine-001", "in_progress");
      const sourceFile = path.join(projectRoot, "missing-after-create.png");
      await fs.writeFile(sourceFile, "result bytes");
      await createOrderResult(projectRoot, {
        orderId: "ord-machine-001", versionId: "v1", files: [sourceFile],
        tool: "manual-upload",
      });
      await fs.rm(path.join(projectRoot, ".repochan/orders/ord-machine-001/versions/v1/missing-after-create.png"));
      const orderPath = path.join(projectRoot, ".repochan/orders/ord-machine-001/order.json");
      const before = JSON.parse(await fs.readFile(orderPath, "utf8"));
      before.status = "in_progress";
      await fs.writeFile(orderPath, JSON.stringify(before));

      await expect(setOrderStatus(projectRoot, "ord-machine-001", "delivered"))
        .rejects.toThrow(/missing or is not a non-empty regular file/);
      const order = JSON.parse(await fs.readFile(orderPath, "utf8"));
      expect(order.status).toBe("in_progress");
    });
  });

  // ── Order revision validation ────────────────────────────────

  describe("order.add_revision validation", () => {
    beforeEach(async () => {
      await createOrders(projectRoot, {
        order: {
          orderId: "ord-revision-001",
          requestType: "new_asset",
          assetType: "icon",
          brief: { intent: "icon", mustInclude: [], avoid: [], creativeFreedom: [] },
          deliverables: [],
          acceptanceCriteria: [],
        },
      });
    });

    it("rejects empty revision request", async () => {
      await expect(
        addOrderRevision(projectRoot, "ord-revision-001", ""),
      ).rejects.toThrow(/revisionRequest/);
    });

    it("rejects whitespace-only revision request", async () => {
      await expect(
        addOrderRevision(projectRoot, "ord-revision-001", "   "),
      ).rejects.toThrow();
    });

    it("accepts non-empty revision request", async () => {
      const order = await addOrderRevision(projectRoot, "ord-revision-001", "make hair longer");
      expect(order.status).toBe("needs_revision");
      expect(order.revisions).toHaveLength(1);
    });
  });

  // ── Order ID format validation ───────────────────────────────

  describe("orderId format gate", () => {
    it("rejects orderId not matching ord- pattern", async () => {
      await expect(
        createOrders(projectRoot, {
          order: {
            orderId: "bad-id",
            requestType: "new_asset",
            assetType: "icon",
            brief: { intent: "x", mustInclude: [], avoid: [], creativeFreedom: [] },
            deliverables: [],
            acceptanceCriteria: [],
          },
        }),
      ).rejects.toThrow();
    });
  });

  // ── image-gen prompt hard gate ───────────────────────────────

  describe("createOrderResult generationPrompt gate", () => {
    beforeEach(async () => {
      await createOrders(projectRoot, {
        order: {
          orderId: "ord-gen-001",
          requestType: "new_asset",
          assetType: "icon",
          brief: { intent: "icon", mustInclude: [], avoid: [], creativeFreedom: [] },
          deliverables: [],
          acceptanceCriteria: [],
        },
      });
      await setOrderStatus(projectRoot, "ord-gen-001", "approved");
    });

    it("rejects image_generate tool without generationPrompt", async () => {
      const sourceFile = path.join(projectRoot, "generated.png");
      await fs.writeFile(sourceFile, "generated bytes");
      await expect(
        createOrderResult(projectRoot, {
          orderId: "ord-gen-001",
          files: [sourceFile],
          tool: "image_generate:gpt-image-2",
          promptBrief: "short summary only",
        }),
      ).rejects.toThrow(/generationPrompt is REQUIRED/);
    });

    it("rejects image-gen tool variant without generationPrompt", async () => {
      const sourceFile = path.join(projectRoot, "generated-variant.png");
      await fs.writeFile(sourceFile, "generated variant bytes");
      await expect(
        createOrderResult(projectRoot, {
          orderId: "ord-gen-001",
          files: [sourceFile],
          tool: "image-gen-pi:fal",
          promptBrief: "short summary only",
        }),
      ).rejects.toThrow(/generationPrompt is REQUIRED/);
    });

    it("accepts non-image-gen tool without generationPrompt", async () => {
      const sourceFile = path.join(projectRoot, "manual-upload.png");
      await fs.writeFile(sourceFile, "manual image bytes");
      const res = await createOrderResult(projectRoot, {
        orderId: "ord-gen-001",
        tool: "manual-upload",
        promptBrief: "manually uploaded",
        files: [sourceFile],
      });
      expect(res.version.tool).toBe("manual-upload");
    });
  });
});

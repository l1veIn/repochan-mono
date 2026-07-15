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
  setCurrentOrderResult,
} from "../src/entities/index.js";
import { initProtocol } from "../src/protocol/index.js";
import { validateInput, ValidationError } from "../src/validate.js";
import {
  OrderCreateCandidateParamsSchema,
  OrderCreateParamsSchema,
  OrderCreateResultParamsSchema,
  OrderSetStatusParamsSchema,
  PersonaCreateParamsSchema,
} from "../src/schemas/index.js";
import { Type } from "typebox";

describe("unified validation layer", () => {
  let tmpRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-core-validate-"));
    projectRoot = tmpRoot;
    await initProtocol(projectRoot);
    // seed upstream artifacts
    const r = path.join(projectRoot, ".repochan");
    await fs.writeFile(path.join(r, "analysis", "current.json"), JSON.stringify({ summary: "test" }));
    await fs.writeFile(path.join(r, "persona", "current.json"), JSON.stringify({ name: "test", rolePrompt: "test", artStyle: "cel-shaded" }));
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
        .toThrow(/currentVersion/);
      expect(() => validateInput("order.create", OrderCreateParamsSchema, { order: { ...base, orderAsset: { currentVersion: "ghost" } } }))
        .toThrow(/orderAsset/);
    });
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
        markDelivered: false,
      });
      await setOrderStatus(projectRoot, "ord-machine-001", "delivered");

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
        tool: "manual-upload", markDelivered: false,
      });
      await fs.rm(path.join(projectRoot, ".repochan/orders/ord-machine-001/versions/v1/missing-after-create.png"));

      await expect(setOrderStatus(projectRoot, "ord-machine-001", "delivered"))
        .rejects.toThrow(/missing or is not a non-empty regular file/);
      const order = JSON.parse(await fs.readFile(path.join(projectRoot, ".repochan/orders/ord-machine-001/order.json"), "utf8"));
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

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAssetVersion,
  createOrders,
  createOrUpdatePersona,
  initProtocol,
  protocolRoot,
  setOrderStatus,
  validateProtocol,
  writeJson,
} from "../src/index.js";

async function tempProject() {
  return mkdtemp(path.join(tmpdir(), "repochan-core-flow-"));
}

describe("RepoChan protocol smoke flow", () => {
  it("supports init -> analysis -> persona -> order -> approval -> asset -> validate", async () => {
    const cwd = await tempProject();
    await initProtocol(cwd);
    await writeJson(path.join(protocolRoot(cwd), "analysis.json"), {
      schemaVersion: "repochan.analysis.v1",
      generatedAt: new Date().toISOString(),
      project: { name: "minimal" },
    });

    await createOrUpdatePersona(cwd, {
      persona: { name: "RepoChan", visual: { palette: ["#38bdf8"] } },
      slug: "repochan",
    }, "create");

    const { orders } = await createOrders(cwd, {
      order: {
        orderId: "ord-hero-001",
        requestType: "new_asset",
        assetType: "hero",
        brief: { intent: "README hero", mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [{ name: "hero", format: "png" }],
        acceptanceCriteria: ["usable as README hero"],
      },
    });
    expect(orders[0].status).toBe("draft");

    await setOrderStatus(cwd, "ord-hero-001", "approved");
    const asset = await createAssetVersion(cwd, {
      assetId: "readme-hero",
      orderId: "ord-hero-001",
      versionId: "v1",
      files: ["hero.png"],
      promptBrief: "A clean RepoChan README hero.",
    });
    expect(asset.manifest.currentVersion).toBe("v1");

    const validation = await validateProtocol(cwd);
    expect(validation.ok).toBe(true);
    expect(validation.checked.orders).toBe(1);
    expect(validation.checked.assets).toBe(1);
  });
});

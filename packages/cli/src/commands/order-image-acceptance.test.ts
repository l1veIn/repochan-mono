import { promises as fs, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrders, readOrder, setOrderStatus } from "@repochan/core";
import { seedUpstream } from "../../../core/test-support/fixtures.js";
import { runOrderCandidateCreate, runOrderCreateResult } from "./order.js";

vi.mock("@repochan/core", async () => import("../../../core/src/index.js"));
vi.mock("@repochan/image-edit", async () => import("../../../image-edit/src/image-inspect.js"));

let root: string;
const orderId = "ord-image-acceptance";
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-order-image-accept-"));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  await seedUpstream(root);
  await createOrders(root, { order: {
    orderId, requestType: "new_asset", assetType: "illustration",
    brief: { intent: "fixture", mustInclude: [], avoid: [], creativeFreedom: [] },
    deliverables: [], acceptanceCriteria: [],
  } });
  await setOrderStatus(root, orderId, "approved");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

async function paramsFile(filename: string) {
  const file = path.join(root, "params.json");
  await fs.writeFile(file, JSON.stringify({ orderId, versionId: "v1", files: [filename], tool: "manual" }));
  return file;
}
const bindings = { current: runOrderCreateResult, candidate: runOrderCandidateCreate };

describe.each(Object.entries(bindings))("order %s image acceptance", (kind, publish) => {
  it("rejects corrupt IDAT before any order or version mutation", async () => {
    const bytes = Buffer.from(readFileSync(new URL("../../../image-gen/test/fixtures/valid.png", import.meta.url)));
    const idat = bytes.indexOf(Buffer.from("IDAT"));
    bytes.fill(0, idat + 4, idat + 20);
    await fs.writeFile(path.join(root, "corrupt.png"), bytes);
    const before = await fs.readFile(path.join(root, ".repochan/orders", orderId, "order.json"));
    await expect(publish(root, await paramsFile("corrupt.png"), { json: true })).rejects.toThrow(/unreadable image/);
    expect(await fs.readFile(path.join(root, ".repochan/orders", orderId, "order.json"))).toEqual(before);
    expect(await fs.readdir(path.join(root, ".repochan/orders", orderId, "versions"))).toEqual([]);
    expect(await fs.readdir(path.join(root, ".repochan/orders", orderId))).toEqual(["order.json", "versions"]);
  });

  it.each(["png", "jpeg", "webp"])("publishes valid %s bytes unchanged", async (format) => {
    const bytes = readFileSync(new URL(`../../../image-gen/test/fixtures/valid.${format}`, import.meta.url));
    const filename = `image.${format}`;
    await fs.writeFile(path.join(root, filename), bytes);
    await publish(root, await paramsFile(kind === "candidate" ? path.join(root, filename) : filename), { json: true });
    expect(await fs.readFile(path.join(root, ".repochan/orders", orderId, "versions/v1", filename))).toEqual(bytes);
    expect(await readOrder(root, orderId)).toMatchObject(kind === "current"
      ? { status: "delivered", currentVersion: "v1", candidateVersions: [] }
      : { status: "approved", candidateVersions: ["v1"] });
  });

  it.each(["document.txt", "vector.svg"])("preserves the generic %s publication contract", async (filename) => {
    const bytes = filename.endsWith("svg") ? '<svg xmlns="http://www.w3.org/2000/svg"/>' : "an opaque document artifact";
    await fs.writeFile(path.join(root, filename), bytes);
    await publish(root, await paramsFile(filename), { json: true });
    expect(await fs.readFile(path.join(root, ".repochan/orders", orderId, "versions/v1", filename), "utf8")).toBe(bytes);
  });
});

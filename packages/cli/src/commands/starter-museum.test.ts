import { mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createOrUpdatePersona, readOrder, writeAnalysisArtifact, validateStarterAssetState, validateStarterManifest, type StarterAssetsConfig } from "@repochan/core";
import { runStarterCreateOrder } from "./starter.js";

const source = fileURLToPath(new URL("../../../starters/landing-museum/", import.meta.url));
const identitySlots = ["study-excited", "study-focused", "study-deadpan", "study-chibi", "prop-one", "prop-two", "prop-three", "prop-four"];

describe("default Starter project-specific studies and props", () => {
  it("cannot pass localized validation while the eight displayed identity images still use source artwork", async () => {
    const manifest = validateStarterManifest(JSON.parse(await readFile(path.join(source, "repochan/starter.json"), "utf8")));
    const config = JSON.parse(await readFile(path.join(source, "repochan/assets.json"), "utf8")) as StarterAssetsConfig;
    const outputs = manifest.assets.flatMap((slot) => slot.kind === "scalar" ? [slot.output] : slot.publications.map(({ output }) => output));
    for (const [name, state] of Object.entries(config.assets)) {
      if (identitySlots.includes(name)) continue;
      state.status = "customized";
      if (state.kind === "bundle") for (const item of Object.values(state.items)) item.status = "customized";
    }
    const issues = validateStarterAssetState(manifest, config, outputs, { requireCustomized: true });
    expect(issues).toHaveLength(8);
    for (const slot of identitySlots) expect(issues.some((issue) => issue.startsWith(`${slot}:`))).toBe(true);
    expect(validateStarterAssetState(manifest, config, outputs)).toEqual([]);
  });

  it("materializes executable single-subject orders for every displayed study and prop through the real CLI command", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repochan-museum-orders-"));
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await writeAnalysisArtifact(root, {});
      await createOrUpdatePersona(root, { persona: { name: "Target", rolePrompt: "target character", artStyle: "ink" } }, "create");
      const manifest = validateStarterManifest(JSON.parse(await readFile(path.join(source, "repochan/starter.json"), "utf8")));
      for (const slotName of identitySlots) {
        await runStarterCreateOrder(root, slotName, { outputDir: source, intent: `Target-project ${slotName}`, json: true });
        const order = await readOrder(root, `ord-${slotName}-001`);
        const declaration = manifest.assets.find(({ slot }) => slot === slotName)!;
        expect(order.status).toBe("draft");
        expect(order.assetType).toBe(declaration.order!.assetType);
        expect(order.brief.intent).toBe(`Target-project ${slotName}`);
        expect(order.deliverables).toEqual(declaration.order!.deliverables);
        expect(order.templateId).toBeUndefined();
      }
    } finally {
      output.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
});

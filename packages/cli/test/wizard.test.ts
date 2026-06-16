import { describe, expect, it } from "vitest";
import { DEFAULT_REPOCHAN_SETTINGS } from "../src/app/settings.js";
import { buildWizardInitialMessage, chooseGenerateStep, formatWizardSummary, type WizardSnapshot } from "../src/app/wizard.js";

function snapshot(partial: Partial<WizardSnapshot>): WizardSnapshot {
  return {
    protocol: {
      exists: false,
      root: ".repochan",
      analysis: false,
      persona: false,
      analysisVersions: [],
      personaVersions: [],
      orders: [],
      assets: [],
      ...(partial.protocol ?? {}),
    },
    orders: partial.orders ?? [],
    assets: partial.assets ?? [],
  };
}

describe("RepoChan first-run wizard decisions", () => {
  it("starts with analysis for an empty project", () => {
    expect(chooseGenerateStep(snapshot({}), DEFAULT_REPOCHAN_SETTINGS)).toEqual({ kind: "phase", args: ["analysis"] });
  });

  it("moves through persona, orders, painter, and assets based on protocol state", () => {
    expect(
      chooseGenerateStep(snapshot({ protocol: { exists: true, analysis: true, persona: false } }), DEFAULT_REPOCHAN_SETTINGS),
    ).toEqual({ kind: "phase", args: ["persona"] });

    expect(
      chooseGenerateStep(snapshot({ protocol: { exists: true, analysis: true, persona: true } }), DEFAULT_REPOCHAN_SETTINGS),
    ).toEqual({ kind: "phase", args: ["orders", "--goal", DEFAULT_REPOCHAN_SETTINGS.defaultGoal] });

    expect(
      chooseGenerateStep(
        snapshot({
          protocol: { exists: true, analysis: true, persona: true },
          orders: [{ orderId: "ord-hero-001", status: "approved", assetType: "hero", priority: "normal", file: "ord-hero-001.json" }],
        }),
        DEFAULT_REPOCHAN_SETTINGS,
      ),
    ).toEqual({ kind: "phase", args: ["painter", "--order", "ord-hero-001"] });

    expect(
      chooseGenerateStep(
        snapshot({
          protocol: { exists: true, analysis: true, persona: true },
          assets: [{ assetId: "hero", currentVersion: "v1", versionCount: 1 }],
        }),
        DEFAULT_REPOCHAN_SETTINGS,
      ),
    ).toEqual({ kind: "app", screen: "assets" });
  });

  it("builds a guided wizard message and noninteractive summary", () => {
    const state = snapshot({ protocol: { exists: true, analysis: true, persona: true } });

    expect(buildWizardInitialMessage(state, DEFAULT_REPOCHAN_SETTINGS)).toContain("first-run wizard");
    expect(buildWizardInitialMessage(state, DEFAULT_REPOCHAN_SETTINGS)).toContain(DEFAULT_REPOCHAN_SETTINGS.defaultGoal);
    expect(formatWizardSummary(state, DEFAULT_REPOCHAN_SETTINGS)).toContain("next: repochan phase orders");
  });
});

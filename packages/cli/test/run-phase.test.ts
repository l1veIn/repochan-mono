import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRunPhaseInitialMessage,
  createRunPhaseRuntime,
  parseRunPhaseArgs,
} from "../src/app/run-phase.js";

async function tempProject() {
  return mkdtemp(path.join(tmpdir(), "repochan-run-phase-"));
}

describe("repochan run phase commands", () => {
  it("parses supported phase commands and required flags", () => {
    expect(parseRunPhaseArgs(["analysis"])).toEqual({ phase: "analysis", newSession: false });
    expect(parseRunPhaseArgs(["persona", "--new"])).toEqual({ phase: "persona", newSession: true });
    expect(parseRunPhaseArgs(["orders", "--goal", "README hero"])).toEqual({
      phase: "orders",
      goal: "README hero",
      newSession: false,
    });
    expect(parseRunPhaseArgs(["painter", "--order=ord-test-001"], { newSession: true })).toEqual({
      phase: "painter",
      orderId: "ord-test-001",
      newSession: true,
    });
  });

  it("rejects missing phase-specific flags", () => {
    expect(() => parseRunPhaseArgs(["orders"])).toThrow("--goal");
    expect(() => parseRunPhaseArgs(["painter"])).toThrow("--order");
    expect(() => parseRunPhaseArgs(["analysis", "--goal", "not allowed"])).toThrow("only valid");
  });

  it("builds constrained initial prompts", () => {
    const ordersPrompt = buildRunPhaseInitialMessage({
      phase: "orders",
      goal: "README hero",
      newSession: false,
    });
    expect(ordersPrompt).toContain("single constrained phase: orders");
    expect(ordersPrompt).toContain("repochan-art-director");
    expect(ordersPrompt).toContain("Goal for this orders phase: README hero");

    const painterPrompt = buildRunPhaseInitialMessage({
      phase: "painter",
      orderId: "ord-test-001",
      newSession: true,
    });
    expect(painterPrompt).toContain("Specific order id for this painter phase: ord-test-001");
    expect(painterPrompt).toContain("must be approved or in_progress");
  });

  it("constructs a phase runtime without a configured model", async () => {
    const cwd = await tempProject();
    const agentDir = path.join(cwd, ".pi-test-agent");

    const result = await createRunPhaseRuntime({
      cwd,
      agentDir,
      phase: "analysis",
      newSession: false,
    });

    expect(result.runtime).toBeTruthy();
    expect(result.diagnostics.availableModelCount).toBe(0);
    expect(result.diagnostics.resources.filter((diagnostic) => diagnostic.type === "error")).toEqual([]);
  });
});

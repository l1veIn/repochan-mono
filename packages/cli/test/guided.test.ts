import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGuidedConductorNote,
  createGuidedRuntime,
  DEFAULT_GUIDED_INITIAL_MESSAGE,
} from "../src/app/run-guided.js";

async function tempProject() {
  return mkdtemp(path.join(tmpdir(), "repochan-guided-"));
}

describe("repochan guided runtime", () => {
  it("constructs guided mode runtime without a configured model", async () => {
    const cwd = await tempProject();
    const agentDir = path.join(cwd, ".pi-test-agent");

    const result = await createGuidedRuntime({ cwd, agentDir });

    expect(result.runtime).toBeTruthy();
    expect(result.diagnostics.availableModelCount).toBe(0);
    expect(result.diagnostics.resources.filter((diagnostic) => diagnostic.type === "error")).toEqual([]);
    expect(DEFAULT_GUIDED_INITIAL_MESSAGE).toContain("protocol.inspect");
    expect(buildGuidedConductorNote("continue")).toContain("continue the latest guided session");
  });
});

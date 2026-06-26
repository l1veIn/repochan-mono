import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const cliRoot = path.resolve(__dirname, "..");

async function source(relativePath: string) {
  return readFile(path.join(cliRoot, relativePath), "utf8");
}

describe("interview runs inside the RepoChan TUI", () => {
  it("does not leave Home or Guided Wizard for a separate Pi interactive interview", async () => {
    const indexSource = await source("src/index.ts");
    const homeSource = await source("src/pages/home.ts");
    const guidedSource = await source("src/pages/guided-wizard.ts");

    expect(indexSource).not.toContain("onInterview");
    expect(homeSource).not.toContain("onInterview");
    expect(guidedSource).not.toContain("onStartInterview");
  });

  it("starts the interviewer with a CLI-bound extension UI context", async () => {
    const interviewSource = await source("src/pages/interview.ts");
    const runtimeSource = await source("src/lib/runtime.ts");

    expect(interviewSource).toContain("startRoleSessionWithUi");
    expect(interviewSource).not.toContain("onStartInterview");
    expect(runtimeSource).toContain("createRepoChanExtensionUIContext");
    expect(runtimeSource).toContain("bindExtensions");
    expect(runtimeSource).toContain('mode: "tui"');
  });
});

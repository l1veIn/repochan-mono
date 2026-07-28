import { describe, expect, it } from "vitest";
import { resolveNpmInvocation } from "./starter-preview.js";

describe("starter preview npm invocation", () => {
  it("routes npm through ComSpec on Windows", () => {
    expect(resolveNpmInvocation(["run", "build"], "win32", "C:\\Windows\\System32\\cmd.exe")).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm", "run", "build"],
    });
  });

  it("falls back to cmd.exe when ComSpec is empty", () => {
    expect(resolveNpmInvocation(["install"], "win32", "")).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npm", "install"],
    });
  });

  it("executes npm directly outside Windows", () => {
    expect(resolveNpmInvocation(["run", "build"], "linux")).toEqual({
      command: "npm",
      args: ["run", "build"],
    });
  });
});

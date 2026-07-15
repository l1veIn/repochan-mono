import { describe, expect, it } from "vitest";
import { normalizeCliArgv } from "./argv.js";

describe("normalizeCliArgv", () => {
  it("keeps the global version flag bare", () => {
    expect(normalizeCliArgv(["--version"])).toEqual(["--version"]);
  });

  it("maps the old asset-apply version option only within its command", () => {
    expect(normalizeCliArgv(["starter", "asset-apply", "hero", "--version", "v1"]))
      .toEqual(["starter", "asset-apply", "hero", "--result-version", "v1"]);
    expect(normalizeCliArgv(["order", "get-result", "ord-one", "--version", "v1"]))
      .toEqual(["order", "get-result", "ord-one", "--version", "v1"]);
  });

  it("allows stdin shorthand for data and starter content files", () => {
    expect(normalizeCliArgv(["starter", "configure", "--content-file", "-"]))
      .toEqual(["starter", "configure", "--content-file=-"]);
    expect(normalizeCliArgv(["persona", "create", "--data-file", "-"]))
      .toEqual(["persona", "create", "--data-file=-"]);
  });
});

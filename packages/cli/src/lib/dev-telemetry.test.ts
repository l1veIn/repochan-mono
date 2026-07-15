import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ERRORS_PATH,
  classifyError,
  clearErrors,
  isEnabled,
  recordError,
  readErrors,
  summarizeErrors,
  _resetRecordedForTest,
  type ErrorCategory,
} from "./dev-telemetry.js";
import { UsageError } from "./output.js";

const ENV_VAR = "REPOCHAN_DEV_TELEMETRY";

let tmpFile: string;
let savedEnv: string | undefined;

beforeEach(async () => {
  savedEnv = process.env[ENV_VAR];
  process.env[ENV_VAR] = "1";
  _resetRecordedForTest();
  const dir = await mkdtemp(path.join(os.tmpdir(), "repochan-telemetry-"));
  tmpFile = path.join(dir, "dev", "errors.jsonl");
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = savedEnv;
});

describe("isEnabled", () => {
  it("is truthy for 1 / true / yes (case-insensitive)", () => {
    for (const v of ["1", "true", "TRUE", "yes", "Yes"]) {
      process.env[ENV_VAR] = v;
      expect(isEnabled()).toBe(true);
    }
  });

  it("is false when unset or non-truthy", () => {
    delete process.env[ENV_VAR];
    expect(isEnabled()).toBe(false);
    process.env[ENV_VAR] = "0";
    expect(isEnabled()).toBe(false);
    process.env[ENV_VAR] = "false";
    expect(isEnabled()).toBe(false);
  });
});

describe("recordError gate", () => {
  it("writes nothing when telemetry is disabled", async () => {
    delete process.env[ENV_VAR];
    recordError({ error: new Error("x"), argv: ["order", "get"], filePath: tmpFile });
    await expect(readFile(tmpFile, "utf8")).rejects.toThrow();
  });

  it("creates the parent directory when missing", () => {
    // tmpFile lives under <tmpdir>/dev/errors.jsonl; the dev/ dir does not
    // exist yet. recordError must mkdir it.
    recordError({ error: new Error("boom"), argv: ["image", "gen"], filePath: tmpFile });
    const lines = readErrors(tmpFile);
    expect(lines).toHaveLength(1);
    expect(lines[0].message).toBe("boom");
    expect(lines[0].commandGroup).toBe("image");
  });
});

describe("recordError append behaviour", () => {
  it("appends one JSONL line per call across multiple calls", () => {
    recordError({ error: new Error("first"), argv: ["a"], filePath: tmpFile });
    recordError({ error: new Error("second"), argv: ["b"], filePath: tmpFile });
    recordError({ error: new Error("third"), argv: ["c"], filePath: tmpFile });
    const lines = readErrors(tmpFile);
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.message)).toEqual(["first", "second", "third"]);
  });

  it("records argv, exitCode, and category override verbatim", () => {
    recordError({
      error: new Error("nope"),
      argv: ["order", "gett", "--json"],
      exitCode: 2,
      category: "unknown-subcommand",
      filePath: tmpFile,
    });
    const [rec] = readErrors(tmpFile);
    expect(rec.argv).toEqual(["order", "gett", "--json"]);
    expect(rec.exitCode).toBe(2);
    expect(rec.category).toBe("unknown-subcommand");
    expect(rec.commandGroup).toBe("order");
  });

  it("is robust to a non-Error thrown value", () => {
    recordError({ error: "string error", argv: ["x"], filePath: tmpFile });
    const [rec] = readErrors(tmpFile);
    expect(rec.message).toBe("string error");
  });
});

describe("classifyError", () => {
  function classOf(err: unknown): ErrorCategory {
    return classifyError(err);
  }

  it("flags missing required args from cac", () => {
    const e = Object.assign(new Error("missing required args `orderId`"), { name: "CACError" });
    expect(classOf(e)).toBe("missing-arg");
  });

  it("flags unknown options from cac", () => {
    const e = Object.assign(new Error("Unknown option `--bogus`"), { name: "CACError" });
    expect(classOf(e)).toBe("bad-flag");
  });

  it("flags missing option values from cac", () => {
    const e = Object.assign(new Error("option value is missing"), { name: "CACError" });
    expect(classOf(e)).toBe("missing-arg");
  });

  it("recognises the dispatcher's unknown-subcommand error", () => {
    expect(classOf(new Error("Unknown order subcommand: gett. Available: get, list"))).toBe("unknown-subcommand");
  });

  it("recognises UsageError", () => {
    expect(classOf(new UsageError("bad usage", "hint"))).toBe("usage");
  });

  it("falls back to runtime for anything else", () => {
    expect(classOf(new Error("Cannot read properties of undefined"))).toBe("runtime");
    expect(classOf("a string")).toBe("runtime");
  });
});

describe("readErrors", () => {
  it("returns [] when the file does not exist", () => {
    expect(readErrors(path.join(os.tmpdir(), "definitely-missing-" + Date.now() + ".jsonl"))).toEqual([]);
  });

  it("skips malformed lines without aborting the read", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "repochan-read-"));
    const f = path.join(dir, "errors.jsonl");
    const valid = JSON.stringify({
      ts: "2026-07-15T00:00:00.000Z",
      argv: ["order", "get"],
      commandGroup: "order",
      category: "runtime",
      errorType: "Error",
      message: "ok",
      exitCode: 1,
      cwd: "/tmp",
      cliVersion: "0.3.0",
    });
    await writeFile(f, "not json at all\n" + valid + "\n{ broken\n\n");
    const records = readErrors(f);
    expect(records).toHaveLength(1);
    expect(records[0].message).toBe("ok");
  });
});

describe("summarizeErrors", () => {
  it("rolls up totals, categories, command groups, and top argv", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "repochan-summary-"));
    const f = path.join(dir, "errors.jsonl");
    const mk = (argv: string[], category: ErrorCategory, ts: string) =>
      JSON.stringify({
        ts, argv, commandGroup: argv[0], category,
        errorType: "Error", message: "m", exitCode: 1, cwd: "/x", cliVersion: "0.3.0",
      });
    const content = [
      mk(["order", "gett"], "unknown-subcommand", "2026-07-14T10:00:00.000Z"),
      mk(["order", "gett"], "unknown-subcommand", "2026-07-14T11:00:00.000Z"), // same argv → count 2
      mk(["image", "gen"], "bad-flag", "2026-07-15T09:00:00.000Z"),
      mk(["order", "list"], "missing-arg", "2026-07-15T12:00:00.000Z"),
    ].join("\n") + "\n";
    await writeFile(f, content);

    const s = summarizeErrors({ filePath: f, limit: 2, topN: 5 });

    expect(s.total).toBe(4);
    expect(s.earliest).toBe("2026-07-14T10:00:00.000Z");
    expect(s.latest).toBe("2026-07-15T12:00:00.000Z");
    expect(s.byCategory["unknown-subcommand"]).toBe(2);
    expect(s.byCategory["bad-flag"]).toBe(1);
    expect(s.byCommandGroup["order"]).toBe(3);
    expect(s.byCommandGroup["image"]).toBe(1);
    // The duplicate argv should be the top entry with count 2.
    expect(s.topArgv[0]).toEqual({ argv: "order gett", count: 2 });
    // limit=2 → most recent 2, newest first.
    expect(s.recent).toHaveLength(2);
    expect(s.recent[0].ts).toBe("2026-07-15T12:00:00.000Z");
  });

  it("returns an empty summary for a missing file", () => {
    const s = summarizeErrors({ filePath: path.join(os.tmpdir(), "nope-" + Date.now()) });
    expect(s.total).toBe(0);
    expect(s.earliest).toBeNull();
    expect(s.recent).toEqual([]);
  });
});

describe("clearErrors", () => {
  it("truncates an existing file to zero length", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "repochan-clear-"));
    const f = path.join(dir, "errors.jsonl");
    await writeFile(f, "some content\n");
    clearErrors(f);
    expect(await readFile(f, "utf8")).toBe("");
  });

  it("is a no-op when the file does not exist", () => {
    expect(() => clearErrors(path.join(os.tmpdir(), "missing-" + Date.now()))).not.toThrow();
  });
});

describe("ERRORS_PATH default location", () => {
  it("points at ~/.repochan/dev/errors.jsonl", () => {
    expect(ERRORS_PATH).toBe(path.join(os.homedir(), ".repochan", "dev", "errors.jsonl"));
  });
});

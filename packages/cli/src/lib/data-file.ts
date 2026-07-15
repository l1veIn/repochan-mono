import { readFileSync } from "node:fs";
import { UsageError } from "./output.js";

/**
 * Read a JSON payload for write subcommands.
 *
 * Sources (in order):
 *   1. `--data-file <path>` — read that file
 *   2. `--data-file -`     — read stdin
 *   3. omitted + piped stdin (non-TTY) — read stdin (agent-friendly default)
 *
 * Complex nested JSON never has to cross argv, avoiding shell quoting hazards.
 *
 *   repochan persona create --data-file persona.json
 *   echo '{...}' | repochan persona create --data-file -
 *   echo '{...}' | repochan persona create
 */
export function readDataFile(dataFile: string | undefined): Record<string, unknown> {
  let raw: string;

  if (dataFile && dataFile !== "-") {
    raw = readFileSync(dataFile, "utf8");
  } else if (dataFile === "-" || isPipedStdin()) {
    raw = readFileSync(0, "utf8"); // fd 0 = stdin
  } else {
    throw new UsageError(
      "Missing JSON payload. Write commands take their payload from a JSON file or stdin.",
      "Pass --data-file <path>, --data-file - (stdin), or pipe JSON on stdin.\n" +
        "  repochan persona create --data-file persona.json\n" +
        "  echo '{...}' | repochan persona create",
    );
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new UsageError(
      dataFile && dataFile !== "-"
        ? `--data-file ${dataFile} is empty.`
        : "JSON payload from stdin is empty.",
    );
  }
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    throw new UsageError(
      `JSON payload is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** True when stdin is a pipe/redirect (not an interactive TTY). */
function isPipedStdin(): boolean {
  return !process.stdin.isTTY;
}

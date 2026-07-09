import { readFileSync } from "node:fs";
import { UsageError } from "./output.js";

/**
 * Read a JSON payload from --data-file. Accepts a file path or "-" for stdin.
 * Used by all write subcommands so complex JSON never has to cross the shell
 * (avoiding quoting hell), per ADR §5.4.
 *
 *   repochan persona create --data-file persona.json
 *   echo '{...}' | repochan persona create --data-file -
 */
export function readDataFile(dataFile: string | undefined): Record<string, unknown> {
  if (!dataFile) {
    throw new UsageError(
      "Missing --data-file. Write commands take their payload from a JSON file or stdin.",
      "Pass --data-file <path> or --data-file - (stdin). Example: repochan persona create --data-file persona.json",
    );
  }
  let raw: string;
  if (dataFile === "-") {
    raw = readFileSync(0, "utf8"); // fd 0 = stdin
  } else {
    raw = readFileSync(dataFile, "utf8");
  }
  const trimmed = raw.trim();
  if (!trimmed) throw new UsageError("--data-file is empty.");
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    throw new UsageError(
      `--data-file is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

import { appendFileSync, mkdirSync, readFileSync, existsSync, truncateSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cliVersion } from "./register.js";
import { UsageError } from "./output.js";

// ---------------------------------------------------------------------------
// Dev telemetry — records failed CLI invocations to ~/.repochan/dev/errors.jsonl
//
// Purpose: give skill authors periodic, structured data on how agents misuse
// the CLI (wrong params, unknown commands, typos) so skills can be tightened.
//
// Privacy: skill write payloads arrive via stdin heredoc, never in argv. We
// record argv (command structure + flags) and the error message only — no
// stdin, no prompt content, no credentials.
//
// Gate: entirely inert unless REPOCHAN_DEV_TELEMETRY is set to a truthy value.
// The code ships in every build but does nothing in production unless opted in.
// All filesystem writes are wrapped so telemetry can never break a CLI run.
// ---------------------------------------------------------------------------

const DEV_DIR = path.join(os.homedir(), ".repochan", "dev");
export const ERRORS_PATH = path.join(DEV_DIR, "errors.jsonl");

const ENV_VAR = "REPOCHAN_DEV_TELEMETRY";

/** Has at least one error already been recorded for this process? */
let recorded = false;

export type ErrorCategory =
  | "unknown-command"
  | "unknown-subcommand"
  | "bad-flag"
  | "missing-arg"
  | "usage"
  | "validation"
  | "runtime";

export interface ErrorRecord {
  ts: string;
  argv: string[];
  commandGroup: string | null;
  category: ErrorCategory;
  errorType: string;
  message: string;
  exitCode: number;
  cwd: string;
  cliVersion: string;
}

/**
 * Telemetry is on only when REPOCHAN_DEV_TELEMETRY is a truthy value
 * ("1", "true", "yes"). Read live so tests can toggle without re-import.
 */
export function isEnabled(): boolean {
  const v = process.env[ENV_VAR];
  if (!v) return false;
  const low = v.toLowerCase();
  return low === "1" || low === "true" || low === "yes";
}

/** First non-flag token in argv, or null (the likely command group). */
function commandGroupOf(argv: string[]): string | null {
  for (const a of argv) {
    if (!a.startsWith("-")) return a;
  }
  return null;
}

/**
 * Classify an error into a category for aggregation. Message-prefix matching is
 * intentionally best-effort — the categories are for research rollup, and a
 * fallback bucket ("runtime") absorbs anything unrecognised.
 */
export function classifyError(error: unknown): ErrorCategory {
  if (error instanceof UsageError) return "usage";
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);

  if (name === "CACError") {
    if (/missing required arg/i.test(message)) return "missing-arg";
    if (/unknown option/i.test(message)) return "bad-flag";
    if (/option value is missing|expects? a value/i.test(message)) return "missing-arg";
    return "bad-flag";
  }
  if (/^Unknown\b.*subcommand/i.test(message)) return "unknown-subcommand";
  return "runtime";
}

/** Mark that a record has been written so the exit handler doesn't double-count. */
export function markRecorded(): void {
  recorded = true;
}

export interface RecordErrorInput {
  error?: unknown;
  argv?: string[];
  exitCode?: number;
  /** Override the category (used by the exit handler and command:* listener). */
  category?: ErrorCategory;
  /** Override the log path (tests write to a tmp file, not the real log). */
  filePath?: string;
}

/**
 * Append one error record to the JSONL log. Safe to call from any path:
 * disabled, filesystem, and serialization failures are swallowed so telemetry
 * can never affect the CLI's own behaviour.
 */
export function recordError(input: RecordErrorInput): void {
  if (!isEnabled()) return;
  try {
    const filePath = input.filePath ?? ERRORS_PATH;
    const dir = path.dirname(filePath);
    const argv = input.argv ?? process.argv.slice(2);
    const error = input.error;
    const category = input.category ?? classifyError(error);
    const record: ErrorRecord = {
      ts: new Date().toISOString(),
      argv,
      commandGroup: commandGroupOf(argv),
      category,
      errorType: error instanceof Error ? error.name : typeof error === "object" && error ? "Object" : "unknown",
      message: error instanceof Error ? error.message : error === undefined ? "" : String(error),
      exitCode: input.exitCode ?? 1,
      cwd: process.cwd(),
      cliVersion: cliVersion(),
    };
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(filePath, JSON.stringify(record) + "\n", "utf8");
    recorded = true;
  } catch {
    // Telemetry must never break a CLI run.
  }
}

/** Whether a record has already been written this process. */
export function hasRecorded(): boolean {
  return recorded;
}

/** Reset the "recorded" flag (tests only — isolates cases per test). */
export function _resetRecordedForTest(): void {
  recorded = false;
}

// ---------------------------------------------------------------------------
// Read / summarise — used by `repochan dev errors`
// ---------------------------------------------------------------------------

export function readErrors(filePath: string = ERRORS_PATH): ErrorRecord[] {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  const out: ErrorRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as ErrorRecord);
    } catch {
      // Skip malformed lines rather than failing the whole read.
    }
  }
  return out;
}

export interface ErrorSummary {
  total: number;
  earliest: string | null;
  latest: string | null;
  byCategory: Record<string, number>;
  byCommandGroup: Record<string, number>;
  /** argv joined by space → count, sorted desc. */
  topArgv: { argv: string; count: number }[];
  recent: ErrorRecord[];
}

export interface SummarizeOptions {
  limit?: number;
  topN?: number;
  filePath?: string;
}

/** Tally raw records into the rollup shown by `repochan dev errors`. */
export function summarizeErrors(opts: SummarizeOptions = {}): ErrorSummary {
  const limit = opts.limit ?? 5;
  const topN = opts.topN ?? 10;
  const records = readErrors(opts.filePath);

  const byCategory: Record<string, number> = {};
  const byCommandGroup: Record<string, number> = {};
  const argvCounts: Record<string, number> = {};

  for (const r of records) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    const group = r.commandGroup ?? "(none)";
    byCommandGroup[group] = (byCommandGroup[group] ?? 0) + 1;
    const key = r.argv.join(" ");
    argvCounts[key] = (argvCounts[key] ?? 0) + 1;
  }

  const topArgv = Object.entries(argvCounts)
    .map(([argv, count]) => ({ argv, count }))
    .sort((a, b) => b.count - a.count || a.argv.localeCompare(b.argv))
    .slice(0, topN);

  const sorted = [...records].sort((a, b) => a.ts.localeCompare(b.ts));

  return {
    total: records.length,
    earliest: sorted[0]?.ts ?? null,
    latest: sorted[sorted.length - 1]?.ts ?? null,
    byCategory,
    byCommandGroup,
    topArgv,
    recent: sorted.slice(-limit).reverse(),
  };
}

/** Clear the error log (used by `repochan dev errors --clear`). */
export function clearErrors(filePath: string = ERRORS_PATH): void {
  if (!existsSync(filePath)) return;
  truncateSync(filePath, 0);
}

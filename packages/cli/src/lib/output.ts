import chalk from "chalk";
import { asMissingImageMlCapabilityError } from "./image-ml-capability.js";

export type OutputOptions = { json?: boolean };

export class UsageError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
    this.name = "UsageError";
  }
}

/**
 * Sentinel thrown by `starter asset-apply` (PR5) after it has already printed
 * the structured apply failure envelope to stdout. main() skips printError for
 * it so the failure is not reported twice. Defined here in PR4; first real
 * throw site lands with the asset-apply envelope in PR5.
 */
export class ApplyFailurePrintedError extends Error {
  constructor(readonly cause?: unknown) {
    super("asset-apply failure was already printed as JSON");
    this.name = "ApplyFailurePrintedError";
  }
}

/**
 * Structural match for @repochan/image-edit's ExtractError. Duck-typed on
 * `name` + `defects` instead of instanceof so it survives cross-package /
 * duplicated-module boundaries (and keeps image-edit out of the CLI startup
 * import graph — commands load it lazily).
 */
export function isExtractError(
  error: unknown,
): error is { message: string; defects: unknown[]; qa?: unknown } {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; defects?: unknown };
  return candidate.name === "ExtractError" && Array.isArray(candidate.defects);
}

export function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

export function heading(value: string) {
  console.log(chalk.bold(value));
}

export function bullet(label: string, value: unknown) {
  console.log(`  ${chalk.cyan(label)}: ${String(value)}`);
}

export function dim(value: string) {
  return chalk.gray(value);
}

export function yesNo(value: unknown) {
  return value ? chalk.green("yes") : chalk.yellow("no");
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function printError(error: unknown, opts?: OutputOptions) {
  // Structured failure plumbing (design doc "Structured failure plumbing"):
  // in --json mode, extraction/usage failures are machine-readable on stdout.
  if (opts?.json && isExtractError(error)) {
    printJson({
      ok: false,
      error: "ExtractError",
      message: error.message,
      defects: error.defects,
      qa: error.qa ?? null,
    });
    return;
  }
  if (opts?.json && error instanceof UsageError) {
    printJson({ ok: false, error: "UsageError", message: error.message, hint: error.hint ?? null });
    return;
  }
  const missingImageMl = asMissingImageMlCapabilityError(error);
  if (missingImageMl) {
    if (opts?.json) printJson(missingImageMl);
    else {
      console.error(`${chalk.red("error")}: ${missingImageMl.message}`);
      console.error(dim(`Install: ${missingImageMl.installCommand}`));
    }
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${chalk.red("error")}: ${message}`);
  if (error instanceof UsageError && error.hint) console.error(dim(error.hint));
  if (error instanceof UsageError) console.error(dim("Run `repochan --help` to see available commands."));
}

/**
 * Emit a command result: either machine-readable JSON (--json) or a human
 * message + the structured details. Returns the details so the caller's exit
 * code logic stays simple.
 */
export function emitResult(opts: OutputOptions, humanMessage: string, details?: unknown) {
  if (opts.json) printJson(details ?? { ok: true, message: humanMessage });
  else console.log(humanMessage);
  return details;
}

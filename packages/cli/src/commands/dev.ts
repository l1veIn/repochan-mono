import { heading, bullet, dim, printJson, type OutputOptions } from "../lib/output.js";
import {
  ERRORS_PATH,
  summarizeErrors,
  clearErrors,
  isEnabled,
} from "../lib/dev-telemetry.js";

export interface DevErrorsOptions extends OutputOptions {
  limit?: number;
  clear?: boolean;
}

/**
 * repochan dev errors [--json] [--limit N] [--clear]
 *
 * Summarises the local dev telemetry log of failed CLI invocations. The log is
 * only populated while REPOCHAN_DEV_TELEMETRY is enabled; this command reads
 * regardless of the flag so the data can be reviewed after the fact.
 */
export async function runDevErrors(_cwd: string, options: DevErrorsOptions = {}) {
  if (options.clear) {
    clearErrors();
    if (options.json) return void printJson({ cleared: true, path: ERRORS_PATH });
    heading("RepoChan dev telemetry cleared");
    bullet("path", dim(ERRORS_PATH));
    return;
  }

  const summary = summarizeErrors({ limit: options.limit });

  if (options.json) {
    printJson({ path: ERRORS_PATH, enabled: isEnabled(), ...summary });
    return;
  }

  heading("RepoChan dev telemetry");
  console.log(dim(ERRORS_PATH));
  if (!isEnabled()) {
    console.log(dim("(telemetry is currently OFF — set REPOCHAN_DEV_TELEMETRY=1 to record)"));
  }
  console.log();

  if (summary.total === 0) {
    console.log(dim("No errors recorded yet."));
    return;
  }

  const range = summary.earliest && summary.latest
    ? `${summary.earliest} → ${summary.latest}`
    : (summary.earliest ?? summary.latest ?? "—");
  console.log(`Total: ${summary.total} error(s) · ${dim(range)}`);

  console.log("\nBy category:");
  printTally(summary.byCategory);

  console.log("\nBy command group:");
  printTally(summary.byCommandGroup);

  if (summary.topArgv.length > 0) {
    console.log("\nTop recurring argv:");
    const maxCount = Math.max(...summary.topArgv.map((t) => t.count));
    for (const { argv, count } of summary.topArgv) {
      const pad = String(count).padStart(String(maxCount).length, " ");
      console.log(`  ${dim(pad)}  ${argv}`);
    }
  }

  if (summary.recent.length > 0) {
    console.log(`\nMost recent (${summary.recent.length}):`);
    for (const r of summary.recent) {
      const ts = r.ts.replace(/\.\d{3}Z$/, "Z").replace("T", " ");
      const argv = r.argv.join(" ");
      console.log(`  [${ts}] ${dim(r.category.padEnd(18))} ${argv}`);
    }
  }
}

/** Print a {label → count} map as a right-aligned count + left-aligned label. */
function printTally(tally: Record<string, number>): void {
  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (entries.length === 0) {
    console.log(dim("  (none)"));
    return;
  }
  const width = Math.max(...entries.map(([, n]) => String(n).length));
  for (const [label, count] of entries) {
    console.log(`  ${String(count).padStart(width, " ")}  ${label}`);
  }
}

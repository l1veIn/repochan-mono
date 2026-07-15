import { heading, bullet, dim, printJson, type OutputOptions } from "../lib/output.js";
import {
  CONFIG_PATH,
  ERRORS_PATH,
  summarizeErrors,
  clearErrors,
  isEnabled,
  isEnvOverridden,
  setEnabled,
} from "../lib/dev-telemetry.js";

export interface DevErrorsOptions extends OutputOptions {
  limit?: number;
  clear?: boolean;
  on?: boolean;
  off?: boolean;
}

/**
 * repochan dev errors [--on | --off | --clear] [--json] [--limit N]
 *
 * With no toggle flag: summarises the local dev telemetry log of failed CLI
 * invocations. `--on` / `--off` flip the persistent master switch
 * (~/.repochan/dev/config.json); `--clear` empties the log.
 */
export async function runDevErrors(_cwd: string, options: DevErrorsOptions = {}) {
  // ---- toggle operations (mutually exclusive in practice) ----
  if (options.on) return setEnabledAndReport(true, options.json);
  if (options.off) return setEnabledAndReport(false, options.json);

  if (options.clear) {
    clearErrors();
    if (options.json) return void printJson({ cleared: true, path: ERRORS_PATH });
    heading("RepoChan dev telemetry cleared");
    bullet("path", dim(ERRORS_PATH));
    return;
  }

  const summary = summarizeErrors({ limit: options.limit });

  if (options.json) {
    printJson({ path: ERRORS_PATH, enabled: isEnabled(), envOverridden: isEnvOverridden(), ...summary });
    return;
  }

  heading("RepoChan dev telemetry");
  console.log(dim(ERRORS_PATH));
  printStatusLine();
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

/** Apply --on/--off and print a short confirmation. */
function setEnabledAndReport(enabled: boolean, json?: boolean): void {
  setEnabled(enabled);
  const effective = isEnabled();
  if (json) {
    printJson({ config: CONFIG_PATH, telemetry: enabled, effective, envOverridden: isEnvOverridden() });
    return;
  }
  heading(`RepoChan dev telemetry ${enabled ? "ON" : "OFF"}`);
  bullet("config", dim(CONFIG_PATH));
  if (isEnvOverridden() && effective !== enabled) {
    console.log(dim(`  (note: REPOCHAN_DEV_TELEMETRY is set, so effective state is ${effective ? "ON" : "OFF"})`));
  }
  console.log(dim(enabled ? "  Failed CLI calls will now be recorded." : "  Recording stopped; existing log is kept."));
}

/** One-line status indicator with override hint when the env var is shadowing. */
function printStatusLine(): void {
  const on = isEnabled();
  if (isEnvOverridden()) {
    console.log(dim(`(status: ${on ? "ON" : "OFF"} — forced by REPOCHAN_DEV_TELEMETRY; use \`repochan dev errors --on\` for a persistent switch)`));
  } else {
    console.log(dim(`(status: ${on ? "ON" : "OFF"} — turn on with \`repochan dev errors --on\`)`));
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

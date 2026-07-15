/** Bind stdin sentinels to their owning options before cac parses argv. */
export function normalizeCliArgv(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === "--data-file" || arg === "--content-file") && argv[i + 1] === "-") {
      out.push(`${arg}=-`);
      i += 1;
      continue;
    }
    out.push(arg);
  }
  return out;
}

/** Only a leading help/version flag is global; subcommands may own the same spelling. */
export function isTopLevelHelpOrVersionRequest(argv: string[]): boolean {
  return argv[0] === "-h" || argv[0] === "--help" || argv[0] === "-v" || argv[0] === "--version";
}

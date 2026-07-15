/** Normalize scoped CLI compatibility shorthands before cac parses argv. */
export function normalizeCliArgv(argv: string[]): string[] {
  const starterAssetApply = argv[0] === "starter" && argv[1] === "asset-apply";
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === "--data-file" || arg === "--content-file") && argv[i + 1] === "-") {
      out.push(`${arg}=-`);
      i += 1;
      continue;
    }
    // Before --result-version existed, asset-apply used --version. Keep that
    // command-scoped spelling compatible without stealing the global flag.
    if (starterAssetApply && arg === "--version") {
      out.push("--result-version");
      continue;
    }
    if (starterAssetApply && arg.startsWith("--version=")) {
      out.push(`--result-version=${arg.slice("--version=".length)}`);
      continue;
    }
    out.push(arg);
  }
  return out;
}

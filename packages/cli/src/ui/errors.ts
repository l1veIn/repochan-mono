import pc from "picocolors";

export class UsageError extends Error {
  readonly hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "UsageError";
    this.hint = hint;
  }
}

export function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function printTip(message: string) {
  console.error(pc.dim(message));
}

export function printError(error: unknown) {
  const message = formatError(error);
  console.error(`${pc.red("error")}: ${message}`);

  if (error instanceof UsageError) {
    if (error.hint) printTip(error.hint);
    printTip("Run `repochan --help` to see available commands and examples.");
    return;
  }

  if (/Cannot find module|dist\/index\.js|ERR_MODULE_NOT_FOUND/.test(message)) {
    printTip("Tip: from the monorepo root, build first with `pnpm --filter repochan build`, then run `pnpm --filter repochan exec node dist/index.js <command>`.");
    return;
  }

  if (/ENOENT|not found|Missing/.test(message)) {
    printTip("Tip: run `repochan inspect` or `repochan validate` to check the current .repochan state.");
  }
}

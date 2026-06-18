import chalk from "chalk";

export type OutputOptions = { json?: boolean };

export class UsageError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
    this.name = "UsageError";
  }
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

export function printError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${chalk.red("error")}: ${message}`);
  if (error instanceof UsageError && error.hint) console.error(dim(error.hint));
  if (error instanceof UsageError) console.error(dim("Run `repochan --help` to see available commands."));
}

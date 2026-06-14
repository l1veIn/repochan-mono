import pc from "picocolors";

export type OutputOptions = {
  json?: boolean;
};

export function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

export function yesNo(value: unknown) {
  return value ? pc.green("yes") : pc.yellow("no");
}

export function dim(value: string) {
  return pc.dim(value);
}

export function heading(value: string) {
  console.log(pc.bold(value));
}

export function bullet(label: string, value: unknown) {
  console.log(`  ${pc.cyan(label)}: ${String(value)}`);
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

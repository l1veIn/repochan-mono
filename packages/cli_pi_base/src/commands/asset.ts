import { type OutputOptions, UsageError } from "./common.js";

export async function runAssetCommand(_cwd: string, _args: string[], _options: OutputOptions = {}) {
  throw new UsageError("The asset command was removed. Use `repochan order get <order-id>` in the CLI/TUI, or the repochan tool actions order.list_results/order.get_result.");
}

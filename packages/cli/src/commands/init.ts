import { initProtocol, inspectProtocol } from "@repochan/core";
import { bullet, heading, printJson, type OutputOptions, yesNo } from "./common.js";

export async function runInit(cwd: string, options: OutputOptions = {}) {
  await initProtocol(cwd);
  const summary = await inspectProtocol(cwd);
  if (options.json) {
    printJson(summary);
    return;
  }
  heading("RepoChan protocol initialized");
  bullet(".repochan", yesNo(summary.exists));
  bullet("root", summary.root);
}

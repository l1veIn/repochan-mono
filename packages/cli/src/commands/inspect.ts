import { inspectProtocol } from "@repochan/core";
import { asArray, bullet, heading, printJson, yesNo, type OutputOptions } from "../ui/output.js";

export async function runInspect(cwd: string, options: OutputOptions) {
  const summary = await inspectProtocol(cwd);

  if (options.json) {
    printJson(summary);
    return;
  }

  heading("RepoChan protocol");
  bullet("root", summary.root);
  bullet(".repochan", yesNo(summary.exists));
  bullet("analysis", yesNo(summary.analysis));
  bullet("persona", yesNo(summary.persona));
  bullet("analysis versions", asArray(summary.analysisVersions).length);
  bullet("persona versions", asArray(summary.personaVersions).length);
  bullet("orders", asArray(summary.orders).length);
  bullet("assets", asArray(summary.assets).length);
}

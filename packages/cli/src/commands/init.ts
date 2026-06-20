import { initProtocol, inspectProtocol } from "@repochan/core";
import { getLanguage } from "../i18n.js";
import { bullet, heading, printJson, type OutputOptions, yesNo } from "./common.js";

export async function runInit(cwd: string, options: OutputOptions = {}) {
  const lang = getLanguage();
  await initProtocol(cwd, { language: lang });
  const summary = await inspectProtocol(cwd);
  if (options.json) {
    printJson(summary);
    return;
  }
  heading("RepoChan protocol initialized");
  bullet(".repochan", yesNo(summary.exists));
  bullet("root", summary.root);
  bullet("language", lang);
}

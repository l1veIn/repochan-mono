import { InteractiveMode } from "@earendil-works/pi-coding-agent";
import pc from "picocolors";
import { createRepoChanRuntime, type RepoChanSessionMode } from "./pi-runtime.js";

export type RunChatOptions = {
  cwd?: string;
  newSession?: boolean;
  initialMessage?: string;
};

export function printDiagnostics(diagnostics: Awaited<ReturnType<typeof createRepoChanRuntime>>["diagnostics"]) {
  for (const diagnostic of diagnostics.runtime) {
    const label = diagnostic.type === "error" ? pc.red("error") : diagnostic.type === "warning" ? pc.yellow("warning") : pc.dim("info");
    console.error(`${label}: ${diagnostic.message}`);
  }
  for (const diagnostic of diagnostics.resources) {
    const label = diagnostic.type === "error" ? pc.red("resource error") : pc.yellow("resource warning");
    console.error(`${label}: ${diagnostic.message}`);
  }
  if (diagnostics.modelFallbackMessage) {
    console.error(`${pc.yellow("model")}: ${diagnostics.modelFallbackMessage}`);
  }
}

export async function runChat(options: RunChatOptions = {}) {
  const initialSession: RepoChanSessionMode = options.newSession ? "new" : "continue";
  const result = await createRepoChanRuntime({
    cwd: options.cwd ?? process.cwd(),
    initialSession,
  });

  printDiagnostics(result.diagnostics);

  if (result.diagnostics.availableModelCount === 0) {
    console.error(pc.yellow("No configured Pi model was detected."));
    console.error(pc.dim("RepoChan chat will still open so you can use /login or /model from the normal Pi UI."));
  }

  const mode = new InteractiveMode(result.runtime, {
    modelFallbackMessage: result.diagnostics.modelFallbackMessage,
    initialMessage: options.initialMessage,
    initialImages: [],
    initialMessages: [],
  });

  await mode.run();
}

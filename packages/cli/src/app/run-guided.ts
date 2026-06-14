import { InteractiveMode } from "@earendil-works/pi-coding-agent";
import pc from "picocolors";
import { createRepoChanRuntime, type RepoChanSessionMode } from "./pi-runtime.js";
import { printDiagnostics } from "./run-chat.js";

export const DEFAULT_GUIDED_INITIAL_MESSAGE = [
  "Inspect the current .repochan state with the repochan tool (action='protocol.inspect') and guide me through the next step of the RepoChan process.",
  "Do not auto-chain roles or write artifacts until I approve the specific next step.",
].join("\n");

export type RunGuidedOptions = {
  cwd?: string;
  agentDir?: string;
  newSession?: boolean;
  initialMessage?: string;
};

export function buildGuidedConductorNote(initialSession: RepoChanSessionMode) {
  return [
    `This is RepoChan CLI guided mode. Session policy: ${initialSession === "new" ? "start a new guided session" : "continue the latest guided session"}.`,
    "Begin with a protocol pre-flight using the `repochan` tool action='protocol.inspect'.",
    "After the pre-flight, recommend exactly one next role/action based on prerequisites and ask the user to confirm before any write or phase transition.",
  ].join("\n");
}

export async function createGuidedRuntime(options: RunGuidedOptions = {}) {
  const initialSession: RepoChanSessionMode = options.newSession ? "new" : "continue";
  return createRepoChanRuntime({
    cwd: options.cwd ?? process.cwd(),
    agentDir: options.agentDir,
    initialSession,
    initialConductorPrompt: buildGuidedConductorNote(initialSession),
  });
}

export async function runGuided(options: RunGuidedOptions = {}) {
  const result = await createGuidedRuntime(options);
  const availableModels = await result.modelRegistry.getAvailable();

  printDiagnostics(result.diagnostics);

  if (availableModels.length === 0) {
    console.error(pc.yellow("No configured Pi model was detected."));
    console.error(pc.dim("RepoChan guided mode will still open so you can use /login or /model from the normal Pi UI."));
  }

  const mode = new InteractiveMode(result.runtime, {
    modelFallbackMessage: result.diagnostics.modelFallbackMessage,
    initialMessage: options.initialMessage ?? DEFAULT_GUIDED_INITIAL_MESSAGE,
    initialImages: [],
    initialMessages: [],
  });

  await mode.run();
}

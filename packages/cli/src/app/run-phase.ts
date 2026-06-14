import { InteractiveMode } from "@earendil-works/pi-coding-agent";
import pc from "picocolors";
import { UsageError } from "../ui/errors.js";
import { createRepoChanRuntime, type RepoChanSessionMode } from "./pi-runtime.js";
import { printDiagnostics } from "./run-chat.js";

export const REPOCHAN_RUN_PHASES = ["analysis", "persona", "orders", "painter"] as const;

export type RepoChanRunPhase = (typeof REPOCHAN_RUN_PHASES)[number];

export type RunPhaseArgs = {
  phase: RepoChanRunPhase;
  goal?: string;
  orderId?: string;
  newSession: boolean;
};

export type RunPhaseOptions = RunPhaseArgs & {
  cwd?: string;
  agentDir?: string;
};

type ParseDefaults = {
  newSession?: boolean;
};

const PHASE_SKILLS: Record<RepoChanRunPhase, string> = {
  analysis: "repochan-analysis",
  persona: "repochan-persona",
  orders: "repochan-art-director",
  painter: "repochan-painter",
};

function isRunPhase(value: string | undefined): value is RepoChanRunPhase {
  return REPOCHAN_RUN_PHASES.includes(value as RepoChanRunPhase);
}

function readFlagValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new UsageError(`Missing value for ${flag}.`);
  }
  return value;
}

export function parseRunPhaseArgs(args: string[], defaults: ParseDefaults = {}): RunPhaseArgs {
  const [phaseArg, ...flags] = args;

  if (!isRunPhase(phaseArg)) {
    const suffix = phaseArg ? `Unknown run phase: ${phaseArg}` : "Missing run phase.";
    throw new UsageError(`${suffix} Expected one of: ${REPOCHAN_RUN_PHASES.join(", ")}.`);
  }

  let goal: string | undefined;
  let orderId: string | undefined;
  let newSession = defaults.newSession ?? false;

  for (let index = 0; index < flags.length; index += 1) {
    const arg = flags[index];

    if (arg === "--new") {
      newSession = true;
      continue;
    }

    if (arg === "--goal") {
      goal = readFlagValue(flags, index, "--goal");
      index += 1;
      continue;
    }

    if (arg.startsWith("--goal=")) {
      goal = arg.slice("--goal=".length);
      if (!goal) throw new UsageError("Missing value for --goal.");
      continue;
    }

    if (arg === "--order") {
      orderId = readFlagValue(flags, index, "--order");
      index += 1;
      continue;
    }

    if (arg.startsWith("--order=")) {
      orderId = arg.slice("--order=".length);
      if (!orderId) throw new UsageError("Missing value for --order.");
      continue;
    }

    if (arg.startsWith("--")) {
      throw new UsageError(`Unknown run flag: ${arg}`);
    }

    throw new UsageError(`Unexpected run argument: ${arg}`);
  }

  if (phaseArg === "orders" && !goal) {
    throw new UsageError("repochan run orders requires --goal <goal>.");
  }

  if (phaseArg !== "orders" && goal) {
    throw new UsageError("--goal is only valid with repochan run orders.");
  }

  if (phaseArg === "painter" && !orderId) {
    throw new UsageError("repochan run painter requires --order <order-id>.");
  }

  if (phaseArg !== "painter" && orderId) {
    throw new UsageError("--order is only valid with repochan run painter.");
  }

  return { phase: phaseArg, goal, orderId, newSession };
}

export function buildRunPhaseInitialMessage(args: RunPhaseArgs) {
  const lines = [
    `You are executing a single constrained phase: ${args.phase}. Use the matching RepoChan skill (${PHASE_SKILLS[args.phase]}). Use the repochan tool (action=...) for ALL .repochan writes and state changes. Respect preconditions strictly (e.g. analysis before persona, approved order before painter). Complete only this phase and stop when done. Ask user for approval before any overwrite or destructive step.`,
  ];

  if (args.phase === "analysis") {
    lines.push("For this phase, inspect state first and then perform only the analysis workflow, normally through repochan action='analysis.run'.");
  }

  if (args.phase === "persona") {
    lines.push("For this phase, verify analysis exists first, then perform only persona work and stop after persona persistence or the required approval question.");
  }

  if (args.phase === "orders") {
    lines.push(`Goal for this orders phase: ${args.goal}`);
    lines.push("Verify analysis and persona exist first. Create or revise only order artifacts for this goal; do not approve orders or begin painter work.");
  }

  if (args.phase === "painter") {
    lines.push(`Specific order id for this painter phase: ${args.orderId}`);
    lines.push("This order must be approved or in_progress before painter execution. Do not work on other orders and do not bypass approval unless the user explicitly approves an exception.");
  }

  return lines.join("\n");
}

export function buildRunPhaseConductorNote(args: RunPhaseArgs, initialSession: RepoChanSessionMode) {
  return [
    `This is RepoChan CLI single-phase mode for phase '${args.phase}'. Session policy: ${initialSession === "new" ? "start a new phase session" : "continue the latest RepoChan session"}.`,
    "Do not auto-chain into any other RepoChan phase. Keep the agent constrained to the requested phase and stop when it is complete or blocked.",
  ].join("\n");
}

export async function createRunPhaseRuntime(options: RunPhaseOptions) {
  const initialSession: RepoChanSessionMode = options.newSession ? "new" : "continue";
  return createRepoChanRuntime({
    cwd: options.cwd ?? process.cwd(),
    agentDir: options.agentDir,
    initialSession,
    initialConductorPrompt: buildRunPhaseConductorNote(options, initialSession),
  });
}

export async function runPhase(options: RunPhaseOptions) {
  const result = await createRunPhaseRuntime(options);

  printDiagnostics(result.diagnostics);

  if (result.diagnostics.availableModelCount === 0) {
    console.error(pc.yellow("No configured Pi model was detected."));
    console.error(pc.dim("RepoChan phase mode will still open so you can use /login or /model from the normal Pi UI."));
  }

  const mode = new InteractiveMode(result.runtime, {
    modelFallbackMessage: result.diagnostics.modelFallbackMessage,
    initialMessage: buildRunPhaseInitialMessage(options),
    initialImages: [],
    initialMessages: [],
  });

  await mode.run();
}

export async function runPhaseCommand(args: string[], options: { cwd?: string; newSession?: boolean } = {}) {
  const parsed = parseRunPhaseArgs(args, { newSession: options.newSession });
  await runPhase({ ...parsed, cwd: options.cwd });
}

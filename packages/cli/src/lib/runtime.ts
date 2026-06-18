import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  AuthStorage,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  initTheme,
  type AgentSessionRuntime,
  type AgentSessionRuntimeDiagnostic,
  type CreateAgentSessionRuntimeFactory,
  type ResourceDiagnostic,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";

export const OUR_AGENT_DIR = path.join(os.homedir(), ".repochan", "pi");

if (!fs.existsSync(OUR_AGENT_DIR)) {
  fs.mkdirSync(OUR_AGENT_DIR, { recursive: true });
}

export type RepoChanSessionMode = "new" | "continue" | "memory";
export type RepoChanPhase = "analysis" | "persona" | "orders" | "painter";

export type CreateRepoChanRuntimeOptions = {
  cwd?: string;
  agentDir?: string;
  initialSession?: RepoChanSessionMode;
  initialConductorPrompt?: string;
  appendConductorPrompt?: boolean;
};

export type RepoChanRuntimeDiagnostics = {
  runtime: readonly AgentSessionRuntimeDiagnostic[];
  resources: ResourceDiagnostic[];
  availableModelCount: number;
  modelFallbackMessage?: string;
};

export type RepoChanRuntimeResult = {
  runtime: AgentSessionRuntime;
  resources: ReturnType<typeof getRepoChanPiResources>;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  settingsManager: SettingsManager;
  diagnostics: RepoChanRuntimeDiagnostics;
};

export type RunPhaseArgs = {
  phase: RepoChanPhase;
  goal?: string;
  orderId?: string;
  newSession?: boolean;
};

function getRepoChanPiResources() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../../pi"),
    path.resolve(process.cwd(), "packages/pi"),
  ];
  const dir = candidates.find((candidate) => fs.existsSync(path.join(candidate, "resources.js"))) ?? candidates[0];
  return {
    extensionPath: path.join(dir, "extensions", "repochan.ts"),
    skillsPath: path.join(dir, "skills"),
  };
}

const PHASE_SKILLS: Record<RepoChanPhase, string> = {
  analysis: "repochan-analysis",
  persona: "repochan-persona",
  orders: "repochan-art-director",
  painter: "repochan-painter",
};

let cachedSetupRuntime: any = null;
let setupRuntimePromise: Promise<any> | null = null;

export async function getRepoChanRuntime(cwd: string = process.cwd()) {
  if (cachedSetupRuntime) return cachedSetupRuntime;
  if (setupRuntimePromise) return setupRuntimePromise;

  setupRuntimePromise = (async () => {
    const authStorage = AuthStorage.create(path.join(OUR_AGENT_DIR, "auth.json"));
    const modelRegistry = ModelRegistry.create(authStorage, path.join(OUR_AGENT_DIR, "models.json"));
    const settingsManager = SettingsManager.create(cwd, OUR_AGENT_DIR);

    initTheme(settingsManager.getTheme(), true);

    cachedSetupRuntime = { authStorage, modelRegistry, settingsManager };
    return cachedSetupRuntime;
  })();

  return setupRuntimePromise;
}

export function clearRuntimeCache() {
  cachedSetupRuntime = null;
  setupRuntimePromise = null;
}

function createSessionManager(cwd: string, mode: RepoChanSessionMode) {
  if (mode === "memory") return SessionManager.inMemory(cwd);
  if (mode === "continue") return SessionManager.continueRecent(cwd);
  return SessionManager.create(cwd);
}

function collectResourceDiagnostics(resourceLoader: ResourceLoader) {
  return [
    ...resourceLoader.getSkills().diagnostics,
    ...resourceLoader.getPrompts().diagnostics,
    ...resourceLoader.getThemes().diagnostics,
    ...resourceLoader.getExtensions().errors.map((error) => ({
      type: "error" as const,
      message: `Failed to load extension ${error.path}: ${error.error}`,
      path: error.path,
    })),
  ];
}

export function buildRepoChanConductorPrompt(initialPrompt?: string) {
  return [
    "## RepoChan CLI conductor",
    "- You are the coordinator for a manual, user-controlled RepoChan workflow. Do not auto-chain Analyst → Persona → Art Director → Painter.",
    "- Always begin by inspecting .repochan protocol state with the `repochan` tool action='protocol.inspect' before choosing or suggesting the next step.",
    "- Use the loaded RepoChan skills for role-specific work: repochan-analysis, repochan-persona, repochan-art-director, and repochan-painter.",
    "- Use the `repochan` tool for all .repochan protocol reads and writes during agent workflows; do not hand-edit protocol artifacts unless the user explicitly asks for protocol maintenance/migration.",
    "- Recommend the next role only after prerequisite checks: analysis before persona, analysis + persona before orders, approved/in_progress orders before painter execution.",
    "- Treat overwrites, destructive changes, status changes, allowUnapprovedOrder=true, and changing current asset versions as approval-gated.",
    "- Keep each turn focused and stop when the requested phase is complete or blocked.",
    initialPrompt ? `\nInitial user/conductor note:\n${initialPrompt}` : undefined,
  ].filter(Boolean).join("\n");
}

export function buildRunPhaseInitialMessage(args: RunPhaseArgs) {
  const lines = [
    `You are executing a single constrained phase: ${args.phase}. Use the matching RepoChan skill (${PHASE_SKILLS[args.phase]}). Use the repochan tool (action=...) for ALL .repochan writes and state changes. Respect preconditions strictly. Complete only this phase and stop when done. Ask user for approval before any overwrite or destructive step.`,
  ];

  if (args.phase === "analysis") {
    lines.push("For this phase, inspect state first and then perform only the analysis workflow, normally through repochan action='analysis.run'.");
  } else if (args.phase === "persona") {
    lines.push("For this phase, verify analysis exists first, then perform only persona work and stop after persona persistence or the required approval question.");
  } else if (args.phase === "orders") {
    lines.push(`Goal for this orders phase: ${args.goal || "Create the next useful RepoChan asset orders for this repository."}`);
    lines.push("Verify analysis and persona exist first. Create or revise only order artifacts; do not approve orders or begin painter work.");
  } else if (args.phase === "painter") {
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

export async function createRepoChanRuntime(options: CreateRepoChanRuntimeOptions = {}): Promise<RepoChanRuntimeResult> {
  const cwd = options.cwd ?? process.cwd();
  const agentDir = options.agentDir ?? OUR_AGENT_DIR;
  const resources = getRepoChanPiResources();
  const authStorage = AuthStorage.create(path.join(agentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(agentDir, "models.json"));
  const settingsManager = SettingsManager.create(cwd, agentDir);
  const appendSystemPrompt = options.appendConductorPrompt === false ? [] : [buildRepoChanConductorPrompt(options.initialConductorPrompt)];

  initTheme(settingsManager.getTheme(), true);

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd: runtimeCwd, agentDir: runtimeAgentDir, sessionManager, sessionStartEvent }) => {
    const services = await createAgentSessionServices({
      cwd: runtimeCwd,
      agentDir: runtimeAgentDir,
      authStorage,
      modelRegistry,
      settingsManager,
      resourceLoaderOptions: {
        additionalExtensionPaths: [resources.extensionPath],
        additionalSkillPaths: [resources.skillsPath],
        appendSystemPrompt,
      },
    });

    return {
      ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
      services,
      diagnostics: services.diagnostics,
    };
  };

  const availableModels = await modelRegistry.getAvailable();
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir,
    sessionManager: createSessionManager(cwd, options.initialSession ?? "new"),
  });

  return {
    runtime,
    resources,
    authStorage,
    modelRegistry,
    settingsManager,
    diagnostics: {
      runtime: runtime.diagnostics,
      resources: collectResourceDiagnostics(runtime.services.resourceLoader),
      availableModelCount: availableModels.length,
      modelFallbackMessage: runtime.modelFallbackMessage,
    },
  };
}

export async function createRunPhaseRuntime(options: RunPhaseArgs & { cwd?: string; agentDir?: string }) {
  const initialSession: RepoChanSessionMode = options.newSession ? "new" : "continue";
  return createRepoChanRuntime({
    cwd: options.cwd ?? process.cwd(),
    agentDir: options.agentDir,
    initialSession,
    initialConductorPrompt: buildRunPhaseConductorNote(options, initialSession),
  });
}

export type RunningRoleSession = {
  runtimeResult: RepoChanRuntimeResult;
  session: any;
  done: Promise<void>;
  abort: () => Promise<void>;
};

export async function startRoleSession(args: RunPhaseArgs & { cwd?: string; onDone?: () => void; onError?: (error: unknown) => void }): Promise<RunningRoleSession> {
  const runtimeResult = await createRunPhaseRuntime({ ...args, cwd: args.cwd ?? process.cwd(), newSession: args.newSession ?? true });
  const session = runtimeResult.runtime.session;
  const done = session.prompt(buildRunPhaseInitialMessage(args)).then(
    () => { args.onDone?.(); },
    (error: unknown) => { args.onError?.(error); throw error; },
  );
  return {
    runtimeResult,
    session,
    done,
    abort: async () => {
      if (typeof session.abort === "function") await session.abort();
      await runtimeResult.runtime.dispose();
    },
  };
}

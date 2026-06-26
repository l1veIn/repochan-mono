import path from "node:path";
import os from "node:os";
import type { TUI } from "@earendil-works/pi-tui";

import {
  AuthStorage,
  InteractiveMode,
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
  type SessionInfo,
} from "@earendil-works/pi-coding-agent";
import { createRepoChanExtensionUIContext } from "./extension-ui.js";

export const OUR_AGENT_DIR = path.join(os.homedir(), ".repochan", "pi");
export const OUR_SESSION_DIR = path.join(OUR_AGENT_DIR, "sessions");

export type RepoChanSessionMode = "new" | "continue" | "memory" | { kind: "open"; path: string };
export type RepoChanPhase = "analysis" | "interview" | "persona" | "orders" | "painter";

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

// Each role is driven by its Pi skill via the /skill: command, which Pi expands
// to the full skill content (same path as a user typing /skill:xxx in the TUI).
// Only painter needs a runtime argument (which order to execute); the other
// roles are fully self-describing once their skill is activated.
const PHASE_SKILL_COMMANDS: Record<RepoChanPhase, string> = {
  analysis: "/skill:repochan-analysis",
  interview: "/skill:repochan-interviewer",
  persona: "/skill:repochan-persona",
  orders: "/skill:repochan-art-director",
  painter: "/skill:repochan-painter",
};

export function buildSkillPrompt(phase: RepoChanPhase, opts?: { orderId?: string; goal?: string }): string {
  const cmd = PHASE_SKILL_COMMANDS[phase];
  const base = phase === "painter" && opts?.orderId ? `${cmd} execute order ${opts.orderId}` : cmd;
  return opts?.goal ? `${base}\n\nCLI request:\n${opts.goal}` : base;
}

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
  if (typeof mode === "object" && mode.kind === "open") return SessionManager.open(mode.path, OUR_SESSION_DIR, cwd);
  if (mode === "memory") return SessionManager.inMemory(cwd);
  if (mode === "continue") return SessionManager.continueRecent(cwd, OUR_SESSION_DIR);
  return SessionManager.create(cwd, OUR_SESSION_DIR);
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
    "- Treat overwrites, destructive changes, status changes, allowUnapprovedOrder=true, and changing current order result versions as approval-gated.",
    "- Keep each turn focused and stop when the requested phase is complete or blocked.",
    initialPrompt ? `\nInitial user/conductor note:\n${initialPrompt}` : undefined,
  ].filter(Boolean).join("\n");
}


export async function createRepoChanRuntime(options: CreateRepoChanRuntimeOptions = {}): Promise<RepoChanRuntimeResult> {
  const cwd = options.cwd ?? process.cwd();
  const agentDir = options.agentDir ?? OUR_AGENT_DIR;
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
      // No additionalExtensionPaths / additionalSkillPaths — Pi auto-discovers
      // all resources from settings.json (written by `repochan setup`).
      // This loads both repochan-pi and image-gen-pi transparently.
      resourceLoaderOptions: {
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
  const sessionModeNote = initialSession === "new"
    ? "Start a new phase session."
    : "Continue the latest RepoChan session.";
  const phaseNote = [
    `RepoChan CLI single-phase mode for phase '${options.phase}'. ${sessionModeNote}`,
    "This is a task execution run, not an open-ended chat.",
    "Do not ask optional clarification questions. Optional preferences, style direction, naming taste, and creative constraints are not blockers.",
    "If hard preconditions are satisfied, use your judgment for unspecified choices, complete this phase, and save the expected RepoChan artifact or order/result through the repochan tool.",
    "Stop only when the requested phase is complete or blocked by a hard precondition such as a missing required upstream artifact, unavailable tool, invalid order, or required explicit overwrite/destructive approval.",
    "Do not auto-chain into any other phase.",
  ].join("\n");
  return createRepoChanRuntime({
    cwd: options.cwd ?? process.cwd(),
    agentDir: options.agentDir,
    initialSession,
    initialConductorPrompt: phaseNote,
  });
}

export function listRepoChanSessions(cwd: string = process.cwd()): Promise<SessionInfo[]> {
  return SessionManager.list(cwd, OUR_SESSION_DIR);
}

export async function runRepoChanInteractive(options: {
  cwd?: string;
  initialSession?: RepoChanSessionMode;
  initialMessage?: string;
} = {}) {
  const runtimeResult = await createRepoChanRuntime({
    cwd: options.cwd ?? process.cwd(),
    initialSession: options.initialSession ?? "continue",
    initialConductorPrompt: "RepoChan CLI chat mode. The user is interacting directly; help with RepoChan workflow and repository artifact maintenance.",
  });
  const interactive = new InteractiveMode(runtimeResult.runtime, {
    modelFallbackMessage: runtimeResult.diagnostics.modelFallbackMessage,
    initialMessage: options.initialMessage,
  });
  await interactive.run();
}

export type RunningRoleSession = {
  runtimeResult: RepoChanRuntimeResult;
  session: any;
  sessionFile?: string;
  sessionId?: string;
  done: Promise<void>;
  abort: () => Promise<void>;
};

export function formatSessionSavedMessage(session?: Pick<RunningRoleSession, "sessionFile" | "sessionId"> | null) {
  if (!session?.sessionFile && !session?.sessionId) return "Session saved. Open it with `repochan sessions`.";
  const id = session.sessionId ? ` (${session.sessionId.slice(0, 8)})` : "";
  const file = session.sessionFile ? `: ${session.sessionFile}` : "";
  return `Session saved${id}. Open it with \`repochan sessions\`${file}`;
}

export async function startRoleSession(args: RunPhaseArgs & { cwd?: string; onDone?: () => void; onError?: (error: unknown) => void }): Promise<RunningRoleSession> {
  const runtimeResult = await createRunPhaseRuntime({ ...args, cwd: args.cwd ?? process.cwd(), newSession: args.newSession ?? true });
  const session = runtimeResult.runtime.session;
  const done = session.prompt(buildSkillPrompt(args.phase, { orderId: args.orderId, goal: args.goal })).then(
    () => { args.onDone?.(); },
    (error: unknown) => { args.onError?.(error); throw error; },
  );
  return {
    runtimeResult,
    session,
    sessionFile: session.sessionFile,
    sessionId: session.sessionId,
    done,
    abort: async () => {
      if (typeof session.abort === "function") await session.abort();
      await runtimeResult.runtime.dispose();
    },
  };
}

export async function startRoleSessionWithUi(args: RunPhaseArgs & { cwd?: string; tui: TUI; onDone?: () => void; onError?: (error: unknown) => void }): Promise<RunningRoleSession> {
  const runtimeResult = await createRunPhaseRuntime({ ...args, cwd: args.cwd ?? process.cwd(), newSession: args.newSession ?? true });
  const session = runtimeResult.runtime.session;
  await session.bindExtensions({
    uiContext: createRepoChanExtensionUIContext(args.tui),
    mode: "tui",
  });
  const done = session.prompt(buildSkillPrompt(args.phase, { orderId: args.orderId, goal: args.goal })).then(
    () => { args.onDone?.(); },
    (error: unknown) => { args.onError?.(error); throw error; },
  );
  return {
    runtimeResult,
    session,
    sessionFile: session.sessionFile,
    sessionId: session.sessionId,
    done,
    abort: async () => {
      if (typeof session.abort === "function") await session.abort();
      await runtimeResult.runtime.dispose();
    },
  };
}

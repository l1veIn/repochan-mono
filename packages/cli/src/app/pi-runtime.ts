import path from "node:path";

import {
  AuthStorage,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSessionRuntime,
  type AgentSessionRuntimeDiagnostic,
  type CreateAgentSessionRuntimeFactory,
  type ResourceDiagnostic,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { buildRepoChanConductorPrompt } from "./conductor.js";
import { getRepoChanCliResources, type RepoChanCliResources } from "../resources.js";

export type RepoChanSessionMode = "new" | "continue" | "memory";

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
  resources: RepoChanCliResources;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  settingsManager: SettingsManager;
  diagnostics: RepoChanRuntimeDiagnostics;
};

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

export async function createRepoChanRuntime(options: CreateRepoChanRuntimeOptions = {}): Promise<RepoChanRuntimeResult> {
  const cwd = options.cwd ?? process.cwd();
  const agentDir = options.agentDir ?? getAgentDir();
  const resources = getRepoChanCliResources();
  const authStorage = AuthStorage.create(path.join(agentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(agentDir, "models.json"));
  const settingsManager = SettingsManager.create(cwd, agentDir);
  const appendSystemPrompt =
    options.appendConductorPrompt === false
      ? []
      : [buildRepoChanConductorPrompt(options.initialConductorPrompt)];

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd: runtimeCwd,
    agentDir: runtimeAgentDir,
    sessionManager,
    sessionStartEvent,
  }) => {
    const services = await createAgentSessionServices({
      cwd: runtimeCwd,
      agentDir: runtimeAgentDir,
      authStorage,
      modelRegistry,
      settingsManager,
      // createAgentSessionServices instantiates DefaultResourceLoader with these RepoChan paths,
      // preserving normal Pi discovery while adding the canonical repochan-pi extension/skills.
      resourceLoaderOptions: {
        additionalExtensionPaths: resources.additionalExtensionPaths,
        additionalSkillPaths: resources.additionalSkillPaths,
        appendSystemPrompt,
      },
    });

    return {
      ...(await createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
      })),
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

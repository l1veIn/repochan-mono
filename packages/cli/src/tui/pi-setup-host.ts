import path from "node:path";

import {
  ExtensionSelectorComponent,
  initTheme,
  LoginDialogComponent,
  ModelSelectorComponent,
  OAuthSelectorComponent,
  type ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, ProcessTerminal, TUI, truncateToWidth, type Component } from "@earendil-works/pi-tui";

import { createRepoChanRuntime, type RepoChanRuntimeResult } from "../app/pi-runtime.js";
import { createCliTheme } from "./theme.js";
import { messageFromError } from "./utils.js";

export type PiSetupMode = "login" | "model" | "settings";

export type AuthSelectorProvider = {
  id: string;
  name: string;
  authType: "oauth" | "api_key";
};

const SUBSCRIPTION_LABEL = "Use a subscription";
const API_KEY_LABEL = "Use an API key";
const BEDROCK_PROVIDER_ID = "amazon-bedrock";

const BUILT_IN_API_KEY_PROVIDERS = new Set([
  "anthropic",
  "amazon-bedrock",
  "ant-ling",
  "azure-openai-responses",
  "cerebras",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
  "deepseek",
  "fireworks",
  "google",
  "google-vertex",
  "groq",
  "huggingface",
  "kimi-coding",
  "mistral",
  "minimax",
  "minimax-cn",
  "moonshotai",
  "moonshotai-cn",
  "nvidia",
  "opencode",
  "opencode-go",
  "openai",
  "openrouter",
  "together",
  "vercel-ai-gateway",
  "xai",
  "zai",
  "zai-coding-cn",
  "xiaomi",
  "xiaomi-token-plan-cn",
  "xiaomi-token-plan-ams",
  "xiaomi-token-plan-sgp",
]);

export function getLoginProviderOptions(modelRegistry: ModelRegistry, authType?: "oauth" | "api_key"): AuthSelectorProvider[] {
  const authStorage = modelRegistry.authStorage;
  const oauthProviders = authStorage.getOAuthProviders();
  const oauthProviderIds = new Set(oauthProviders.map((provider) => provider.id));
  const options: AuthSelectorProvider[] = oauthProviders.map((provider) => ({
    id: provider.id,
    name: provider.name,
    authType: "oauth",
  }));

  const modelProviders = new Set(modelRegistry.getAll().map((model) => model.provider));
  for (const providerId of modelProviders) {
    if (!isApiKeyLoginProvider(providerId, oauthProviderIds)) continue;
    options.push({
      id: providerId,
      name: modelRegistry.getProviderDisplayName(providerId),
      authType: "api_key",
    });
  }

  return options
    .filter((option) => !authType || option.authType === authType)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isApiKeyLoginProvider(providerId: string, oauthProviderIds: ReadonlySet<string>) {
  if (BUILT_IN_API_KEY_PROVIDERS.has(providerId)) return true;
  return !oauthProviderIds.has(providerId);
}

export async function saveApiKeyLogin(modelRegistry: ModelRegistry, providerId: string, apiKey: string) {
  const key = apiKey.trim();
  if (!key) throw new Error("API key cannot be empty.");
  modelRegistry.authStorage.set(providerId, { type: "api_key", key });
  modelRegistry.refresh();
}

export function hasAvailableModels(modelRegistry: ModelRegistry) {
  return modelRegistry.getAvailable().length > 0;
}

type HostServices = {
  runtime: RepoChanRuntimeResult;
  tui: TUI;
  finish: () => void;
  setComponent: (component: Component) => void;
};

class ResultScreen implements Component {
  constructor(
    private readonly opts: {
      title: string;
      lines: string[];
      finish: () => void;
      isError?: boolean;
    },
  ) {}

  invalidate(): void {}

  handleInput(data: string): void {
    if (data === "\r" || data === "\n" || data === "q" || data === "Q" || matchesKey(data, Key.escape)) {
      this.opts.finish();
    }
  }

  render(width: number): string[] {
    const theme = createCliTheme();
    const color = this.opts.isError ? "error" : "accent";
    return [
      theme.fg(color, theme.bold(this.opts.title)),
      "",
      ...this.opts.lines,
      "",
      theme.fg("dim", "enter / q / esc  close"),
    ].map((line) => truncateToWidth(line, width, "..."));
  }
}

class SettingsLauncher implements Component {
  private selector: ExtensionSelectorComponent;

  constructor(private readonly services: HostServices) {
    this.selector = new ExtensionSelectorComponent(
      "RepoChan settings:",
      ["Login"],
      () => showLoginAuthTypeSelector(services),
      () => services.finish(),
    );
  }

  invalidate(): void {
    this.selector.invalidate();
  }

  handleInput(data: string): void {
    this.selector.handleInput(data);
  }

  render(width: number): string[] {
    return this.selector.render(width);
  }
}

export async function launchPiSetupTui(options: { cwd?: string; mode: PiSetupMode }) {
  const cwd = options.cwd ?? process.cwd();
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);
  let done = false;
  let runtime: RepoChanRuntimeResult | undefined;

  const finish = () => {
    if (done) return;
    done = true;
    tui.stop();
  };

  const setComponent = (component: Component) => {
    tui.clear();
    tui.addChild(component);
    tui.setFocus(component);
    tui.requestRender(true);
  };

  const showFatal = (error: unknown) => {
    setComponent(new ResultScreen({
      title: "RepoChan Pi setup error",
      lines: [messageFromError(error)],
      finish,
      isError: true,
    }));
  };

  tui.start();
  terminal.setTitle(`RepoChan · ${options.mode}`);

  try {
    runtime = await createRepoChanRuntime({ cwd, initialSession: "memory", appendConductorPrompt: false });
    initTheme(runtime.settingsManager.getTheme(), true);
    const services = { runtime, tui, finish, setComponent };

    if (options.mode === "login") showLoginAuthTypeSelector(services);
    else if (options.mode === "model") showModelSelector(services);
    else setComponent(new SettingsLauncher(services));

    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (done) {
          clearInterval(timer);
          resolve();
        }
      }, 40);
    });
  } catch (error) {
    showFatal(error);
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (done) {
          clearInterval(timer);
          resolve();
        }
      }, 40);
    });
  } finally {
    await runtime?.runtime.dispose();
    try {
      await terminal.drainInput(120, 20);
    } catch {
      // Best-effort terminal cleanup.
    }
  }
}

function showLoginAuthTypeSelector(services: HostServices) {
  const selector = new ExtensionSelectorComponent(
    "Select authentication method:",
    [SUBSCRIPTION_LABEL, API_KEY_LABEL],
    (option) => showLoginProviderSelector(services, option === SUBSCRIPTION_LABEL ? "oauth" : "api_key"),
    () => services.finish(),
  );
  services.setComponent(selector);
}

function showLoginProviderSelector(services: HostServices, authType: "oauth" | "api_key") {
  const modelRegistry = services.runtime.modelRegistry;
  const providerOptions = getLoginProviderOptions(modelRegistry, authType);

  if (providerOptions.length === 0) {
    services.setComponent(new ResultScreen({
      title: "No providers available",
      lines: [authType === "oauth" ? "No subscription providers are available." : "No API key providers are available."],
      finish: services.finish,
      isError: true,
    }));
    return;
  }

  const selector = new OAuthSelectorComponent(
    "login",
    modelRegistry.authStorage,
    providerOptions,
    (providerId) => {
      const provider = providerOptions.find((candidate) => candidate.id === providerId);
      if (!provider) return;
      if (provider.authType === "oauth") void showOAuthLoginDialog(services, provider);
      else if (provider.id === BEDROCK_PROVIDER_ID) showBedrockInfo(services, provider);
      else void showApiKeyLoginDialog(services, provider);
    },
    () => showLoginAuthTypeSelector(services),
    (providerId) => modelRegistry.getProviderAuthStatus(providerId),
  );
  services.setComponent(selector);
}

function showBedrockInfo(services: HostServices, provider: AuthSelectorProvider) {
  const dialog = new LoginDialogComponent(services.tui, provider.id, () => services.finish(), provider.name, "Amazon Bedrock setup");
  dialog.showInfo([
    "Amazon Bedrock uses AWS credentials instead of a single API key.",
    "Configure an AWS profile, IAM keys, bearer token, or role-based credentials.",
  ]);
  services.setComponent(dialog);
}

async function showApiKeyLoginDialog(services: HostServices, provider: AuthSelectorProvider) {
  const dialog = new LoginDialogComponent(services.tui, provider.id, () => {}, provider.name);
  services.setComponent(dialog);

  try {
    const apiKey = await dialog.showPrompt("Enter API key:");
    await saveApiKeyLogin(services.runtime.modelRegistry, provider.id, apiKey);
    services.setComponent(new ResultScreen({
      title: "Saved API key",
      lines: [`Saved API key for ${provider.name}.`, "Credentials are available to Pi and RepoChan."],
      finish: services.finish,
    }));
  } catch (error) {
    if (messageFromError(error) === "Login cancelled") {
      showLoginProviderSelector(services, provider.authType);
      return;
    }
    services.setComponent(new ResultScreen({
      title: "Failed to save API key",
      lines: [messageFromError(error)],
      finish: services.finish,
      isError: true,
    }));
  }
}

async function showOAuthLoginDialog(services: HostServices, provider: AuthSelectorProvider) {
  const dialog = new LoginDialogComponent(services.tui, provider.id, () => {}, provider.name);
  services.setComponent(dialog);

  const providerInfo = services.runtime.modelRegistry.authStorage
    .getOAuthProviders()
    .find((candidate) => candidate.id === provider.id);
  const usesCallbackServer = providerInfo?.usesCallbackServer ?? false;

  let manualCodeResolve: ((value: string) => void) | undefined;
  let manualCodeReject: ((error: Error) => void) | undefined;
  const manualCodePromise = new Promise<string>((resolve, reject) => {
    manualCodeResolve = resolve;
    manualCodeReject = reject;
  });

  try {
    await services.runtime.modelRegistry.authStorage.login(provider.id, {
      onAuth: (info: any) => {
        dialog.showAuth(info.url, info.instructions);
        if (!usesCallbackServer) return;
        dialog
          .showManualInput("Paste redirect URL below, or complete login in browser:")
          .then((value) => {
            if (value && manualCodeResolve) {
              manualCodeResolve(value);
              manualCodeResolve = undefined;
            }
          })
          .catch(() => {
            if (manualCodeReject) {
              manualCodeReject(new Error("Login cancelled"));
              manualCodeReject = undefined;
            }
          });
      },
      onDeviceCode: (info: any) => {
        dialog.showDeviceCode(info);
        dialog.showWaiting("Waiting for authentication...");
      },
      onPrompt: (prompt: any) => dialog.showPrompt(prompt.message, prompt.placeholder),
      onProgress: (message: string) => {
        dialog.showProgress(message);
      },
      onSelect: (prompt: any) => showOAuthPromptSelector(services, dialog, prompt),
      onManualCodeInput: () => manualCodePromise,
      signal: dialog.signal,
    });
    services.runtime.modelRegistry.refresh();
    services.setComponent(new ResultScreen({
      title: "Logged in",
      lines: [`Logged in to ${provider.name}.`, "Credentials are available to Pi and RepoChan."],
      finish: services.finish,
    }));
  } catch (error) {
    if (messageFromError(error) === "Login cancelled") {
      showLoginProviderSelector(services, provider.authType);
      return;
    }
    services.setComponent(new ResultScreen({
      title: `Failed to login to ${provider.name}`,
      lines: [messageFromError(error)],
      finish: services.finish,
      isError: true,
    }));
  }
}

function showOAuthPromptSelector(services: HostServices, dialog: LoginDialogComponent, prompt: any) {
  return new Promise<string | undefined>((resolve) => {
    const labels = prompt.options.map((option: any) => option.label);
    const selector = new ExtensionSelectorComponent(
      prompt.message,
      labels,
      (optionLabel) => {
        services.setComponent(dialog);
        resolve(prompt.options.find((option: any) => option.label === optionLabel)?.id);
      },
      () => {
        services.setComponent(dialog);
        resolve(undefined);
      },
    );
    services.setComponent(selector);
  });
}

function showModelSelector(services: HostServices) {
  const modelRegistry = services.runtime.modelRegistry;
  modelRegistry.refresh();

  if (!hasAvailableModels(modelRegistry)) {
    services.setComponent(new ResultScreen({
      title: "No models available",
      lines: ["Run `repochan login` first, then return to `repochan model`."],
      finish: services.finish,
      isError: true,
    }));
    return;
  }

  const selector = new ModelSelectorComponent(
    services.tui,
    services.runtime.runtime.session.model,
    services.runtime.settingsManager,
    modelRegistry,
    services.runtime.runtime.session.scopedModels,
    async (model) => {
      try {
        await services.runtime.runtime.session.setModel(model);
        services.setComponent(new ResultScreen({
          title: "Model selected",
          lines: [`Model: ${model.provider}/${model.id}`],
          finish: services.finish,
        }));
      } catch (error) {
        services.setComponent(new ResultScreen({
          title: "Failed to select model",
          lines: [messageFromError(error)],
          finish: services.finish,
          isError: true,
        }));
      }
    },
    () => services.finish(),
  );
  services.setComponent(selector);
}

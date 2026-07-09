import { input, password, select } from "@inquirer/prompts";
import {
  GLOBAL_CONFIG_PATH,
  hasConfiguredEndpoints,
  loadConfig,
  listEndpoints,
  saveGlobalConfig,
  type ImageGenConfig,
} from "@repochan/image-gen";
import { emitResult, type OutputOptions, UsageError, dim, heading, bullet } from "../lib/output.js";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-image-2";

export type ImageConfigureChoice = "openai" | "custom" | "skip";

export type ImageConfigureOptions = OutputOptions & {
  /**
   * Non-interactive: skip | openai | custom.
   * For openai/custom, pass --api-key (and --base-url for custom).
   */
  provider?: ImageConfigureChoice;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /**
   * When true (setup embedding): if already configured, do nothing quietly.
   * When false (standalone `image configure`): always offer to (re)configure.
   */
  onlyIfMissing?: boolean;
};

/**
 * Interactive / flag-driven image endpoint setup.
 * Writes ~/.repochan/image.json (global). Does not touch project .repochan/ protocol.
 * Does not run `repochan init` — protocol init stays with the agent / explicit init.
 */
export async function runImageConfigure(cwd: string, options: ImageConfigureOptions = {}) {
  if (options.onlyIfMissing && hasConfiguredEndpoints(cwd)) {
    if (!options.json) {
      const eps = listEndpoints(loadConfig(cwd));
      console.log(dim(`Image generation already configured (${eps.join(", ")}). Skipping.`));
    }
    return { action: "already-configured" as const };
  }

  if (options.provider) {
    return runNonInteractive(cwd, options);
  }

  if (!process.stdin.isTTY) {
    throw new UsageError(
      "No image provider flags and stdin is not a TTY.",
      "Usage: repochan image configure --provider openai --api-key sk-...\n" +
        "       repochan image configure --provider custom --base-url https://... --api-key ...\n" +
        "       repochan image configure --provider skip",
    );
  }

  return runInteractive(cwd, options);
}

/** Called from `repochan setup` after agent install. Never runs init. */
export async function maybeConfigureImageDuringSetup(
  cwd: string,
  options: { yes?: boolean; json?: boolean },
): Promise<void> {
  if (hasConfiguredEndpoints(cwd)) {
    if (!options.json) {
      const eps = listEndpoints(loadConfig(cwd));
      console.log();
      console.log(dim(`Image: already configured (${eps.join(", ")} → ${GLOBAL_CONFIG_PATH})`));
    }
    return;
  }

  if (options.yes || options.json) {
    // Non-interactive setup never blocks on keys.
    if (!options.json) {
      console.log();
      console.log(dim("Image: not configured (skipped in --yes mode)."));
      console.log(dim("  Later: repochan image configure"));
    }
    return;
  }

  if (!process.stdin.isTTY) {
    if (!options.json) {
      console.log();
      console.log(dim("Image: not configured. Run `repochan image configure` when ready."));
    }
    return;
  }

  console.log();
  heading("Image generation");
  console.log(dim("Needed for mascot / foundation art. You can skip and configure later."));
  await runImageConfigure(cwd, { onlyIfMissing: true });
}

async function runInteractive(cwd: string, options: OutputOptions) {
  const choice = await select<ImageConfigureChoice>({
    message: "Image generation endpoint",
    choices: [
      {
        name: "OpenAI (official API)",
        value: "openai",
        description: "api.openai.com — just paste your API key",
      },
      {
        name: "Custom OpenAI-compatible",
        value: "custom",
        description: "Relay / reverse-proxy — base URL + API key",
      },
      {
        name: "Skip for now",
        value: "skip",
        description: "Configure later with `repochan image configure`",
      },
    ],
  });

  if (choice === "skip") {
    return void emitResult(
      options,
      "Skipped image configuration. Run `repochan image configure` when you need generation.",
      { action: "skipped" },
    );
  }

  if (choice === "openai") {
    const apiKey = await password({
      message: "OpenAI API key",
      mask: "*",
      validate: (v) => (v.trim() ? true : "API key is required"),
    });
    const saved = writeEndpoint({
      id: "openai",
      baseURL: OPENAI_BASE_URL,
      apiKey: apiKey.trim(),
      model: DEFAULT_MODEL,
    });
    return reportSaved(options, saved);
  }

  const baseURL = await input({
    message: "Base URL (OpenAI-compatible, e.g. https://relay.example/v1)",
    validate: (v) => {
      const t = v.trim();
      if (!t) return "Base URL is required";
      if (!/^https?:\/\//i.test(t)) return "URL should start with http:// or https://";
      return true;
    },
  });
  const apiKey = await password({
    message: "API key",
    mask: "*",
    validate: (v) => (v.trim() ? true : "API key is required"),
  });
  const model = await input({
    message: "Model id",
    default: DEFAULT_MODEL,
  });
  const saved = writeEndpoint({
    id: "custom",
    baseURL: baseURL.trim().replace(/\/$/, ""),
    apiKey: apiKey.trim(),
    model: (model || DEFAULT_MODEL).trim(),
  });
  return reportSaved(options, saved);
}

async function runNonInteractive(cwd: string, options: ImageConfigureOptions) {
  void cwd;
  const provider = options.provider;
  if (!provider) throw new UsageError("Missing --provider openai|custom|skip");

  if (provider === "skip") {
    return void emitResult(options, "Skipped image configuration.", { action: "skipped" });
  }

  if (provider === "openai") {
    const apiKey = options.apiKey?.trim() || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new UsageError(
        "OpenAI configure needs an API key.",
        "Pass --api-key sk-... or set OPENAI_API_KEY.",
      );
    }
    const saved = writeEndpoint({
      id: "openai",
      baseURL: OPENAI_BASE_URL,
      apiKey,
      model: options.model?.trim() || DEFAULT_MODEL,
    });
    return reportSaved(options, saved);
  }

  const baseURL = options.baseUrl?.trim();
  const apiKey = options.apiKey?.trim();
  if (!baseURL || !apiKey) {
    throw new UsageError(
      "Custom configure needs --base-url and --api-key.",
      "Example: repochan image configure --provider custom --base-url https://relay.example/v1 --api-key ...",
    );
  }
  const saved = writeEndpoint({
    id: "custom",
    baseURL: baseURL.replace(/\/$/, ""),
    apiKey,
    model: options.model?.trim() || DEFAULT_MODEL,
  });
  return reportSaved(options, saved);
}

function writeEndpoint(ep: {
  id: string;
  baseURL: string;
  apiKey: string;
  model: string;
}): { path: string; endpoint: string; baseURL: string; model: string } {
  const patch: ImageGenConfig = {
    defaultEndpoint: ep.id,
    endpoints: {
      [ep.id]: {
        id: ep.id,
        baseURL: ep.baseURL,
        apiKey: ep.apiKey,
        model: ep.model,
      },
    },
  };
  saveGlobalConfig(patch);
  return { path: GLOBAL_CONFIG_PATH, endpoint: ep.id, baseURL: ep.baseURL, model: ep.model };
}

function reportSaved(
  options: OutputOptions,
  saved: { path: string; endpoint: string; baseURL: string; model: string },
) {
  if (options.json) {
    return void emitResult(options, "", { action: "configured", ...saved });
  }
  heading("Image generation configured");
  bullet("endpoint", saved.endpoint);
  bullet("baseURL", saved.baseURL);
  bullet("model", saved.model);
  bullet("config", saved.path);
  console.log(dim('\nTry: repochan image gen --prompt "a chibi mascot" --out /tmp/test.png'));
  return { action: "configured" as const, ...saved };
}

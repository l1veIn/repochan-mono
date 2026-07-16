import { input, password, select, confirm } from "@inquirer/prompts";
import {
  GLOBAL_CONFIG_PATH,
  hasConfiguredEndpoints,
  loadConfig,
  listEndpoints,
  listEndpointStatuses,
  saveGlobalConfig,
  normalizeImageRequestMode,
  probeEndpoint,
  loadCodexAuth,
  type ImageGenConfig,
  type ImageRequestMode,
  type EndpointAuth,
} from "@repochan/image-gen";
import { emitResult, type OutputOptions, UsageError, dim, heading, bullet } from "../lib/output.js";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const DEFAULT_MODEL = "gpt-image-2";

export type ImageConfigureChoice = "openai" | "codex" | "custom" | "skip";

export type ImageConfigureOptions = OutputOptions & {
  /**
   * Non-interactive: skip | openai | custom.
   * For openai/custom, pass --api-key (and --base-url for custom).
   * Advanced: --mode auto|openai|openai-async (default auto).
   */
  provider?: ImageConfigureChoice;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  endpointId?: string;
  mode?: string;
  setDefault?: boolean;
  probe?: boolean;
  /**
   * When true (setup embedding): if already configured, do nothing quietly.
   * When false (standalone `image configure`): always offer to (re)configure.
   */
  onlyIfMissing?: boolean;
};

/** Derive a stable endpoint id from baseURL (no user prompt). */
function deriveEndpointId(baseURL: string, fallback: string): string {
  try {
    const u = new URL(baseURL);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      const port = u.port || (u.protocol === "https:" ? "443" : "80");
      const base = host === "localhost" ? "localhost" : host.replace(/\./g, "-");
      return `${base}-${port}`.slice(0, 40);
    }
    // Drop public suffix-ish last label: img-cn.65535.space → img-cn-65535
    const parts = host.split(".");
    const core = parts.length > 1 ? parts.slice(0, -1).join("-") : host;
    let slug = core
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (slug.length < 2) {
      slug = host.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-");
    }
    return (slug || fallback).slice(0, 40);
  } catch {
    return fallback;
  }
}

/** Avoid clobbering a different endpoint that already uses the same id. */
function uniqueEndpointId(cwd: string, baseId: string, baseURL: string): string {
  const config = loadConfig(cwd);
  const existing = config.endpoints ?? {};
  const normalizedUrl = baseURL.replace(/\/$/, "");
  // Same URL already registered under this id → reuse
  if (existing[baseId]?.baseURL?.replace(/\/$/, "") === normalizedUrl) return baseId;
  if (!existing[baseId]) return baseId;
  for (let i = 2; i < 100; i++) {
    const id = `${baseId}-${i}`;
    if (!existing[id] || existing[id].baseURL?.replace(/\/$/, "") === normalizedUrl) return id;
  }
  return `${baseId}-${Date.now()}`;
}

/**
 * Interactive / flag-driven image endpoint setup.
 * Writes ~/.repochan/image.json (global). Does not touch project .repochan/ protocol.
 * Default mode is auto — users do not need to know sync vs async.
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
        "       repochan image configure --provider codex   (uses `codex login`)\n" +
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
  console.log(dim("Just add an OpenAI-compatible base URL + key — mode defaults to auto."));
  await runImageConfigure(cwd, { onlyIfMissing: true });
}

/**
 * Configure the Codex (ChatGPT-login) endpoint. Verifies ~/.codex/auth.json is
 * readable and derives a chatgpt_account_id before writing the endpoint — this
 * fails fast with a friendly "run codex login" message instead of at gen time.
 */
async function configureCodex(
  cwd: string,
  options: OutputOptions & {
    probe?: boolean;
    setDefault?: boolean;
    endpointId?: string;
    model?: string;
    mode?: string;
  },
) {
  const loaded = loadCodexAuth();
  if (!loaded.ok) {
    throw new UsageError(
      `Codex auth unavailable: ${loaded.detail}`,
      "Run `codex login` first, then re-run `repochan image configure --provider codex`. " +
        "(image-gen reads ~/.codex/auth.json — it never runs its own OAuth login.)",
    );
  }
  const id = options.endpointId?.trim() || "codex";
  const saved = writeEndpoint(cwd, {
    id,
    baseURL: CODEX_BASE_URL,
    apiKey: "",
    model: (options.model?.trim() || DEFAULT_MODEL),
    mode: "auto",
    auth: { kind: "codex" },
    setDefault: options.setDefault !== false,
  });
  if (!options.json) {
    console.log(dim(`Codex account: ${loaded.tokens.account_id}`));
  }
  return finishSaved(cwd, options, saved);
}

async function runInteractive(cwd: string, options: OutputOptions & { probe?: boolean }) {
  const choice = await select<ImageConfigureChoice>({
    message: "Image generation endpoint",
    choices: [
      {
        name: "OpenAI (official API)",
        value: "openai",
        description: "api.openai.com — paste your API key",
      },
      {
        name: "Codex (ChatGPT login)",
        value: "codex",
        description: "Reuse `codex login` — OAuth token, gpt-image-2 via /responses",
      },
      {
        name: "Custom OpenAI-compatible",
        value: "custom",
        description: "Relay / reverse-proxy — base URL + key (auto mode)",
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

  if (choice === "codex") {
    return configureCodex(cwd, options);
  }

  if (choice === "openai") {
    const apiKey = await password({
      message: "OpenAI API key",
      mask: "*",
      validate: (v) => (v.trim() ? true : "API key is required"),
    });
    const saved = writeEndpoint(cwd, {
      id: "openai",
      baseURL: OPENAI_BASE_URL,
      apiKey: apiKey.trim(),
      model: DEFAULT_MODEL,
      mode: "auto",
      setDefault: true,
    });
    return finishSaved(cwd, options, saved);
  }

  const baseURLRaw = await input({
    message: "Base URL (e.g. https://api.openai.com/v1 or http://127.0.0.1:8787/v1)",
    validate: (v) => {
      const t = v.trim();
      if (!t) return "Base URL is required";
      if (!/^https?:\/\//i.test(t)) return "URL should start with http:// or https://";
      return true;
    },
  });
  const baseURL = baseURLRaw.trim().replace(/\/$/, "");
  const endpointId = uniqueEndpointId(cwd, deriveEndpointId(baseURL, "custom"), baseURL);
  const apiKey = await password({
    message: "API key",
    mask: "*",
    validate: (v) => (v.trim() ? true : "API key is required"),
  });
  const model = await input({
    message: "Model id",
    default: DEFAULT_MODEL,
  });
  const existing = listEndpoints(loadConfig(cwd));
  let setDefault = existing.length === 0;
  if (existing.length > 0 && !existing.includes(endpointId)) {
    setDefault = await confirm({
      message: `Set this endpoint as default? (${endpointId})`,
      default: true,
    });
  } else if (existing.includes(endpointId)) {
    // Updating existing entry: keep as default if it already is, else ask only when not sole endpoint
    const cfg = loadConfig(cwd);
    setDefault = cfg.defaultEndpoint === endpointId || existing.length === 1;
    if (!setDefault && existing.length > 1) {
      setDefault = await confirm({
        message: `Set this endpoint as default? (${endpointId})`,
        default: true,
      });
    }
  }

  const saved = writeEndpoint(cwd, {
    id: endpointId,
    baseURL,
    apiKey: apiKey.trim(),
    model: (model || DEFAULT_MODEL).trim(),
    mode: "auto",
    setDefault,
  });
  return finishSaved(cwd, options, saved);
}

async function runNonInteractive(cwd: string, options: ImageConfigureOptions) {
  const provider = requireImageConfigureProvider(options.provider);
  const mode: ImageRequestMode = normalizeImageRequestMode(options.mode || "auto");

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
    const saved = writeEndpoint(cwd, {
      id: options.endpointId?.trim() || "openai",
      baseURL: OPENAI_BASE_URL,
      apiKey,
      model: options.model?.trim() || DEFAULT_MODEL,
      mode,
      setDefault: options.setDefault !== false,
    });
    return finishSaved(cwd, options, saved);
  }

  if (provider === "codex") {
    return configureCodex(cwd, {
      ...options,
      mode,
    });
  }

  const baseURL = options.baseUrl?.trim();
  const apiKey = options.apiKey?.trim();
  if (!baseURL || !apiKey) {
    throw new UsageError(
      "Custom configure needs --base-url and --api-key.",
      "Example: repochan image configure --provider custom --base-url https://relay.example/v1 --api-key ... --endpoint-id exampleId",
    );
  }
  const normalizedUrl = baseURL.replace(/\/$/, "");
  const id =
    options.endpointId?.trim() ||
    uniqueEndpointId(cwd, deriveEndpointId(normalizedUrl, "custom"), normalizedUrl);
  const existing = listEndpoints(loadConfig(cwd));
  const setDefault =
    options.setDefault === true || (options.setDefault !== false && existing.length === 0);

  const saved = writeEndpoint(cwd, {
    id,
    baseURL: normalizedUrl,
    apiKey,
    model: options.model?.trim() || DEFAULT_MODEL,
    mode,
    setDefault,
  });
  return finishSaved(cwd, options, saved);
}

export function requireImageConfigureProvider(provider: string | undefined): ImageConfigureChoice {
  if (provider === "openai" || provider === "codex" || provider === "custom" || provider === "skip") return provider;
  throw new UsageError("Missing or invalid --provider. Use openai|codex|custom|skip");
}

function writeEndpoint(
  cwd: string,
  ep: {
    id: string;
    baseURL: string;
    apiKey: string;
    model: string;
    mode: ImageRequestMode;
    setDefault: boolean;
    auth?: EndpointAuth;
  },
): {
  path: string;
  endpoint: string;
  baseURL: string;
  model: string;
  mode: ImageRequestMode;
  effectiveMode?: string;
  modeSource?: string;
  authKind?: "bearer" | "codex";
} {
  void cwd;
  const patch: ImageGenConfig = {
    version: 2,
    endpoints: {
      [ep.id]: {
        id: ep.id,
        baseURL: ep.baseURL,
        apiKey: ep.apiKey,
        model: ep.model,
        mode: ep.mode,
        ...(ep.auth ? { auth: ep.auth } : {}),
      },
    },
  };
  if (ep.setDefault) {
    patch.defaultEndpoint = ep.id;
  }
  saveGlobalConfig(patch);
  return {
    path: GLOBAL_CONFIG_PATH,
    endpoint: ep.id,
    baseURL: ep.baseURL,
    model: ep.model,
    mode: ep.mode,
  };
}

async function finishSaved(
  cwd: string,
  options: OutputOptions & { probe?: boolean },
  saved: {
    path: string;
    endpoint: string;
    baseURL: string;
    model: string;
    mode: ImageRequestMode;
  },
) {
  const statuses = listEndpointStatuses(loadConfig(cwd));
  const st = statuses.find((s) => s.id === saved.endpoint);
  const enriched = {
    ...saved,
    effectiveMode: st?.effectiveMode,
    modeSource: st?.modeSource,
  };

  if (options.probe) {
    const probe = await probeEndpoint(loadConfig(cwd), { endpoint: saved.endpoint });
    if (!options.json) {
      console.log(
        dim(
          `Probe GET /models: ${probe.modelsOk ? "ok" : "not ok"}` +
            (probe.modelsStatus != null ? ` (${probe.modelsStatus})` : "") +
            (probe.modelsNote ? ` — ${probe.modelsNote}` : ""),
        ),
      );
    }
  }
  return reportSaved(options, enriched);
}

function reportSaved(
  options: OutputOptions,
  saved: {
    path: string;
    endpoint: string;
    baseURL: string;
    model: string;
    mode: ImageRequestMode;
    effectiveMode?: string;
    modeSource?: string;
  },
) {
  if (options.json) {
    return void emitResult(options, "", { action: "configured", ...saved });
  }
  heading("Image generation configured");
  bullet("endpoint", saved.endpoint);
  bullet("baseURL", saved.baseURL);
  bullet("model", saved.model);
  bullet("mode", saved.mode + (saved.effectiveMode ? ` → effective ${saved.effectiveMode} (${saved.modeSource})` : ""));
  bullet("config", saved.path);
  console.log(dim('\nTry: repochan image gen --prompt "a chibi mascot" --out /tmp/test.png'));
  console.log(dim("     repochan image status"));
  return { action: "configured" as const, ...saved };
}

/** repochan image status */
export async function runImageStatus(cwd: string, options: OutputOptions = {}) {
  const config = loadConfig(cwd);
  const statuses = listEndpointStatuses(config);
  if (statuses.length === 0) {
    throw new UsageError(
      "No image endpoints configured.",
      "Run `repochan image configure` (OpenAI or custom OpenAI-compatible).",
    );
  }
  if (options.json) {
    return void emitResult(options, "", { endpoints: statuses, configPath: GLOBAL_CONFIG_PATH });
  }
  heading("Image endpoints");
  for (const s of statuses) {
    const mark = s.isDefault ? " (default)" : "";
    const key = s.hasKey ? "key=yes" : "key=MISSING";
    const auth = s.authKind === "codex" ? "  auth=codex" : "";
    console.log(`  ${s.id}${mark}`);
    console.log(dim(`    ${s.baseURL}`));
    console.log(
      dim(
        `    mode=${s.mode} → ${s.effectiveMode} (${s.modeSource})  model=${s.model}  ${key}${auth}`,
      ),
    );
  }
  console.log(dim(`\nConfig: ${GLOBAL_CONFIG_PATH}`));
  console.log(dim("auto = classic OpenAI unless a host rule or mode=openai-async applies."));
  console.log(dim("auth=codex → OAuth via `codex login`, drives gpt-image-2 through /responses."));
}

/** repochan image probe */
export async function runImageProbe(
  cwd: string,
  options: OutputOptions & { endpoint?: string } = {},
) {
  const config = loadConfig(cwd);
  if (listEndpoints(config).length === 0) {
    throw new UsageError("No image endpoints configured.", "Run `repochan image configure` first.");
  }
  const result = await probeEndpoint(config, { endpoint: options.endpoint });
  const statuses = listEndpointStatuses(config);
  const st = statuses.find((s) => s.id === result.endpoint);
  if (options.json) {
    return void emitResult(options, "", { ...result, ...st });
  }
  heading(`Probe: ${result.endpoint}`);
  bullet("baseURL", result.baseURL || "(none)");
  if (st) {
    bullet("mode", `${st.mode} → ${st.effectiveMode} (${st.modeSource})`);
  }
  bullet("model", result.model);
  bullet("hasKey", result.hasKey ? "yes" : "no");
  if (result.error) {
    console.log(dim(`  error: ${result.error}`));
  }
  if (result.modelsStatus != null) {
    bullet("GET /models", `${result.modelsOk ? "ok" : "fail"} (${result.modelsStatus})`);
  } else if (result.modelsNote) {
    bullet("GET /models", result.modelsOk === false ? "fail" : "n/a");
  }
  if (result.modelsNote) console.log(dim(`  note: ${result.modelsNote}`));
  console.log(dim("\nThis does not generate an image (no bill). Use `repochan image gen` to test live."));
}

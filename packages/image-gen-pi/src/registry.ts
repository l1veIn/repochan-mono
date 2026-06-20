/**
 * Provider Registry & Model Catalog
 * ==================================
 *
 * Lightweight provider registry with model catalog aggregation.
 *
 * Resolution:
 * 1. config.model → find the model in catalog, resolve its provider
 * 2. config.provider → use that provider, pick its default model
 * 3. Auto-detect: first available provider by priority
 */

import type {
  ImageGenConfig,
  ImageGenProvider,
  ModelOption,
  ProviderContext,
} from "./types.js";
import { CodexOAuthProvider } from "./providers/codex-oauth.js";
import { FalProvider } from "./providers/fal.js";
import { OpenAIApiProvider } from "./providers/openai-api.js";
import { XaiProvider } from "./providers/xai.js";

const codexProvider = new CodexOAuthProvider();
const falProvider = new FalProvider();
const openaiProvider = new OpenAIApiProvider();
const xaiProvider = new XaiProvider();

const providers = new Map<string, ImageGenProvider>([
  [codexProvider.name, codexProvider],
  [falProvider.name, falProvider],
  [openaiProvider.name, openaiProvider],
  [xaiProvider.name, xaiProvider],
]);

/** Priority for auto-detection. */
const PRIORITY = [
  codexProvider.name,
  falProvider.name,
  openaiProvider.name,
  xaiProvider.name,
];

export function initProviders(config: ImageGenConfig): void {
  falProvider.configure(config.fal);
  openaiProvider.configure(config.openai);
  xaiProvider.configure(config.xai);
}

export function listProviders(): ImageGenProvider[] {
  return [...providers.values()];
}

export function getProvider(name: string): ImageGenProvider | undefined {
  return providers.get(name);
}

/**
 * Aggregate all models from all providers into a flat catalog.
 */
export function getModelCatalog(): ModelOption[] {
  const all: ModelOption[] = [];
  for (const provider of providers.values()) {
    all.push(...provider.listModels());
  }
  return all;
}

/**
 * Find a model by its catalog id and return its provider.
 */
export function findModel(modelId: string): { provider: ImageGenProvider; model: ModelOption } | undefined {
  // Handle custom FAL model: "fal:custom:fal-ai/some-model"
  if (modelId.startsWith("fal:custom:")) {
    const customModelName = modelId.slice("fal:custom:".length);
    const fal = providers.get("fal");
    if (fal) {
      return {
        provider: fal,
        model: {
          id: modelId,
          display: `Custom: ${customModelName}`,
          providerName: "fal",
          modelName: customModelName,
          badge: "custom",
          tag: "User-defined FAL model",
        },
      };
    }
  }

  for (const provider of providers.values()) {
    const match = provider.listModels().find((m) => m.id === modelId);
    if (match) return { provider, model: match };
  }
  return undefined;
}

export interface ResolutionResult {
  provider: ImageGenProvider;
  model: ModelOption;
  reason: "config-model" | "config-provider" | "auto";
}

/**
 * Resolve active provider + model.
 *
 * Resolution order:
 * 1. config.model (catalog id) → find it, use its provider
 * 2. config.provider → use that provider's first model
 * 3. Auto-detect → first available provider's first model
 */
export async function resolveProvider(
  config: ImageGenConfig,
  ctx: ProviderContext,
): Promise<ResolutionResult | null> {
  // 1. Config model id wins
  if (config.model) {
    const found = findModel(config.model);
    if (found) {
      return { provider: found.provider, model: found.model, reason: "config-model" };
    }
  }

  // 2. Config provider name
  if (config.provider) {
    const provider = providers.get(config.provider);
    if (provider) {
      const models = provider.listModels();
      if (models.length > 0) {
        return { provider, model: models[0], reason: "config-provider" };
      }
    }
  }

  // 3. Auto-detect by priority
  for (const name of PRIORITY) {
    const provider = providers.get(name);
    if (!provider) continue;
    try {
      if (await provider.isAvailable(ctx)) {
        const models = provider.listModels();
        if (models.length > 0) {
          return { provider, model: models[0], reason: "auto" };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

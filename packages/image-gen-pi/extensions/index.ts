/**
 * Pi Extension Entry Point
 * ========================
 *
 * Registers:
 * - `image_generate` tool — multi-provider text-to-image + image-to-image
 * - `/image_model` command — interactive provider + model selector
 *
 * Selector behavior:
 * - Shows ALL models from ALL providers (not just available ones)
 * - Marks availability: ✓ available, ✗ needs setup
 * - Selecting unavailable model → shows setup instructions
 * - Custom FAL model input at the bottom
 */

import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import { loadConfig, saveGlobalConfig } from "../src/config.js";
import { resolveSaveDir, saveImage } from "../src/cache.js";
import {
  getModelCatalog,
  initProviders,
  listProviders,
  resolveProvider,
} from "../src/registry.js";
import type { GenerateParams, ImageGenProvider, ModelOption, ProviderContext } from "../src/types.js";

const ASPECT_RATIOS = ["landscape", "square", "portrait"] as const;
const SAVE_MODES = ["none", "project", "global", "custom"] as const;
const OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const;

// ---------------------------------------------------------------------------
// Tool schema
// ---------------------------------------------------------------------------

const TOOL_PARAMS = Type.Object({
  prompt: Type.String({
    description:
      "The text prompt describing the desired image. Be specific about subject, composition, style, and constraints.",
  }),
  aspectRatio: Type.Optional(
    StringEnum(ASPECT_RATIOS, {
      description: "Aspect ratio: landscape (3:2), square (1:1), or portrait (2:3). Defaults to landscape. Ignored when width+height are both provided.",
    }),
  ),
  width: Type.Optional(
    Type.Number({
      description:
        "Exact output width in pixels. When both width and height are provided, takes precedence over aspectRatio. Providers that support arbitrary sizes (FAL) use these directly; others snap to the closest supported size.",
    }),
  ),
  height: Type.Optional(
    Type.Number({
      description:
        "Exact output height in pixels. When both width and height are provided, takes precedence over aspectRatio.",
    }),
  ),
  imageUrl: Type.Optional(
    Type.String({
      description:
        "Source image for image-to-image / editing. Only supported by some providers (Codex OAuth, OpenAI API gpt-image-1, FAL nano-banana-pro/gpt-image-2).",
    }),
  ),
  referenceImageUrls: Type.Optional(
    Type.Array(Type.String(), {
      description: "Additional reference image paths for style/composition. Only Codex OAuth and FAL nano-banana-pro.",
    }),
  ),
  save: Type.Optional(
    StringEnum(SAVE_MODES, {
      description: "Where to save the generated image. Defaults to 'global'.",
    }),
  ),
  saveDir: Type.Optional(
    Type.String({
      description: "Directory when save='custom'. Relative paths resolve under cwd.",
    }),
  ),
  outputFormat: Type.Optional(
    StringEnum(OUTPUT_FORMATS, {
      description: "Output format. Defaults to 'png'.",
    }),
  ),
});

type ToolParams = Static<typeof TOOL_PARAMS>;

// ---------------------------------------------------------------------------
// Provider setup hints for the selector
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function imageGenExtension(pi: ExtensionAPI) {
  // --- Register image_generate tool ---
  pi.registerTool({
    name: "image_generate",
    label: "Image Gen",
    description:
      "Generate or edit images. Supports multiple providers (Codex OAuth, FAL.ai, OpenAI API, xAI). " +
      "Pass imageUrl for image-to-image / editing (Codex OAuth, OpenAI gpt-image-1, FAL nano-banana-pro/gpt-image-2). " +
      "The active provider is determined by /image_model selection or config.",
    promptSnippet: "Generate or edit images via multi-provider image generation.",
    promptGuidelines: [
      "Use image_generate when the user asks to create, generate, draw, render, edit, or make an image.",
      "Pass imageUrl when the user wants to edit or transform an existing image.",
      "Do not use image_generate without a clear image-generation request — it consumes the user's quota.",
    ],
    parameters: TOOL_PARAMS,
    executionMode: "parallel",

    async execute(_toolCallId, params: ToolParams, signal, onUpdate, ctx) {
      const agentDir = getAgentDir();
      const config = loadConfig(agentDir, ctx.cwd);
      initProviders(config);

      const sessionId = ctx.sessionManager.getSessionId();

      const providerCtx: ProviderContext = {
        cwd: ctx.cwd,
        sessionId,
        getApiKeyForProvider: (provider: string) =>
          ctx.modelRegistry.getApiKeyForProvider(provider),
        signal,
        onProgress: (message, details) => {
          onUpdate?.({ content: [{ type: "text", text: message }], details });
        },
      };

      // --- Resolve provider + model ---
      const resolved = await resolveProvider(config, providerCtx);
      if (!resolved) {
        throw new Error(
          "No image generation provider is available.\n" +
            "To enable:\n" +
            "  • Codex OAuth: run /login and select 'ChatGPT Plus/Pro (Codex)'\n" +
            "  • FAL.ai: set FAL_KEY environment variable\n" +
            "  • OpenAI API: set OPENAI_API_KEY environment variable\n" +
            "  • xAI: set XAI_API_KEY environment variable\n" +
            "Or run /image_model to pick and configure a provider.",
        );
      }

      const { provider, model, reason } = resolved;

      // --- Check image-to-image capability ---
      const hasSourceImage = params.imageUrl?.trim() || (params.referenceImageUrls && params.referenceImageUrls.length > 0);
      if (hasSourceImage) {
        const caps = provider.capabilities(model.modelName);
        if (!caps.modalities.includes("image")) {
          throw new Error(
            `Model '${model.display}' does not support image-to-image. ` +
              "Use a text-only prompt, or switch to an edit-capable model via /image_model.",
          );
        }
      }

      // --- Build generate params ---
      const generateParams: GenerateParams = {
        prompt: params.prompt,
        aspectRatio: params.aspectRatio ?? config.aspectRatio ?? "landscape",
        width: typeof params.width === "number" ? params.width : undefined,
        height: typeof params.height === "number" ? params.height : undefined,
        outputFormat: params.outputFormat ?? config.outputFormat ?? "png",
        imageUrl: params.imageUrl,
        referenceImageUrls: params.referenceImageUrls,
      };

      onUpdate?.({
        content: [{ type: "text", text: `Generating via ${model.display} (${reason})…` }],
        details: { provider: provider.name, model: model.modelName, aspectRatio: generateParams.aspectRatio },
      });

      // --- Generate ---
      const result = await provider.generate(generateParams, providerCtx);
      if (!result.success || !result.image) {
        throw new Error(result.error || `Image generation failed via ${provider.displayName}.`);
      }

      // --- Save ---
      const saveMode = params.save ?? config.save ?? "global";
      let savedPath: string | undefined;

      if (saveMode !== "none") {
        const outputDir = resolveSaveDir(
          saveMode,
          agentDir,
          ctx.cwd,
          sessionId,
          params.saveDir ?? config.saveDir,
        );
        if (outputDir) {
          const format = generateParams.outputFormat ?? "png";
          const imageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          savedPath = await saveImage(result.image, format, outputDir, imageId);
          onUpdate?.({
            content: [{ type: "text", text: `Image saved to ${savedPath}.` }],
            details: { savedPath, byteCount: Buffer.byteLength(result.image, "base64") },
          });
        }
      }

      const summary = [
        `Generated image via ${model.display} (${result.model}).`,
        savedPath ? `Saved to: ${savedPath}` : "Image returned inline (not saved).",
        result.revisedPrompt ? `Revised prompt: ${result.revisedPrompt}` : undefined,
      ]
        .filter(Boolean)
        .join(" ");

      return {
        content: [
          { type: "text", text: summary },
          { type: "image", data: result.image, mimeType: result.mimeType ?? "image/png" },
        ],
        details: {
          provider: result.provider,
          model: result.model,
          modelId: model.id,
          aspectRatio: generateParams.aspectRatio,
          outputFormat: generateParams.outputFormat,
          saveMode,
          savedPath,
          revisedPrompt: result.revisedPrompt,
          selectionReason: reason,
        },
      };
    },
  });

  // --- Register /image_model command ---
  pi.registerCommand("image_model", {
    description: "Select image generation provider and model",
    handler: async (_args, ctx) => {
      const agentDir = getAgentDir();
      const config = loadConfig(agentDir, ctx.cwd);
      initProviders(config);

      const providerCtx: ProviderContext = {
        cwd: ctx.cwd,
        sessionId: ctx.sessionManager.getSessionId(),
        getApiKeyForProvider: (provider: string) =>
          ctx.modelRegistry.getApiKeyForProvider(provider),
      };

      // --- Check availability of each provider ---
      const availabilityMap = new Map<string, boolean>();
      for (const provider of listProviders()) {
        try {
          availabilityMap.set(provider.name, await provider.isAvailable(providerCtx));
        } catch {
          availabilityMap.set(provider.name, false);
        }
      }

      // --- Build full catalog with availability markers ---
      const catalog = getModelCatalog();
      const currentModelId = config.model;

      type SelectableEntry =
        | { type: "model"; model: ModelOption; available: boolean; label: string }
        | { type: "auto"; label: string }
        | { type: "custom-fal"; label: string };

      const entries: SelectableEntry[] = [];

      // Group models by provider for readability
      const byProvider = new Map<string, ModelOption[]>();
      for (const m of catalog) {
        if (!byProvider.has(m.providerName)) byProvider.set(m.providerName, []);
        byProvider.get(m.providerName)!.push(m);
      }

      // Provider display order
      const providerOrder = ["codex-oauth", "fal", "openai", "xai"];
      const providerLabels: Record<string, string> = {
        "codex-oauth": "Codex OAuth",
        fal: "FAL.ai",
        openai: "OpenAI API",
        xai: "xAI",
      };

      for (const pn of providerOrder) {
        const models = byProvider.get(pn);
        if (!models || models.length === 0) continue;
        const available = availabilityMap.get(pn) ?? false;
        const status = available ? "✓" : "✗";

        for (const m of models) {
          const isCurrent = m.id === currentModelId;
          const marker = isCurrent ? " ← current" : "";
          const badge = m.badge ? `[${m.badge}]` : "";
          const tag = m.tag ? ` — ${m.tag}` : "";
          entries.push({
            type: "model",
            model: m,
            available,
            label: `${status} ${m.display} ${badge}${tag}${marker}`,
          });
        }

        // Add custom model option after FAL models
        if (pn === "fal" && available) {
          entries.push({
            type: "custom-fal",
            label: "✏ Custom FAL model…",
          });
        }
      }

      // Add auto-detect at the end
      entries.push({
        type: "auto",
        label: "⚙ Auto-detect (use first available provider)",
      });

      // --- Non-interactive fallback ---
      if (!ctx.hasUI) {
        const lines = entries.map((e) => e.label);
        const current = config.model ?? config.provider ?? "auto";
        ctx.ui.notify(
          [`Current: ${current}`, "", ...lines, "", "Set in ~/.pi/agent/extensions/image-gen.json"].join("\n"),
          "info",
        );
        return;
      }

      // --- Show selector ---
      const options = entries.map((e) => e.label);
      const selected = await ctx.ui.select("Image Model", options);
      if (!selected) return; // cancelled

      const selectedIndex = options.indexOf(selected);
      const entry = entries[selectedIndex];

      // --- Handle auto-detect ---
      if (entry.type === "auto") {
        saveGlobalConfig(agentDir, { ...config, provider: undefined, model: undefined });
        ctx.ui.notify("Image model set to auto-detect.", "info");
        return;
      }

      // --- Handle custom FAL model ---
      if (entry.type === "custom-fal") {
        const customId = await ctx.ui.input(
          "FAL model ID",
          "e.g. fal-ai/Qwen-Image or any model from fal.ai/models",
        );
        if (!customId || !customId.trim()) return;
        const trimmed = customId.trim();
        saveGlobalConfig(agentDir, {
          ...config,
          provider: "fal",
          model: `fal:custom:${trimmed}`,
          fal: { ...config.fal, model: trimmed },
        });
        ctx.ui.notify(`Custom FAL model set to: ${trimmed}`, "info");
        return;
      }

      // --- Handle model selection ---
      if (entry.type === "model") {
        if (!entry.available) {
          // Codex OAuth needs /login — we can't collect its key ourselves
          if (entry.model.providerName === "codex-oauth") {
            ctx.ui.notify(
              `${entry.model.display} requires Pi OAuth.\n\nRun /login and select 'ChatGPT Plus/Pro (Codex)', then run /image_model again.`,
              "warning",
            );
            return;
          }

          // API-key providers: offer interactive key configuration
          const providerLabel = entry.model.providerName === "fal" ? "FAL.ai"
            : entry.model.providerName === "openai" ? "OpenAI"
            : entry.model.providerName === "xai" ? "xAI"
            : entry.model.providerName;

          const envVarNames: Record<string, string> = {
            fal: "FAL_KEY",
            openai: "OPENAI_API_KEY",
            xai: "XAI_API_KEY",
          };

          const mode = await ctx.ui.select(
            `Configure ${providerLabel} API Key`,
            [
              `Enter API key now (stored in config)`,
              `Reference an env var (e.g. $${envVarNames[entry.model.providerName] ?? "API_KEY"})`,
              `Cancel — I'll set it up later`,
            ],
          );
          if (!mode || mode.startsWith("Cancel")) return;

          let resolvedKey: string;

          if (mode.startsWith("Enter API key")) {
            const key = await ctx.ui.input(
              `${providerLabel} API Key`,
              `Paste your ${providerLabel} API key here`,
            );
            if (!key || !key.trim()) {
              ctx.ui.notify("No key entered.", "warning");
              return;
            }
            resolvedKey = key.trim();
          } else {
            // Env var mode
            const defaultEnvVar = envVarNames[entry.model.providerName] ?? "API_KEY";
            const envVarName = await ctx.ui.input(
              "Environment variable name",
              `e.g. ${defaultEnvVar}`,
            );
            const varName = (envVarName || defaultEnvVar).trim().replace(/^\$/, "");
            resolvedKey = `$${varName}`;
            ctx.ui.notify(
              `Key will be read from $${varName} at runtime. Make sure it's exported in your shell profile.`,
              "info",
            );
          }

          // Save key to config under the provider section
          const providerConfigKey = entry.model.providerName as "fal" | "openai" | "xai";
          const updatedConfig = {
            ...config,
            [providerConfigKey]: {
              ...config[providerConfigKey],
              apiKey: resolvedKey,
            },
          };

          // Also set provider + model selection
          updatedConfig.provider = entry.model.providerName;
          updatedConfig.model = entry.model.id;
          if (entry.model.providerName === "fal") {
            updatedConfig.fal = { ...updatedConfig.fal, model: entry.model.modelName };
          }

          saveGlobalConfig(agentDir, updatedConfig);
          ctx.ui.notify(
            `${entry.model.display} configured and selected. You can generate images now.`,
            "info",
          );
          return;
        }

        // Available — just select it
        saveGlobalConfig(agentDir, {
          ...config,
          provider: entry.model.providerName,
          model: entry.model.id,
        });

        // For FAL models, also set the FAL-specific model name
        if (entry.model.providerName === "fal") {
          saveGlobalConfig(agentDir, {
            provider: "fal",
            model: entry.model.id,
            fal: { ...config.fal, model: entry.model.modelName },
          });
        }

        ctx.ui.notify(`Image model set to: ${entry.model.display}`, "info");
      }
    },
  });
}

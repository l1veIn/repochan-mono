---
name: image-gen
description: Generate or edit images via the image_generate tool. Supports Codex OAuth, FAL.ai, OpenAI API, and xAI providers.
---

# Image Generation

## When to use

Use `image_generate` when the user asks to create, generate, draw, render, edit, or make a raster image.

Do **not** use it without a clear image-generation request — it consumes quota.

## Provider selection

Run `/image_model` to pick a provider and model interactively. The selector shows all models with availability status (✓/✗).

| Provider | Auth | Notable Models |
|----------|------|----------------|
| Codex OAuth | Pi `/login` | gpt-image-2 |
| FAL.ai | `FAL_KEY` | Nano Banana Pro/2, GPT Image 2, FLUX 1/2, Ideogram, Recraft, Seedream |
| OpenAI API | `OPENAI_API_KEY` | gpt-image-1, dall-e-3 |
| xAI | `XAI_API_KEY` | grok-2-image |

FAL supports custom model IDs — enter any model from [fal.ai/models](https://fal.ai/models) in the selector.

## Tool reference

```
image_generate(
  prompt: string,                    # Required
  aspectRatio?: "landscape" | "square" | "portrait",
  imageUrl?: string,                 # Source image for editing
  referenceImageUrls?: string[],     # Additional references (Codex OAuth, FAL nano-banana-pro)
  save?: "none" | "project" | "global" | "custom",
  saveDir?: string,                  # When save="custom"
  outputFormat?: "png" | "jpeg" | "webp",
)
```

## Image-to-Image

Pass `imageUrl` to edit/transform an existing image. Supported models:
- Codex OAuth (gpt-image-2)
- OpenAI API (gpt-image-1)
- FAL: nano-banana-pro, gpt-image-2, FLUX 2 Pro, FLUX 2 Klein, Seedream 4.5

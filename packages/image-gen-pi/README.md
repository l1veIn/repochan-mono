# @repochan/image-gen-pi

Multi-provider image generation [Pi](https://pi.dev/) package. Registers `image_generate` tool and `/image_model` command.

## Providers

| Provider | Auth | Models | Image Editing |
|----------|------|--------|:-------------:|
| **Codex OAuth** | Pi `/login` | gpt-image-2 | ✅ |
| **FAL.ai** | `FAL_KEY` | flux-schnell/dev/pro/pro-ultra | ❌ |
| **OpenAI API** | `OPENAI_API_KEY` | gpt-image-1, dall-e-3 | ✅ (gpt-image-1) |
| **xAI** | `XAI_API_KEY` | grok-2-image | ❌ |

## Installation

```bash
pi install /path/to/repochan-mono/packages/image-gen-pi
```

## Quick start

1. **Pick a provider and model:**
   ```
   /image_model
   ```
   This opens an interactive selector showing all available models.

2. Or configure manually — see below.

3. **Generate:**
   ```
   > Generate a pixel-art sword icon, 32×32, with a blue blade and gold hilt
   ```

4. **Edit an existing image:**
   ```
   > Edit the image at ./hero.png — add a warm sunset glow behind the character
   ```

## Configuration

| Scope | Path |
|-------|------|
| Global | `~/.pi/agent/extensions/image-gen.json` |
| Project | `<project-root>/.pi/extensions/image-gen.json` |

```json
{
  "provider": "codex-oauth",
  "model": "codex-oauth:gpt-image-2",
  "save": "global",
  "aspectRatio": "landscape",
  "outputFormat": "png"
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `provider` | auto | `"codex-oauth"`, `"fal"`, `"openai"`, `"xai"`. If unset, auto-detects. |
| `model` | — | Catalog id (e.g. `"fal:flux-pro"`). Overrides provider. |
| `save` | `global` | `none` / `project` / `global` / `custom`. |
| `saveDir` | — | Directory for `save="custom"`. |
| `aspectRatio` | `landscape` | Default aspect ratio. |
| `outputFormat` | `png` | `png` / `jpeg` / `webp`. |
| `fal.model` | `fal-ai/flux/schnell` | FAL model id. |
| `fal.apiKey` | `$FAL_KEY` | FAL API key. |
| `openai.apiKey` | `$OPENAI_API_KEY` | OpenAI API key. |
| `xai.apiKey` | `$XAI_API_KEY` | xAI API key. |

## Tool parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | ✅ | Image generation prompt. |
| `aspectRatio` | enum | — | `landscape` / `square` / `portrait`. |
| `imageUrl` | string | — | Source image for editing (Codex OAuth, OpenAI gpt-image-1). |
| `referenceImageUrls` | string[] | — | Additional reference images (Codex OAuth only). |
| `save` | enum | — | Override save mode. |
| `saveDir` | string | — | Directory when `save="custom"`. |
| `outputFormat` | enum | — | `png` / `jpeg` / `webp`. |

## `/image_model` command

Opens a native Pi selector showing all available models from all providers, with badges and current selection marker. Saves to config on selection.

## Save modes

| Mode | Behavior |
|------|----------|
| `none` | Inline return only. |
| `project` | `<cwd>/.pi/generated-images/<session>/` |
| `global` | `~/.pi/agent/generated-images/<session>/` |
| `custom` | User-specified directory. |

## License

MIT

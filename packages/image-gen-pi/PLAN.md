# image-gen-pi — Pi Image Generation Package

> 多 provider 图像生成 Pi package，对齐 Hermes Agent 的 image_gen 能力覆盖。

## Providers (4)

| Provider | Auth | Models | Text→Image | Image→Image |
|----------|------|--------|:----------:|:-----------:|
| **Codex OAuth** | Pi `/login` → JWT | gpt-image-2 | ✅ | ✅ (reference images) |
| **FAL.ai** | `FAL_KEY` | flux-schnell/dev/pro/pro-ultra | ✅ | ❌ |
| **OpenAI API** | `OPENAI_API_KEY` | gpt-image-1, dall-e-3 | ✅ | ✅ (gpt-image-1) |
| **xAI** | `XAI_API_KEY` | grok-2-image | ✅ | ❌ |

## Model Catalog (8 models)

| ID | Display | Badge | Provider |
|----|---------|-------|----------|
| `codex-oauth:gpt-image-2` | GPT Image 2 (Codex OAuth) | subscription | codex-oauth |
| `fal:flux-schnell` | FLUX Schnell (FAL) | fast | fal |
| `fal:flux-dev` | FLUX Dev (FAL) | value | fal |
| `fal:flux-pro` | FLUX Pro (FAL) | quality | fal |
| `fal:flux-pro-ultra` | FLUX Pro Ultra (FAL) | quality | fal |
| `openai:gpt-image-1` | GPT Image 1 (OpenAI API) | paid | openai |
| `openai:dall-e-3` | DALL-E 3 (OpenAI API) | value | openai |
| `xai:grok-2-image` | Grok 2 Image (xAI) | paid | xai |

## Architecture

```
extensions/index.ts          ← Pi 扩展入口
  ├── registerTool("image_generate")   ← text-to-image + image-to-image
  └── registerCommand("image_model")   ← /image_model selector
        └── src/registry.ts            ← Provider 注册表 + 模型目录 + 解析
              ├── providers/
              │   ├── codex-oauth.ts   ← Codex Responses API + SSE + reference images
              │   ├── fal.ts           ← FAL queue API (4 models)
              │   ├── openai-api.ts    ← OpenAI Images API (generations + edits)
              │   └── xai.ts           ← xAI Grok image API
              ├── config.ts            ← JSON 配置 (global + project merge)
              ├── cache.ts             ← 图片保存
              └── types.ts             ← Provider/Model/Capabilities 接口
```

## Resolution

1. `config.model` (catalog id) → 找到 model，用它的 provider
2. `config.provider` → 用该 provider 的第一个 model
3. 自动检测：按优先级 (codex-oauth → fal → openai → xai) 找第一个可用的

## `/image_model` 命令

在 Pi session 里运行 `/image_model` 拉起原生 selector：
- 列出所有可用 provider 的所有 model（带 badge 标签）
- 标记当前选择
- 选择后写入 `~/.pi/agent/extensions/image-gen.json`

## Image-to-Image

- `imageUrl` 参数传入源图路径
- `referenceImageUrls` 传入额外参考图（仅 Codex OAuth 支持，最多 3 张）
- 不支持编辑的 provider/model 会在调用前报错，不浪费 API 调用

## 对齐 Hermes 的差异

| Hermes | image-gen-pi |
|--------|-------------|
| Provider 通过 PluginContext 动态注册 | Provider 硬编码 import，4 个 |
| 动态 tool schema（per-call description 变化） | 静态 schema + /reload |
| Gateway MEDIA: 标签提取 | Pi 原生 `content[].type: "image"` |
| Python | TypeScript |
| 5 providers (FAL/Codex/OpenAI/xAI/Krea) | 4 providers (跳过 Krea) |

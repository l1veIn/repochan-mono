# @repochan/image-gen

Image generation library for RepoChan — **prompt → PNG via the Vercel AI SDK**.

Every backend is treated as an OpenAI-compatible `/images/generations` endpoint
(`baseURL` + `apiKey` + `model`), which covers switchbase relays, a local codex
reverse-proxy, and OpenAI direct alike (all verified in the Phase 2.0 spike to
speak the standard images endpoint). No provider-specific HTTP, no OAuth — a
user riding a ChatGPT subscription runs their own reverse proxy and points an
endpoint at it.

## API

- `generate(params, config, options)` → `{ success, image: Uint8Array, endpoint, model }`
- `loadConfig(cwd)` / `saveGlobalConfig(config)` — read/write `~/.repochan/image.json`
- `listEndpoints(config)` — configured endpoint ids

## Config (`~/.repochan/image.json`)

```json
{
  "defaultEndpoint": "switchbase",
  "endpoints": {
    "switchbase":   { "baseURL": "https://switchbase.vip/v1", "apiKey": "${SWITCHBASE_KEY}", "model": "gpt-image-2" },
    "codex-proxy":  { "baseURL": "http://127.0.0.1:8787/v1",  "apiKey": "${CODEX_PROXY_KEY}", "model": "gpt-image-2" },
    "openai":       { "baseURL": "https://api.openai.com/v1", "apiKey": "${OPENAI_API_KEY}", "model": "gpt-image-2" }
  }
}
```

`${ENV_VAR}` references expand from the environment at load time.

## Boundaries

Pure library: returns bytes, never writes to `.repochan/` protocol artifacts.
The caller (cli) persists results via `@repochan/core`. Credentials are isolated
here — core and cli have no concept of API keys (ADR §8.3/§8.4).

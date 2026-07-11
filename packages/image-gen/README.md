# @repochan/image-gen

Image generation library for RepoChan — **prompt → PNG bytes** via OpenAI-compatible HTTP.

## Modes (users usually ignore this)

| Configured `mode` | Behavior |
|-------------------|----------|
| **`auto`** (default) | Classic OpenAI submit (**no** `X-Async-Mode`). If the response has a `job_id`/`task_id`, poll. Host rules may upgrade to `openai-async`. |
| **`openai`** | Force classic (no X-Async headers). |
| **`openai-async`** | Force `X-Async-Mode: true` + async poll paths. |

**Never** re-POSTs a full generation after failure (no “try the other mode” — double-bill risk).

Host rules live in `src/hostRules.ts` (empty by default; add only when a host *requires* X-Async on submit). Advanced: `REPOCHAN_IMAGE_MODE=openai-async` or `mode` in config.

## API

- `generate(params, config, options?)` → `{ success, image, mode, effectiveMode, modeSource, jobId?, billedRisk?, … }`
- `loadConfig` / `saveGlobalConfig` — `~/.repochan/image.json`
- `listEndpointStatuses` — configured + effective mode (no secrets)
- `probeEndpoint` — `GET /models` (no bill)
- `resolveEffectiveMode` / `BUILTIN_HOST_RULES`

## Config example

```json
{
  "version": 2,
  "defaultEndpoint": "example",
  "endpoints": {
    "example": {
      "id": "example",
      "baseURL": "https://api.openai.com/v1",
      "apiKey": "${OPENAI_KEY}",
      "model": "gpt-image-2",
      "mode": "auto"
    }
  }
}
```

Missing `mode` → **`auto`**.

## CLI

```bash
repochan image configure          # OpenAI | Custom OpenAI-compatible | skip
repochan image status             # shows mode → effectiveMode
repochan image gen --prompt "…"
```

Advanced: `--mode openai-async` or config `mode: "openai-async"` for relays that require async submit headers.

## Boundaries

Pure library: returns bytes, never writes project `.repochan/` protocol artifacts.
Credentials stay here — core has no API keys.

# @repochan/image-gen

Image generation library for RepoChan — **prompt → PNG bytes** via OpenAI-compatible HTTP,
or natively through the Codex `/responses` backend (OAuth via `codex login`).

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
  - `params.referenceImages` — array of `{data, mimeType}` for image-to-image conditioning. When provided, uses `/images/edits` (multipart); otherwise uses `/images/generations` (JSON). Multiple reference images are sent as repeated `image[]` multipart parts.
  - `params.quality` — `"low" | "medium" | "high" | "auto"` (provider-side rendering quality). Typically sourced from the asset template's `quality` field.
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
repochan image configure          # OpenAI | Codex | Custom OpenAI-compatible | skip
repochan image status             # shows mode → effectiveMode (+ auth=codex)
repochan image gen --prompt "…"
```

Advanced: `--mode openai-async` or config `mode: "openai-async"` for relays that require async submit headers.

## Codex / ChatGPT login (`auth.kind: codex`)

Reach `gpt-image-2` through the Codex `/responses` backend using the OAuth token
from the official `codex login`. image-gen reads `~/.codex/auth.json` (read-only)
and refreshes short-lived access tokens itself — no separate reverse-proxy needed.

**One-time setup:**

```bash
codex login                       # official CLI writes ~/.codex/auth.json
repochan image configure --provider codex   # or pick "Codex (ChatGPT login)" interactively
```

This writes an endpoint with `auth: { kind: "codex" }`, pointed at
`https://chatgpt.com/backend-api/codex`, model `gpt-image-2`. The `apiKey` field
is left empty — the OAuth access token is injected per request.

```json
{
  "version": 2,
  "defaultEndpoint": "codex",
  "endpoints": {
    "codex": {
      "id": "codex",
      "baseURL": "https://chatgpt.com/backend-api/codex",
      "apiKey": "",
      "model": "gpt-image-2",
      "auth": { "kind": "codex" }
    }
  }
}
```

**Behavior & boundaries:**
- image-gen never writes back to `~/.codex/`. Refreshed access tokens are cached
  at `~/.repochan/codex-token-cache.json` (mode `0600`).
- A 401 from the upstream triggers one token refresh + retry (not a full
  generation replay — the global "never auto-retry" invariant still holds).
- Only `gpt-image-2` is supported on this transport.
- `repochan image probe` on a codex endpoint resolves a valid token (exercising
  the refresh path) instead of `GET /models`, which the Codex backend lacks.
- macOS note: `codex login` may store tokens in the Keychain rather than
  `~/.codex/auth.json`. If `loadCodexAuth` can't find the file, re-login or use
  another provider.

## Boundaries

Pure library: returns bytes, never writes project `.repochan/` protocol artifacts.
Credentials stay here — core has no API keys.

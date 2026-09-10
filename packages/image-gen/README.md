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

## Models

Model ids are per endpoint (`endpoints.<id>.model`); new endpoints default to
`gpt-image-2.5-sunburst`.

| Model id | Notes |
|----------|-------|
| `gpt-image-2.5-sunburst` | **Default.** OpenAI's most capable generation + edit model; best for reference-conditioned revision work. |
| `gpt-image-2.5-flare` | Fastest high-quality generation — good for bulk grids and drafts. |
| `gpt-image-2` | Previous generation, still fully supported. |

- **Quality**: the GPT-Image-2.5 models add `xhigh` and `max` on top of `low | medium | high | auto`
  (`gpt-image-2` tops out at `high`). Default is `auto` — raise it deliberately, higher tiers cost more.
- **Sizes**: recommended `1024x1024` / `1536x1024` / `1024x1536`. The 2.5 models also accept custom
  `WIDTHxHEIGHT` (multiples of 16, aspect ratio 1:3–3:1, edges ≤ 3840, total pixels 655,360–8,294,400;
  above `2560x1440` is experimental). image-gen passes `size` through unchecked.
- **Transparency**: `background: "transparent"` with `output_format` `png`/`webp` — unchanged on 2.5.
- **Relays**: third-party OpenAI-compatible relays may lag behind on 2.5. Confirm with your relay
  before switching an endpoint's model.

## API

- `generate(params, config, options?)` → `{ success, image, mode, effectiveMode, modeSource, jobId?, billedRisk?, … }`
  - `params.referenceImages` — array of `{data, mimeType}` for image-to-image conditioning. When provided, uses `/images/edits` (multipart); otherwise uses `/images/generations` (JSON). Multiple reference images are sent as repeated `image[]` multipart parts.
  - `params.quality` — `"low" | "medium" | "high" | "xhigh" | "max" | "auto"` (provider-side rendering quality). Typically sourced from the asset template's `quality` field. `xhigh` / `max` exist only on GPT-Image-2.5 models.
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
      "model": "gpt-image-2.5-sunburst",
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

Reach the GPT-Image-2 family through the Codex `/responses` backend using the OAuth token
from the official `codex login`. image-gen reads `~/.codex/auth.json` (read-only)
and refreshes short-lived access tokens itself — no separate reverse-proxy needed.

**One-time setup:**

```bash
codex login                       # official CLI writes ~/.codex/auth.json
repochan image configure --provider codex   # or pick "Codex (ChatGPT login)" interactively
```

This writes an endpoint with `auth: { kind: "codex" }`, pointed at
`https://chatgpt.com/backend-api/codex`, model `gpt-image-2.5-sunburst`. The `apiKey` field
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
      "model": "gpt-image-2.5-sunburst",
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
- Only the GPT-Image-2 family is supported on this transport (`gpt-image-2`, `gpt-image-2.5-sunburst`, `gpt-image-2.5-flare`).
- `repochan image probe` on a codex endpoint resolves a valid token (exercising
  the refresh path) instead of `GET /models`, which the Codex backend lacks.
- macOS note: `codex login` may store tokens in the Keychain rather than
  `~/.codex/auth.json`. If `loadCodexAuth` can't find the file, re-login or use
  another provider.

## Boundaries

Pure library: returns bytes, never writes project `.repochan/` protocol artifacts.
Credentials stay here — core has no API keys.

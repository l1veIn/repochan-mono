# @repochan/image-gen

Image generation library for RepoChan — **prompt → image bytes** via OpenAI-compatible HTTP,
or natively through the Codex `/responses` backend (OAuth via `codex login`).

## Modes (users usually ignore this)

| Configured `mode` | Behavior |
|-------------------|----------|
| **`auto`** (default) | Classic OpenAI submit (**no** `X-Async-Mode`). If the response has a `job_id`/`task_id`, poll. Host rules may upgrade to `openai-async`. |
| **`openai`** | Force classic (no X-Async headers). |
| **`openai-async`** | Submit to OpenAI Images with `X-Async-Mode: true` + `X-Async-Image-No-Retry: 1`; poll after receiving a task/job ID. |

**Never** re-POSTs a full generation after failure (no “try the other mode” — double-bill risk).

Host rules live in `src/hostRules.ts`; the current built-in rule selects `openai-async` for
`65535.space` and its subdomains. Explicit `openai` / `openai-async` endpoint or CLI modes take precedence.
Add rules only after verifying that a host needs a non-default submit strategy. Advanced: `REPOCHAN_IMAGE_MODE=openai-async`
or `mode` in config.

Both modes still submit `/images/generations` JSON or `/images/edits` multipart. A relay may
return a synchronous `200` image despite async headers. `openai-async` does not implement the
native `POST /v1/tasks` contract `{ kind, model, input }`; overriding the submit path does not
translate the request body or reference images into that contract.

## Models

Model ids are per endpoint (`endpoints.<id>.model`); new endpoints default to
`gpt-image-2.5-sunburst`.

| Model id | Notes |
|----------|-------|
| `gpt-image-2.5-sunburst` | Repository default for generation and reference-conditioned edits. |
| `gpt-image-2.5-flare` | Supported alternative for bulk grids and drafts. |
| `gpt-image-2` | Supported family member. |

- **Quality**: the GPT-Image-2.5 models add `xhigh` and `max` on top of `low | medium | high | auto`
  (`gpt-image-2` tops out at `high`). Default is `auto` — raise it deliberately, higher tiers cost more.
- **Sizes**: image-gen passes `size` through to the endpoint. Asset templates declare their requested
  dimensions; the selected provider determines accepted sizes and limits.
- **Transparency**: pass `background: "transparent"` and a transparency-capable output format
  when the order requires native alpha. Inspect the result before publishing it.
- **Relays**: third-party OpenAI-compatible relays may lag behind on 2.5. Confirm with your relay
  before switching an endpoint's model.

## API

- `generate(params, config, options?)` → `{ success, image, mode, effectiveMode, modeSource, jobId?, billedRisk?, … }`
  - `params.referenceImages` — array of `{data, mimeType}` for image-to-image conditioning. When provided, uses `/images/edits` (multipart); otherwise uses `/images/generations` (JSON). Multiple reference images are sent as repeated `image[]` multipart parts.
  - `params.quality` — `"low" | "medium" | "high" | "xhigh" | "max" | "auto"` (provider-side rendering quality). Typically sourced from the asset template's `quality` field. `xhigh` / `max` exist only on GPT-Image-2.5 models.
- Success requires recognizable PNG, JPEG, or WebP bytes. Empty, truncated signatures, and unknown
  formats return failure; `jobId` and `billedRisk` remain available when a submission may have been billed.
  This library checks the format signature. The CLI fully decodes the image before saving the original
  bytes, and refuses existing explicit output paths unless `--overwrite` is supplied.
- `loadConfig` / `saveGlobalConfig` — `~/.repochan/image.json`
- `listEndpointStatuses` — configured + effective mode (no secrets)
- `probeEndpoint` — `GET /models` for bearer endpoints or Codex OAuth token resolution (no image generation)
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
repochan image gen --prompt "…" --out image.png
```

Advanced: `--mode openai-async` or config `mode: "openai-async"` for relays that require async submit headers.

## Recover an interrupted generation

The async poll budget starts only after the submit response provides a task/job ID. A connection
or response-body failure can leave `billedRisk: true` without `jobId`: the original task may
still exist. Increasing the poll budget or changing mode cannot identify that task.

- With an ID, inspect the original task through the endpoint's documented status interface.
  `asyncPollPathTemplate` can customize GET polling for IDs returned by a submit response;
  it does not add native Tasks submission or a task-list/recovery CLI command.
- Without an ID, use the endpoint's documented task list or dashboard. Match the complete
  prompt and model against the original submission context to identify exactly one task.
  Multiple matches or no match leave the outcome unresolved; never select the first item or
  treat a missing ID as proof that no task was created.
- For a completed task, download and inspect its existing result. For a pending/running task,
  continue checking that task. For a failed task, inspect its terminal error before deciding
  whether a new paid generation is appropriate. Keep the original request unresolved until
  its identity and outcome are established; do not automatically switch modes and re-POST.

Task-list paths such as `GET /v1/tasks?kind=image` are provider-specific. Use them only when
that endpoint's contract confirms them; do not probe guessed Tasks paths on every provider.
One successful request establishes that request's result, not general endpoint reliability
or visual acceptance of alpha edges and layout.

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
  at `~/.repochan/codex-token-cache.json` (mode `0600`), together with rotated refresh tokens.
  Cache identity follows the source login; a new `codex login` invalidates an older login's cache.
- A 401 from the upstream triggers one token refresh + retry (not a full
  generation replay — the global "never auto-retry" invariant still holds).
- Only the GPT-Image-2 family is supported on this transport (`gpt-image-2`, `gpt-image-2.5-sunburst`, `gpt-image-2.5-flare`).
- `repochan image probe` on a codex endpoint resolves a valid token (exercising
  the refresh path) instead of `GET /models`, which the Codex backend lacks.
  Its `authOk` / `authNote` describe token resolution; `hasKey` remains the compatible
  credential-availability field. Codex results omit `modelsOk` and `modelsStatus`,
  which describe `GET /models` checks. Neither probe verifies image-generation availability.
- macOS note: `codex login` may store tokens in the Keychain rather than
  `~/.codex/auth.json`. If `loadCodexAuth` can't find the file, re-login or use
  another provider.

## Boundaries

Pure library: returns bytes, never writes project `.repochan/` protocol artifacts.
Credentials stay here — core has no API keys.

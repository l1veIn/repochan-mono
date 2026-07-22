# RepoChan Monorepo Guidelines

> **Architecture contract.**
>
> Authoritative overview: [`ARCHITECTURE.md`](./ARCHITECTURE.md).
>
> **core + skill at the center · CLI is the sole binding surface · agent is BYO · no embedded runtime.**

## Package rules

- **`packages/core`** must remain a pure library: no agent runtime imports, no `ExtensionContext`, no creative-agent prompting, no image-provider credentials. Core owns schema / protocol / business rules / deterministic analysis only. APIs take `projectRoot: string` or plain JSON and preserve the `.repochan/` on-disk protocol.
- **`packages/skill`** is pure markdown (no build). It teaches agents how to run `repochan` subcommands and make creative judgments. Skills must not instruct agents to hand-edit `.repochan/` — writes go through the CLI.
- **`packages/cli`** (`repochan`) is the only published bin and the only binding surface. It must not embed an agent runtime or model loop. Business rules are delegated to `@repochan/core`.
- **`packages/image-gen`** is a library: prompt → image bytes. It may hold credentials (`~/.repochan/image.json` + env). Per-endpoint `mode` defaults to **`auto`** (classic OpenAI submit; host rules / explicit `openai-async` only when needed). Endpoints may set `auth.kind: codex` to authenticate via `codex login` (`~/.codex/auth.json`, read-only) and drive `gpt-image-2` through the native Codex `/responses` transport — refreshed access tokens are cached at `~/.repochan/codex-token-cache.json`, never written back to `~/.codex/`. It must **not** write protocol artifacts under `.repochan/`.
- **`packages/image-edit`** is a library: local pixel ops (slice / bg-remove / chroma-key / compress / resize / favicon / GIF). Zero network, zero credentials, no protocol awareness.
- **`packages/templates`** is pure YAML data for asset templates. Agents consume templates only via `repochan template list|get`.
- **`packages/starters`** is pure scaffold data: complete Astro/Tailwind project directories consumed via `repochan starter pull --starter <id>`. No build, no code exports. Each starter is a subdirectory with its own Astro `package.json` and sole manifest at `repochan/starter.json`. Mirrors `@repochan/templates` structure but holds whole-site scaffolds, not prompt YAML.
- **`packages/browse`** is the local protocol viewer behind `repochan browse`: a Vite+React SPA plus a thin `node:http` server bound to `127.0.0.1`. All `.repochan/` reads go through `@repochan/core` (no parallel schema). It is read-only over the protocol by default; the only writes are explicit action endpoints (`POST /api/actions/starter-sync`, `POST /api/actions/starter-preview`), and starter-source resolution/sync semantics stay in the CLI, injected as callbacks. Starter preview (install → astro build → serve dist, with a dist cache) is implemented here (`previewStarter`) and shared by `repochan starter preview`.

## Dependency direction (must stay acyclic)

```text
cli → core | skill | image-gen | image-edit | templates | browse → core
```

`@repochan/starters` is an independent publishable, not a CLI dependency: `repochan starter sync` downloads it on demand into `~/.repochan/starters/` (resolution: `--from` > `REPOCHAN_STARTERS_DIR` > cache > bundled package when present in dev).

Leaves never import `cli` or each other (except that `cli` alone aggregates).

## When changing code

- Protocol or business rules in core → run `pnpm --filter @repochan/core test` from the monorepo root.
- Reusable protocol/schema/rule code belongs in `@repochan/core`, not reimplemented in the CLI.
- New capabilities for agents should appear as `repochan` subcommands first; do not introduce a parallel MCP (or other) source of truth. MCP-over-CLI may be added later only as a thin wrapper.
- Prefer atomic CLI subcommands; orchestration stays in skills (agent-driven).

## Product invariants

1. No `repochan run` that “thinks” — the wizard skill + external agent orchestrate.
2. Foundation sheet first for visual consistency; downstream orders reference it.
3. Destructive overwrites require explicit `overwrite=true` (or equivalent).
4. Version `current.json` before replace; never silently drop history.
5. **`image-edit` is a page-assembly dependency, never a Painter dependency.** `repochan-web-designer` may use its CLI bindings while implementing an original project site; `repochan-page-designer` consumes it through atomic `repochan starter asset-apply` while localizing a pulled starter. Derived assets go into the assembled site's `public/` and never flow back into a source starter. One controlled exception: at `starter asset-apply` time, each postprocess step with `keep` ≠ `false` archives an audit copy of its artifacts under the applied order's `.repochan/orders/<id>/derived/` and appends to that order's `derived.json` index (`repochan.order-derived.v1`) — append-only, so audit history is never rewritten. Published order-result `versions/` directories and their `meta.json` bytes stay immutable after creation; the derived archive lives at order level and never touches them. Official Starter sources (`packages/starters/<id>/`) change only through reviewed contributions; `repochan-starter-designer` works in creator-owned directories and `repochan starter pull` copies a selected source into the output dir (default `.repochan/web-starter/`).

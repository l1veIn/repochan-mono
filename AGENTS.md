# RepoChan Monorepo Guidelines

> **Architecture baseline (2026-07-09+).**  
> Authoritative decisions: [`.plans/2026-07-09-repositioning.md`](./.plans/2026-07-09-repositioning.md).  
> Living overview: [`ARCHITECTURE.md`](./ARCHITECTURE.md).  
>
> **core + skill at the center · CLI is the sole binding surface · agent is BYO · no embedded runtime.**

## Package rules

- **`packages/core`** must remain a pure library: no agent runtime imports, no `ExtensionContext`, no creative-agent prompting, no image-provider credentials. Core owns schema / protocol / business rules / deterministic analysis only. APIs take `projectRoot: string` or plain JSON and preserve the `.repochan/` on-disk protocol.
- **`packages/skill`** is pure markdown (no build). It teaches agents how to run `repochan` subcommands and make creative judgments. Skills must not instruct agents to hand-edit `.repochan/` — writes go through the CLI.
- **`packages/cli`** (`repochan`) is the only published bin and the only binding surface. It must not embed an agent runtime or model loop. Business rules are delegated to `@repochan/core`.
- **`packages/image-gen`** is a library: prompt → image bytes. It may hold credentials (`~/.repochan/image.json` + env). Per-endpoint `mode` defaults to **`auto`** (classic OpenAI submit; host rules / explicit `openai-async` only when needed). It must **not** write protocol artifacts under `.repochan/`.
- **`packages/image-edit`** is a library: local pixel ops (slice / bg-remove / GIF). Zero network, zero credentials, no protocol awareness.
- **`packages/templates`** is pure YAML data for asset templates. Agents consume templates only via `repochan template list|get`.

## Dependency direction (must stay acyclic)

```text
cli → core | skill | image-gen | image-edit | templates
```

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

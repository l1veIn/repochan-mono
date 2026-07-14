# RepoChan

[中文文档](./README_zh.md) · [Architecture](./ARCHITECTURE.md)

**Turn any git repository into a living mascot persona and a consistent visual brand** — character sheets, icons, stickers, posters, and a landing page — driven by *your* coding agent.

RepoChan is an **LLM-native, local-first, agent-agnostic** creative production tracker. Hard constraints live in `@repochan/core` (schema + state machine + dependency gates). Creative judgment lives in platform-agnostic **skills**. The only binding surface is a thin CLI: `repochan`. There is **no embedded agent runtime** — bring Claude Code, Codex, Pi, Cursor, Hermes, or any shell-capable agent.

```text
core  keeps the rules   ·   skill  supplies the ideas   ·   cli  is the only door
agent is yours          ·   .repochan/ is the source of truth on disk
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design. The 2026-07-09 repositioning ADR is [`.plans/2026-07-09-repositioning.md`](./.plans/2026-07-09-repositioning.md).

---

## Packages

```text
packages/
├── core         @repochan/core         Protocol, schemas, entities, deterministic analysis
├── skill        @repochan/skill        Wizard + team skills (pure markdown)
├── cli          repochan               Sole bin — subcommands, setup, no runtime
├── image-gen    @repochan/image-gen    prompt → PNG (OpenAI-compatible endpoints)
├── image-edit   @repochan/image-edit   Slice / bg-remove / GIF (local, zero credentials)
├── templates    @repochan/templates    Built-in asset YAML templates
└── starters     @repochan/starters     Landing-page starters (full Astro/Tailwind scaffolds)
```

### Dependency direction

```text
cli ──┬──> core
      ├──> skill
      ├──> image-gen
      ├──> image-edit
      └──> templates
```

`core`, `image-gen`, `image-edit`, `templates`, and `skill` are leaves. Only the CLI aggregates them. Image libraries never write `.repochan/`; protocol writes always go through core.

| Package | Role | Loaded by |
|---------|------|-----------|
| `core` | `.repochan/` R/W, schema gates, state machine, analysis engine | CLI (and tests) |
| `skill` | How to run the pipeline (wizard + roles) | Your agent (via `repochan setup`) |
| `cli` | Deterministic subcommands + skill install | You / agent / CI |
| `image-gen` | Image generation + `~/.repochan/image.json` (modes: `openai` / `openai-async`) | `repochan image gen\|configure\|status\|probe` |
| `image-edit` | Local pixel ops | `repochan image edit …` |
| `templates` | Official asset templates | `repochan template list\|get` |

---

## How it works

### Artifact-centric pipeline

Every role produces a **schema-validated, versioned artifact** under `.repochan/`. Agents do not freestyle into the protocol tree — they call CLI commands; core validates and persists.

```text
.repochan/
  analysis/current.json          # Analyst
  interview/current.json         # Interviewer (optional)
  persona/current.json           # Creative team
  orders/<id>/order.json         # Art director briefs
  orders/<id>/versions/<vid>/    # Painter results (meta + images)
```

### Default experience: one sentence → full brand

You talk to **your agent**. The wizard skill (`repochan`) schedules the teams:

```text
① Analyst        → analysis
② Interviewer    → interview (optional)
③ Creative team  → persona
   ⏸ checkpoint: confirm persona
④ Art director   → all orders (foundation + downstream)
⑤ Painter        → foundation first, then downstream with refs
   ⏸ checkpoint: confirm foundation art
⑥ Page designer  → landing page / deploy prep
   ⏸ checkpoint: before deploy
```

| Mode | When | Behavior |
|------|------|----------|
| **Wizard (default)** | “Make me a mascot and site” | Full pipeline, stop at checkpoints |
| **yolo** | You say `yolo` / non-interactive CI | Skip checkpoints; orders created as `approved` |
| **Per-team (advanced)** | “Only run analysis” / “redraw this order” | Single team skill |

**Visual consistency** is anchored by a **foundation sheet** (character design cover). Downstream assets reference it. Core enforces dependency order — missing upstream → CLI fails.

---

## Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- A coding agent you already use (Claude Code, Codex, Pi, Cursor, Hermes, …)
- For image generation: an OpenAI-compatible images endpoint (direct OpenAI, relay, or local reverse-proxy)

```bash
node --version   # ≥ 18
pnpm --version   # ≥ 9
```

---

## Getting started

### From this monorepo

```bash
cd repochan-mono
pnpm install
pnpm --filter @repochan/core build
pnpm --filter repochan build

# Install skills into your agent + optional image configure
pnpm --filter repochan exec node dist/index.js setup
# or after linking/global install:
repochan setup
```

### Day-to-day usage

```bash
cd /path/to/your-project
repochan setup                 # one-time per agent/scope
# Open Claude Code / Codex / … and say:
#   "Give this repo a mascot and full brand assets"
#   "yolo, full pipeline"
#   "Only analyze this repository"
```

`repochan setup` copies bundled skills from `@repochan/skill` into the agent’s convention directory (e.g. `.claude/skills`, `.codex/skills`) and injects a short pointer into `CLAUDE.md` / `AGENTS.md` / etc. Use `--agent claude,codex`, `--global` / `--project`, `--list`, or `--remove` as needed.

Configure image generation (interactive or flags):

```bash
repochan image configure
# writes ~/.repochan/image.json  (keys via ${ENV_VAR} expansion)
```

---

## CLI reference

Protocol / inspection:

```bash
repochan init
repochan status [--json]
repochan inspect [--json]
repochan validate [--json]
```

Entities (agents use these; large JSON via `--data-file` or stdin):

```bash
repochan analysis run|get|update|enrich|versions
repochan interview get|create|append
repochan persona get|create|update|review|candidate …
repochan order list|get|create|update|set-status|add-revision|…
repochan order create-result|list-results|get-result|set-current|…
repochan order candidate create|promote
repochan order slice|extract-stickers
repochan foundation find
repochan starter pull
repochan review create
repochan protocol inspect|read|write
```

Images & templates:

```bash
repochan image gen --prompt "…" [--reference path] [--out path] [--endpoint id] [--mode openai|openai-async]
repochan image configure [--provider openai|custom|async|skip] [--base-url …] [--api-key …] [--endpoint-id …] [--mode …]
repochan image status
repochan image probe [--endpoint id]
repochan image edit slice <image> --rows N --cols M [--out dir]
repochan image edit bg-remove <image> [--out path]
repochan image edit gif-from-frames <frame…> [--out path] [--fps N]
repochan template list [--tag poster]
repochan template get official/foundation-sheet
```

Setup:

```bash
repochan setup [--agent claude|codex|pi|cursor|hermes|auto|all]
repochan setup --list
repochan setup --remove --agent claude
```

Most commands accept `--json` for machine-readable output. Write payloads: `--data-file path`, `--data-file -` for stdin, or pipe JSON when the option is omitted and stdin is not a TTY.

---

## Developer workflow

### Install & build

```bash
pnpm install
pnpm --filter @repochan/core build
pnpm --filter repochan build
# image-gen / image-edit also compile to dist/
pnpm --filter @repochan/image-gen build
pnpm --filter @repochan/image-edit build
```

`skill` and `templates` are pure data — no compile step.

### Tests

```bash
pnpm --filter @repochan/core test     # primary suite (protocol + rules)
pnpm --filter @repochan/image-gen test
pnpm --filter @repochan/image-edit test
pnpm --filter repochan test
pnpm test                             # monorepo root: build core then all package tests
```

**When you change core protocol or business rules, always run** `pnpm --filter @repochan/core test`.

### Dev CLI without global install

```bash
pnpm run cli:dev -- status
pnpm --filter repochan exec tsx src/index.ts validate --json
pnpm --filter repochan exec tsx src/index.ts analysis run
```

### Changed a skill?

No build. Re-run `repochan setup` (or rely on version-drift detection in `repochan status`) so agents pick up the new markdown.

### Changed core?

```bash
pnpm --filter @repochan/core build && pnpm --filter @repochan/core test
```

### Clean build

```bash
pnpm -r build
pnpm -r test
```

---

## Design principles (short)

1. **Constraints in code, judgment in prompts** — prefer deterministic gates over skill prose.
2. **CLI is the only binding surface** — agents shell out; MCP (if ever) is a thin wrapper over CLI.
3. **No embedded runtime** — no `repochan run` that “thinks”; the wizard skill + your agent do.
4. **Image libs do not write `.repochan/`** — bytes out; protocol in only via core.
5. **Credentials stay in image-gen** — `~/.repochan/image.json` + env; core/cli never see keys.
6. **Foundation-first consistency** — one visual anchor, then reference-driven downstream art.

Full rationale and known gaps: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Docs map

| Doc | Contents |
|-----|----------|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Layers, packages, binding model, gaps, principles |
| [`.plans/2026-07-09-repositioning.md`](./.plans/2026-07-09-repositioning.md) | Accepted ADR (core+skill center, pi-removal) |
| [`packages/skill/README.md`](./packages/skill/README.md) | Skill inventory |
| [`packages/core/README.md`](./packages/core/README.md) | Core API surface |
| [`packages/image-gen/README.md`](./packages/image-gen/README.md) | Generation config |
| [`packages/image-edit/README.md`](./packages/image-edit/README.md) | Pixel ops API |
| [`packages/templates/README.md`](./packages/templates/README.md) | Asset template package |
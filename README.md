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

Result creation/replacement and candidate promotion for the same order must be
serialized by the caller. Core rejects a new mutation while an active transaction
or retained recovery directory is present and reports its path; retry after the
first mutation completes, or recover the retained directory before continuing.
Final publication also compares the original `order.json` bytes, so a revision or
status update that completes during staging wins instead of being silently
overwritten. If rollback cannot complete, use `repochan order recovery list`,
`recover`, or `abort`; never hand-edit or delete transaction directories.
Recovery contends on the same order lock: an active publisher wins, while a
crashed same-host owner is reclaimed. A listed `staging_unprepared` transaction
predates protocol renames and is abort-only; `prepared` or `recovery_required`
transactions may be recovered to their manifest snapshot.
Each Core-created transaction also has an out-of-directory identity/nonce anchor;
recovery rejects hand-made directories, mismatched identities, fixed-path mapping
violations, and semantically invalid order/version backups. This protects against
accidental corruption and simple forged transaction directories, not an attacker
who can arbitrarily rewrite the entire workspace including both protocol state
and identity anchors. Generic `protocol write` cannot modify order-managed paths.

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
repochan order resolve-references <id>
repochan order candidate create|promote
repochan order slice|extract-stickers
repochan foundation find
repochan starter list [--tag] | get <id> | pull [--starter <id>]
repochan starter configure [--content-file <path>] [--repository-url <url>]
repochan starter create-order <slot> --intent <text> [--foundation <order-id>]
repochan starter asset-apply <slot> --order <order-id> [--result-version <id>]
repochan starter asset-import <slot> --file <path> [--overwrite]
repochan starter validate <id> | --all | --output-dir <dir>
repochan review create
repochan order recovery list <order-id>
repochan order recovery recover <order-id> <transaction-id>
repochan order recovery abort <order-id> <transaction-id>
repochan protocol inspect|read|write
```

`order create-result` is evidence-bearing: its payload must include at least one
readable, non-empty regular file. Core copies those files into the immutable
result version before it can advance the order to `delivered`; notes or paths
that do not exist cannot stand in for a deliverable. Candidate promotion repeats
the file check before changing the current-version pointer. Result replacement is
staged as a complete directory and rolls back both version and order state if
publication fails.

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
repochan setup [--agent claude|codex|cursor|pi|hermes|opencode|gemini|kiro|antigravity|auto|all] [--global|--project] [--overwrite]
repochan setup --list
repochan setup --remove --agent claude
```

Project setup never replaces an existing non-RepoChan Cursor/Kiro instruction
file by default. Move or merge that file, or pass `--overwrite` explicitly if
replacing that exact owned path is intentional.

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

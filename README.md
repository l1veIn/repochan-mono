# RepoChan Monorepo

[中文文档](./README_zh.md)

RepoChan turns a git repository into a living mascot persona and consistent visual brand assets (hero images, icons, stickers, etc.). It follows a **manual, user-controlled** creative pipeline: Analyst → Creative Writer → Art Director → Painter. Each role is a separate Pi skill that checks prerequisites before it works and asks before overwriting.

This monorepo contains four packages that share a stable `.repochan/` on-disk protocol.

## Architecture

```
packages/
├── core        @repochan/core        Pure TS library — protocol, schemas, entities, deterministic analysis. Zero Pi deps.
├── pi          repochan-pi           Pi package — unified `repochan` tool, `/order_panel` command, 6 role skills.
├── image-gen-pi @repochan/image-gen-pi Pi package — multi-provider image generation (Codex OAuth, FAL.ai, OpenAI, xAI).
└── cli         repochan              User-facing TUI — wizard, agent-driven role pages, CLI commands.
```

### How they connect

| Layer | What | Loaded by |
|-------|------|-----------|
| `core` | `.repochan/` reads/writes, `listOrders`, `createOrderResult`, deterministic analysis engine | Everything (pure JS lib) |
| `pi` | `repochan` tool (action-based API), 6 role skills, `/order_panel` | Pi agent via `settings.json` (written by `repochan setup`) |
| `image-gen-pi` | `image_generate` tool, `/image_model` command | Pi agent (same settings) |
| `cli` | TUI wizard, `repochan analyze/persona/foundation/paint`, `repochan validate` | End users at the terminal |

## The `.repochan/` protocol

```text
.repochan/
  config.json
  analysis/
    current.json
    versions/
  persona/
    current.json
    versions/
  orders/
    <order-id>/
      order.json
      versions/
        <version-id>/
          meta.json
          hero.png
```

- `analysis/current.json` — deterministic scan + LLM enrichment (Analyst)
- `persona/current.json` — living mascot character (Creative Writer)
- `orders/<id>/order.json` — commissioning briefs (Art Director)
- `orders/<id>/versions/<vid>/` — delivered image results (Painter)

Full spec: `docs/protocol.md`.

## Role pipeline

```
① Analyst          → .repochan/analysis/current.json
② Creative Writer  → .repochan/persona/current.json
③ Art Director     → foundation_sheet order (visual anchor)
④ Painter          → generates foundation → visual anchor established
⑤ Art Director     → downstream orders (auto-reference foundation)
⑥ Painter          → generates downstream assets with reference images
```

**Roles never auto-chain.** Each must be user-invoked. CLI uses `/skill:repochan-analysis` etc. via Pi's native command expansion.

---

## Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- **Pi CLI** (`pi`) — install from [pi.dev](https://pi.dev)
- **Pi login** — `pi login` (choose Codex OAuth for image generation)

```bash
# Verify
node --version   # ≥ 18
pnpm --version   # ≥ 9
pi --version     # ≥ 0.79
```

---

## Getting started (end-user path)

```bash
# 1. Install
cd repochan-mono
pnpm install

# 2. Register pi packages with Pi runtime (one-time)
pnpm --filter repochan exec tsx src/index.ts setup

# 3. Launch the TUI wizard
pnpm run cli
# or: pnpm --filter repochan exec tsx src/index.ts

# 4. Follow the wizard: Analyze → Persona → Foundation → Paint
```

The `setup` step reads each Pi package's `package.json > pi` manifest and writes resolved extension/skill paths to `~/.repochan/pi/settings.json`. The CLI runtime auto-loads all resources from there — no manual `-e` or `--skill` flags needed.

---

## CLI command reference

```bash
repochan                         # Interactive TUI wizard
repochan analyze                 # Run Analyst role
repochan persona                 # Run Creative Writer role
repochan foundation              # Run Art Director (foundation sheet)
repochan paint [order-id]        # Run Painter for an order
repochan setup                   # Register bundled pi packages
repochan init                    # Initialize .repochan/ protocol directories
repochan status [--json]         # Protocol overview
repochan inspect [--json]        # Raw inspection summary
repochan validate [--json]       # Validate protocol artifacts
repochan order list [--json]     # List all orders
repochan order get <id> [--json] # Read one order
repochan model                   # Open model/login setup in TUI
```

---

## Developer workflow

### 1. Install and build

```bash
cd repochan-mono
pnpm install
pnpm --filter @repochan/core build   # core must be built (TS → dist/)
```

Other packages do `--noEmit` (type-check only) — Pi loads them as-is via jiti.

### 2. Run tests

```bash
pnpm --filter @repochan/core test    # 23 tests, the only test suite
pnpm --filter repochan-pi test       # type-check only
pnpm --filter repochan run test      # build + vitest (CLI)
```

### 3. Developing Pi packages (`repochan-pi` + `image-gen-pi`)

The fastest dev loop uses `pi -e` (load extension) and `--skill` (load skills directory):

```bash
# Load both pi packages together — extensions + skills auto-discovered
pi -e ./packages/pi/extensions/repochan.ts \
    -e ./packages/image-gen-pi/extensions/index.ts \
    --skill ./packages/pi/skills

# Inside the session:
#   /order_panel              → browse order results + inline image preview
#   /skill:repochan-analysis  → run Analyst
#   /skill:repochan-persona   → run Creative Writer
#   /image_model              → select image generation provider
```

**Load only the repochan package** (no image-gen):

```bash
pi -e ./packages/pi/extensions/repochan.ts \
    --skill ./packages/pi/skills
```

**Non-interactive test** (one-shot, good for verifying tool registrations):

```bash
pi -e ./packages/pi/extensions/repochan.ts \
    --skill ./packages/pi/skills \
    --print "/skill:repochan-analysis" \
    --thinking off
```

### 4. Developing the CLI

```bash
# Build from source (includes tsc + chmod)
pnpm --filter repochan run build

# Run directly without build (jiti on-the-fly)
pnpm run cli:dev
# or: pnpm --filter repochan exec tsx src/index.ts

# Run a specific phase
pnpm --filter repochan exec tsx src/index.ts analyze
pnpm --filter repochan exec tsx src/index.ts persona
pnpm --filter repochan exec tsx src/index.ts paint ord-foundation-001

# Check protocol state
pnpm --filter repochan exec tsx src/index.ts validate --json
```

**How CLI role pages work:** Each page (AnalysisPage, PersonaPage, etc.) creates a Pi agent session via `startRoleSession()`, then sends `/skill:repochan-analysis` (or equivalent) as the first prompt. Pi's `_expandSkillCommand` expands the skill into full context. The `AgentStatus` component renders live tool-call events, token stats, and session state.

### 5. Testing image generation

```bash
# In a Pi session with both packages loaded:
/image_model                 # Pick provider (interactive selector)
# Then just describe what you want:
#   > Generate a pixel-art sword icon, 32x32, blue blade, gold hilt

# Or configure directly via env vars / config files (see packages/image-gen-pi/README.md)
```

### 6. Running against another project

```bash
cd /path/to/another-project
pnpm --dir /path/to/repochan-mono --filter repochan exec tsx src/index.ts analyze
# or install repochan globally and run: repochan analyze
```

### 7. Validating protocol integrity

```bash
# After making core changes, always run:
pnpm --filter @repochan/core test

# Check .repochan/ structure
repochan validate --json
pnpm --filter @repochan core test  # validates the same logic
```

---

## Common dev tasks

### Changed core protocol? Run:
```bash
pnpm --filter @repochan/core build && pnpm --filter @repochan/core test
```

### Changed a skill (SKILL.md)? No build needed — Pi reads .md directly.
```bash
# Reload extensions/skills in an active Pi session:
/reload
```

### Changed unified.ts or any extension? Run:
```bash
pnpm --filter repochan-pi run lint   # type-check only
```

### Changed CLI pages or runtime?
```bash
pnpm --filter repochan run build     # tsc + chmod
```

### Clean build everything:
```bash
pnpm --filter @repochan/core build
pnpm --filter repochan-pi run lint
pnpm --filter @repochan/image-gen-pi run lint
pnpm --filter repochan run build
```

---

## Package details

| Package | npm name | Main artifact | Consumer |
|---------|----------|---------------|----------|
| `packages/core` | `@repochan/core` | `dist/index.js` (compiled) | Everything |
| `packages/pi` | `repochan-pi` | `extensions/repochan.ts` (jiti) | Pi agent |
| `packages/image-gen-pi` | `@repochan/image-gen-pi` | `extensions/index.ts` (jiti) | Pi agent |
| `packages/cli` | `repochan` | `dist/index.js` (compiled) | Terminal users |

## Protocol docs

- Full spec: `docs/protocol.md`
- Migration from Python prototype: `docs/from-reponyan-to-repochan.md`
- Minimal fixture (inspectable without running AI): `examples/minimal`

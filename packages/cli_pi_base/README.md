# RepoChan CLI

The user-facing terminal UI and command-line interface for RepoChan. It orchestrates the creative pipeline roles, surfaces `.repochan/` state, and ships with bilingual i18n.

- `repochan` launches the interactive wizard (smart entry: guided until the foundation visual exists, then the Home dashboard).
- `repochan analyze / persona / foundation / paint` jump straight to a role page.
- `repochan init / status / inspect / validate` manage and inspect the `.repochan/` protocol.
- `repochan order ...` and `repochan asset ...` inspect generated artifacts.
- `repochan setup` registers the bundled Pi packages (`repochan-pi`, `@repochan/image-gen-pi`) with the local Pi runtime.
- `repochan model` configures image-generation provider/login.

Page design (`repochan-page-designer` role) is invoked through the Pi skill system inside a session rather than a dedicated CLI subcommand.

## i18n

The CLI supports **English and 中文**. Language is selected on first launch (persisted to settings) and can be changed anytime via the in-TUI language page (`LanguageHost`). Locale sources:

- `src/locales/en.ts`
- `src/locales/zh.ts`

Translation lookup goes through `src/i18n.ts`. To add a locale, add a new file under `src/locales/` and register it in `i18n.ts`.

## Source layout

```
src/
├── index.ts            Entry: arg parsing, routing, wizard vs. direct-page launch
├── i18n.ts             Locale resolver
├── types.ts            Shared CLI types
├── locales/            en.ts, zh.ts
├── pages/              TUI screens — home, wizard, analysis, persona, foundation, paint,
│                       sessions, model, language, settings, create-task, order-detail, orders, interview
├── components/         Reusable TUI widgets — agent-status, confirm-list, prompt-input
├── commands/           Deterministic subcommands — init, status, inspect, validate, order, asset, setup, common
├── lib/                Runtime helpers — runtime, protocol, settings-manager, onboarding, precondition, extension-ui
└── ui/                 Layout primitives — layout, theme, detail
```

- **Pages** are TUI screens. Each role page (e.g. `AnalysisPage`, `PersonaPage`) starts a Pi agent session via `startRoleSession()` and sends the matching `/skill:repochan-*` command as the first prompt; `AgentStatus` renders live tool-call events and token stats.
- **Commands** are deterministic (no LLM) — they read `.repochan/` directly via `@repochan/core` and print JSON or formatted text.
- **lib** bridges the Pi runtime, manages `~/.repochan/pi/settings.json`, and enforces role preconditions.

## Architecture fit

The CLI is the top of the dependency graph — it composes `@repochan/core` (protocol/schema/rules), `repochan-pi` (role skills + `repochan` tool), and `@repochan/image-gen-pi` (image generation). It implements **no business rules itself**; every state transition is delegated to core. See the monorepo [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for the layer model.

## Development

```bash
pnpm --filter repochan run build      # tsc + chmod +x dist/index.js
pnpm run cli                          # run the built binary
pnpm run cli:dev                      # run via tsx (no build needed)
pnpm --filter repochan run test       # build + vitest
pnpm --filter repochan run lint       # tsc --noEmit
```

Run a single phase during development:

```bash
pnpm --filter repochan exec tsx src/index.ts analyze
pnpm --filter repochan exec tsx src/index.ts persona
pnpm --filter repochan exec tsx src/index.ts paint ord-foundation-001
pnpm --filter repochan exec tsx src/index.ts validate --json
```

See the monorepo root [`README.md`](../../README.md) for the full end-user and developer workflow.

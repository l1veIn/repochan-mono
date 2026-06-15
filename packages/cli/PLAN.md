# RepoChan CLI Plan

This file is the single source of truth for the first CLI implementation handoff and the planned follow-up milestones.

## Product definition

`repochan` is a RepoChan-specific agent application built on the Pi SDK.

The default user experience is:

```bash
cd my-project
repochan
```

The CLI should guide the user from model/auth setup through the complete RepoChan workflow:

1. Inspect or initialize `.repochan/`.
2. Run deterministic repository analysis.
3. Generate a mascot/persona.
4. Create structured asset orders.
5. Ask the user to review/approve orders.
6. Execute approved painter work through the agent/image capabilities available in the session.
7. Save assets into `.repochan/assets/`.
8. Browse/open/export the final brand kit.

The CLI is not merely a protocol utility. It is a vertical RepoChan agent app. It still includes deterministic subcommands for CI, debugging, and protocol management.

## Package position in the monorepo

```text
packages/
  core/   # pure protocol, schemas, deterministic analysis, entity operations
  pi/     # Pi package: repochan tool, skills, /repochan_panel
  cli/    # CLI app: `repochan`, powered by Pi SDK and RepoChan resources
```

Dependency direction:

```text
@repochan/core
    ↑
repochan-pi
    ↑
repochan CLI package (`repochan`)
```

The CLI may also import `@repochan/core` directly for deterministic commands. It must do so for all deterministic protocol/entity operations.

## Reviewer constraints

- CLI deterministic code MUST import from `@repochan/core` for all protocol/entity operations.
- Do not duplicate logic from `packages/core/src/entities.ts`, `packages/core/src/protocol/*`, schemas, or core validators.
- `packages/core` remains a pure library: no Pi imports, no `ExtensionContext`, no creative-agent prompting logic.
- Creative/workflow guidance lives in CLI conductor prompts plus the canonical RepoChan skills from `repochan-pi`.
- Always respect `.repochan/` preconditions and approval gates: persona requires analysis; orders require analysis and persona; painter delivery requires approved/in-progress orders unless the user explicitly approves an exception.
- Destructive writes and overwrites require explicit user approval. Prefer versioned/additive writes.
- The CLI must not silently modify the user's normal Pi package/settings environment.

## Package dependencies and `package.json`

`packages/cli/package.json` publishes the binary named `repochan`:

```json
{
  "name": "repochan",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "repochan": "./dist/index.js"
  },
  "files": ["dist", "README.md", "PLAN.md", "package.json"]
}
```

Runtime dependencies:

- `@repochan/core: workspace:*` — deterministic protocol operations, analysis, validation helpers.
- `repochan-pi: workspace:*` — canonical RepoChan Pi extension and skills.
- CLI command routing currently uses a small hand-written parser to avoid extra dependencies.
- `picocolors` — concise terminal output.
- `@earendil-works/pi-coding-agent` — Pi SDK runtime, model/auth/session/resource loading, and `InteractiveMode` for M2 chat and later guided modes. M1 deterministic commands still do not require a model.
- Later milestones may also add a lightweight prompt dependency for pre-TUI setup.

Build/test scripts should align with the monorepo and emit runnable JS:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json && chmod +x dist/index.js",
    "cli": "node dist/index.js",
    "test": "pnpm run build && vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  }
}
```

`packages/cli/tsconfig.json` extends `../../tsconfig.base.json`, includes `src/**/*.ts`, and emits to `dist/` for the binary.

## Required small change in `repochan-pi`

Add a public resource helper so the CLI can resolve canonical RepoChan resources without guessing package paths:

```ts
import { fileURLToPath } from "node:url";
import path from "node:path";

export function getRepoChanPiResources() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return {
    extensionPath: path.join(dir, "extensions", "repochan.ts"),
    skillsPath: path.join(dir, "skills"),
  };
}
```

Implementation guidance:

- Recommended source location: `packages/pi/resources.ts`, next to top-level `extensions/` and `skills/`.
- Use `import.meta.url`, `fileURLToPath`, and `path.dirname()` so path resolution works when installed through a pnpm workspace, `pnpm link`, or a published npm package.
- Export it as `repochan-pi/resources`.
- Because `repochan-pi` is primarily loaded by Pi/jiti from TypeScript today, keep changes minimal and non-breaking. If the CLI needs standard Node ESM at runtime, provide or export a compiled/runtime JS resource helper as needed while keeping the TypeScript source as the canonical implementation.
- Current pragmatic packaging hack: `packages/pi/tsconfig.json` uses `noEmit`, so `resources.ts` is canonical for type-checking/Pi+jiti, while sibling `resources.js` and `resources.d.ts` must be manually kept in sync for standard Node ESM imports from the CLI.
- Add the helper file(s) to `files` so published packages include them.
- Keep the returned paths absolute and matching the current layout: `skills/` and `extensions/` are direct children of `packages/pi`.

Expected API:

```ts
import { getRepoChanPiResources } from "repochan-pi/resources";

const { extensionPath, skillsPath } = getRepoChanPiResources();
```

## CLI source layout

```text
packages/cli/
  package.json
  tsconfig.json
  PLAN.md
  src/
    index.ts

    app/
      pi-runtime.ts          # create Pi SDK runtime/session/services for RepoChan (M2+)
      run-guided.ts          # default `repochan` (M3+)
      run-chat.ts            # `repochan chat` (M2+)
      run-phase.ts           # `repochan phase <phase>`; `run` compatibility alias (M4+)
      install-pi-package.ts  # explicit install into normal Pi environment (M5)
      conductor.ts           # conductor prompts and workflow policy
      auth-model.ts          # model/auth preflight using Pi SDK AuthStorage/ModelRegistry (future)

    commands/
      inspect.ts             # deterministic
      validate.ts            # deterministic (M5)
      order.ts               # deterministic helpers
      asset.ts               # deterministic helpers

    ui/
      output.ts              # json/table/text output helpers
      errors.ts              # user-friendly error formatting
      prompts.ts             # setup prompts before InteractiveMode (later)

    resources.ts             # wrapper around repo chan pi resource helper
```

## Conductor & resources

The CLI uses two layers:

1. **Deterministic resource/protocol layer** — direct imports from `@repochan/core` for `inspect`, order listing/getting, asset listing/getting, and future validation.
2. **Agent conductor layer** — Pi SDK runtime with `repochan-pi` extension/skills loaded through `getRepoChanPiResources()` plus a small CLI conductor prompt.

The conductor prompt belongs in `packages/cli/src/app/conductor.ts` initially. It should not replace role skills; it should coordinate them:

- Inspect protocol state before deciding the next step.
- Never skip required upstream artifacts.
- Use the `repochan` tool for `.repochan/` writes in agent workflows.
- Prefer deterministic `analysis.run` before creative persona/order work.
- Preserve approval gates for order approval and destructive writes.
- After asset delivery, suggest `/repochan_panel` or deterministic asset commands.

Potential future migration: `packages/pi/skills/repochan-conductor/SKILL.md` if plain Pi users should access the same guided workflow.

## Commands

### Default status and explicit app

```bash
repochan
```

Behavior:

1. Detect `cwd` and project name.
2. Inspect protocol state using `@repochan/core`.
3. Print normal CLI output and exit.

Interactive screens are explicit:

```bash
repochan app
repochan app guided
repochan guided
```

Guided behavior:

1. Continue the latest RepoChan session by default; provide `--new` to force a new guided session.
2. Check model/auth availability through Pi SDK.
3. If no usable model is configured, guide user through provider/API-key/model selection where practical.
4. Start the custom RepoChan TUI with RepoChan extension, skills, and conductor prompt loaded.
5. Send an initial guided workflow message.

This mode should keep approval gates:

- Analysis can run automatically.
- Persona can be generated automatically, but should be shown to the user.
- Orders must be reviewed/approved before painter work.
- Painter executes only approved/in-progress orders.
- Destructive overwrites require explicit user approval.

### Chat mode

```bash
repochan chat
```

Starts a Pi-like interactive TUI preconfigured for RepoChan:

- RepoChan tool loaded.
- RepoChan skills loaded.
- RepoChan conductor instructions appended.
- `/repochan_panel` available.
- Normal Pi commands such as `/model`, `/login`, `/settings`, `/resume`, `/compact` should remain available when using `InteractiveMode`.

First implementation should reuse Pi SDK `InteractiveMode` rather than building a custom TUI. OAuth/subscription auth is deferred to `/login` inside chat for the initial implementation.

### Single-phase agent commands

```bash
repochan phase analysis
repochan phase persona
repochan phase orders --goal "README hero and icon set"
repochan phase painter --order ord-hero-001
```

These commands use Pi SDK and RepoChan skills/tool. They are agent commands, not pure deterministic commands. `repochan run ...` remains a compatibility alias, but `phase` is the preferred public wording because it better signals an interactive constrained session.

Each phase should prompt the agent with a constrained task:

- Use the relevant RepoChan skill.
- Use the `repochan` tool for protocol writes.
- Respect preconditions and approval gates.
- Stop after completing the requested phase.

For now, do not expose a separate deterministic `repochan analysis run` command. Deterministic analysis stays internal to guided/agent workflows until the CLI API has stabilized.

### Deterministic protocol commands

These commands do not require a model:

```bash
repochan inspect [--json]
repochan validate [--json]
repochan order list [--json]
repochan order get <order-id> [--json]
repochan asset list [--json]
repochan asset get <asset-id> [--json]
```

They use `@repochan/core` directly and support machine-readable output:

```bash
repochan inspect --json
repochan asset list --json
```

`repochan validate` is implemented in M5 and is read-only. It calls `@repochan/core` validation helpers built on `inspectProtocol`, `listOrders`, `listAssets`, and shared id/status validators. It reports missing upstream artifacts, unreadable JSON, invalid order statuses/schema versions, missing asset manifests, invalid current asset versions, and missing order references. Future deterministic helpers may include order approval, asset opening, export, and brand-kit commands.

### Optional Pi installation command

```bash
repochan setup
```

This explicitly installs RepoChan into the user's normal Pi environment so plain `pi` can use RepoChan skills/tool.

The CLI must not silently modify global Pi package settings. Installation/update of `repochan-pi` into normal Pi settings happens only through this explicit command. M5 implements a confirmation-first flow: it explains that the package provides the RepoChan Pi extension and skills, shows the source and Pi agent dir, asks `Proceed with installation? (y/N)`, and only then constructs Pi SDK `DefaultPackageManager` with `cwd`, `agentDir`, and `SettingsManager`, calls `install`, persists the source with `addSourceToSettings`, and flushes settings. Default source is `npm:repochan-pi`; `--local` uses the detected workspace `packages/pi` source for monorepo development while still requiring confirmation. `repochan install-pi-package` remains a compatibility alias.

## Pi SDK runtime design

Use Pi SDK runtime APIs rather than shelling out to `pi`.

Important SDK pieces to verify during M2:

- `AuthStorage.create()` — reuse Pi auth storage.
- `ModelRegistry.create(authStorage)` — discover configured/available models.
- `SettingsManager.create()` — reuse Pi settings.
- `SessionManager.create(cwd)` — persistent sessions for RepoChan runs.
- `DefaultResourceLoader` — load RepoChan extension/skills plus normal user/project resources as appropriate.
- `createAgentSessionRuntime` / `createAgentSessionServices` / `createAgentSessionFromServices` — build runtime.
- `InteractiveMode` — first implementation of chat/guided TUI.
- Pi setup components — `repochan login`, `repochan model`, and `repochan settings` use standalone TUI screens built from Pi's exported selector/dialog components instead of entering RepoChan app or chat.

Initial `pi-runtime.ts` should expose something like:

```ts
export async function createRepoChanRuntime(options: {
  cwd: string;
  initialSession?: "new" | "continue";
}) {
  // returns runtime plus diagnostics/model fallback info
}
```

The runtime will use the resource helper:

```ts
const resources = getRepoChanPiResources();
const loader = new DefaultResourceLoader({
  cwd,
  agentDir: getAgentDir(),
  additionalExtensionPaths: [resources.extensionPath],
  additionalSkillPaths: [resources.skillsPath],
  appendSystemPrompt: [repochanConductorPrompt],
});
```

## Auth/model setup policy

The CLI should reuse Pi's auth/model ecosystem.

Preferred behavior:

1. Load `AuthStorage.create()` and `ModelRegistry.create(authStorage)`.
2. Call `modelRegistry.getAvailable()`.
3. If at least one model is available, let Pi settings/default model selection handle it or show a concise selector.
4. If no models are available, direct the user to `repochan login`; do not require opening chat.
5. Store credentials through `AuthStorage`, not a RepoChan-specific auth file.
6. `repochan login` and `repochan model` should mount Pi's exported TUI components directly. Do not simulate `/login` or `/model` through chat.

## First implementation milestones

### Milestone 1: skeleton + deterministic commands

- Add `packages/cli` package.
- Add binary entry `repochan`.
- Add wrapper `src/resources.ts` that calls `repochan-pi/resources` for later milestones.
- Implement:
  - `repochan inspect [--json]`
  - `repochan order list [--json]`
  - `repochan order get <order-id> [--json]`
  - `repochan asset list [--json]`
  - `repochan asset get <asset-id> [--json]`
- Wire package build/test.
- Keep default `repochan` as a deterministic status command; `repochan app` opens the custom overview. `repochan phase ...` is the preferred single-phase agent entry, with `run` kept as a compatibility alias. `repochan chat` is implemented in M2.

### Milestone 2: Pi resource reuse and chat

- Add/use `repochan-pi/resources` helper export.
- Implement `createRepoChanRuntime()` with Pi SDK `AuthStorage`, `ModelRegistry`, `SettingsManager`, `SessionManager`, `DefaultResourceLoader` resource options, and `createAgentSessionRuntime`.
- Start `repochan chat` using `InteractiveMode` with RepoChan extension/skills loaded.
- If no model is configured, do not crash during preflight; open chat with a warning so `/login` and `/model` remain available.
- Add standalone `repochan login`, `repochan model`, and `repochan settings` setup screens that do not enter RepoChan app or chat.

### Milestone 3: default guided flow

- Implement default `repochan` command.
- Continue latest RepoChan session by default; support `--new`.
- Add auth/model preflight.
- Add initial conductor prompt.
- Start guided workflow in `InteractiveMode`.

Implementation notes:

- `repochan` prints deterministic status. `repochan app`, `repochan guided`, and `repochan guide` enter the interactive app/guided modes.
- Guided mode reuses `createRepoChanRuntime()` with `initialSession: "continue"` by default and `initialSession: "new"` when `--new` is passed.
- The guided kickoff message asks the agent to inspect state with `repochan` action `protocol.inspect`, summarize the next safe step, and avoid writes/role chaining until user approval.
- If no configured model is detected, guided mode still opens InteractiveMode so the user can run `/login`, `/model`, or `/repochan_panel` inside the TUI.

### Standalone Pi setup commands

- `repochan login` opens a Pi-native authentication flow directly.
- `repochan model` opens Pi's model selector directly.
- `repochan settings` opens a small standalone settings launcher; v1 contains Login and is designed to grow with settings such as language.
- Only `repochan app` / `repochan tui` open RepoChan app pages. `repochan app settings` can remain as an informational app page, but top-level setup commands must not enter RepoChan app.

### Milestone 4: phase commands

- Implement:
  - `repochan phase analysis`
  - `repochan phase persona`
  - `repochan phase orders --goal ...`
  - `repochan phase painter --order ...`
  - `repochan run ...` as a compatibility alias
- Keep deterministic analysis as an internal implementation detail for guided/agent analysis in this phase.

Implementation notes:

- `src/app/run-phase.ts` parses phase flags, builds constrained single-phase prompts, and starts Pi `InteractiveMode` through `createRepoChanRuntime()`.
- Phase sessions continue the latest RepoChan session by default and use `--new` for a fresh session, matching guided/chat behavior.
- Phase prompts require the matching RepoChan skill, `repochan` tool writes/state changes, strict prerequisites, and no automatic chaining into later phases.

### Milestone 5: install helper and polish

- Add `repochan setup` with `repochan install-pi-package` as a compatibility alias.
- Add validation and additional deterministic protocol helpers.
- Add friendly errors and docs.
- Add smoke tests.

**Completed.**

Implementation notes:

- `src/app/install-pi-package.ts` parses `--local`, builds an install plan, prints the package/settings impact, and requires explicit `y`/`yes` confirmation before invoking the Pi SDK package manager. A declined prompt exits without settings changes; an accepted prompt uses `DefaultPackageManager.install()`, `addSourceToSettings()`, and `SettingsManager.flush()`.
- `src/commands/validate.ts` delegates to `@repochan/core` `validateProtocol()` and supports friendly text plus `--json` machine-readable output.
- Core `listOrders()` and `listAssets()` are kept read-only for deterministic inspection/validation; mutating operations still call `initProtocol()` explicitly.
- README/help text now list install and validation commands, and errors include suggestions for inspect/validate/help where appropriate.

## Testing strategy

Deterministic commands:

- Unit tests using temporary `.repochan/` fixtures.
- JSON output snapshots for inspect/list/get commands.
- Smoke run the built binary from a temporary directory to avoid mutating the monorepo workspace.

Agent commands:

- Smoke tests that create a Pi SDK session with no model invocation where possible.
- Runtime construction tests that verify RepoChan extension and skills are discoverable.
- Manual local tests with a real configured model before release.

Recommended local smoke commands once implemented:

```bash
pnpm --filter @repochan/core build
pnpm --filter repochan-pi build
pnpm --filter repochan build
pnpm --filter repochan cli inspect
pnpm --filter repochan cli inspect --json
pnpm --filter repochan exec node dist/index.js inspect
pnpm --filter repochan exec node dist/index.js inspect --json
pnpm --filter repochan exec node dist/index.js order list
pnpm --filter repochan exec node dist/index.js asset list --json
```

For runtime helper verification:

```bash
pnpm --filter repochan exec node --input-type=module -e 'import { getRepoChanPiResources } from "repochan-pi/resources"; console.log(getRepoChanPiResources())'
```

## Open decisions resolved for initial implementation

1. **Default session behavior:** continue the latest RepoChan session by default; add `--new` to force a new guided session.
2. **OAuth behavior:** top-level `repochan login` supports subscription/OAuth and API-key setup through Pi-native components; chat still supports `/login`.
3. **Painter image execution:** keep painter execution through the agent/image capabilities available in the Pi session for now. Direct CLI image adapters are a future option, not part of M1-M4.
4. **Pi package installation:** only via explicit `repochan setup` (`install-pi-package` compatibility alias); never automatic.
5. **Deterministic analysis command:** do not expose a separate deterministic `repochan analysis run` yet. Keep deterministic analysis internal to guided/phase workflows until the CLI API stabilizes.

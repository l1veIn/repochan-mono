# RepoChan Monorepo

RepoChan is split into two pnpm workspace packages:

- `packages/core` — `@repochan/core`, a pure TypeScript library for the `.repochan/` protocol, schemas, normalization, validation, and entity file operations.
- `packages/pi` — `repochan-pi`, the public Pi package that registers the `repochan` tool, `/repochan_panel`, and ships the RepoChan skills.

## Bootstrapping (for developers / contributors)

```bash
cd repochan-mono
pnpm install
```

For normal end users there is no bootstrapping — they just run `pi install repochan-pi` after release.

## Recommended Development Workflow

### Developing @repochan/core (pure protocol + schemas + business rules)

```bash
# Run tests (recommended after any core change)
pnpm --filter @repochan/core test

# Build (produces dist/ — required for some loaders / consumers)
pnpm --filter @repochan/core build
```

Core must stay completely independent of Pi (no `ExtensionContext`, no agent prompting logic). All public APIs accept `projectRoot: string` (or plain data) and preserve the exact on-disk `.repochan/` format.

### Developing the Pi package (`repochan-pi`)

The Pi package lives at `packages/pi`. It depends on `@repochan/core` via workspace.

**Loading the extension during development (recommended):**

```bash
# Best from monorepo root (ensures correct pnpm workspace resolution)
pnpm exec pi -e ./packages/pi/extensions/repochan.ts -p "protocol.inspect"

# Alternative: cd into the package first
cd packages/pi
pnpm exec pi -e ./extensions/repochan.ts -p "protocol.inspect"
```

**Running skills (the manual multi-role workflow):**

Skills are at `packages/pi/skills/`. Use them exactly as before:

```text
/skill:repochan-analysis
/skill:repochan-persona
/skill:repochan-art-director
/skill:repochan-painter
/skill:repochan-protocol
```

The unified management tool is registered as `repochan` (with actions like `analysis.run`, `order.create`, `asset.create_version`, `protocol.inspect`, etc.). This is the stable public surface for all entity management.

The TUI asset browser (`/repochan_panel`) is included by default when the package is active (for the seamless experience). See packages/pi/README.md for details and the current known pi-tui compositor limitation with image-heavy sessions + overlays.

**Full local verification (after changes):**

```bash
pnpm install
pnpm --filter @repochan/core build
pnpm --filter @repochan/core test
pnpm exec pi -e ./packages/pi/extensions/repochan.ts -p "protocol.inspect"
```

## Installation (for end users)

Once published, the recommended command is simply:

```bash
pi install repochan-pi
```

(If your Pi version prefers explicit registry syntax, `pi install npm:repochan-pi` should also work.)

This gives you the full default experience: the `repochan` unified tool, all role skills, and the `/repochan_panel` visual asset browser command.

You do **not** install `@repochan/core` directly as an end user — it is an internal dependency of the `repochan` Pi package (and can be used separately by dashboards or other tools).

## Local development / pre-publish testing

From inside this monorepo:

```bash
# Install the Pi package from local source
pi install ./packages/pi

# Recommended for active development
pnpm exec pi -e ./packages/pi/extensions/repochan.ts -p "protocol.inspect"
# (This loads the full default experience: unified `repochan` tool + /repochan_panel command + all skills)
```

See the "Recommended Development Workflow" section above for the full monorepo commands.

## Publishing / Consumption (advanced)

- `@repochan/core` is published as a normal npm library. Dashboards, other Pi packages, or CLIs can `npm install @repochan/core` (or pnpm equivalent) to get the protocol, schemas, and safe file primitives without pulling in any Pi-specific code.
- The public Pi package (`repochan-pi`) is what normal users install via `pi install repochan-pi`.

The on-disk `.repochan/` format and all public tool actions / prompt guidelines are unchanged.

## Project Guidelines

See `AGENTS.md` (monorepo-wide rules) and `packages/pi/AGENTS.md` (Pi-specific rules).

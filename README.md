# RepoChan Monorepo

RepoChan turns a repository into an inspectable mascot and brand-asset workflow. It is organized as a small protocol core, a Pi package for agent roles, and a CLI app for normal users.

## Packages

- `packages/cli` — `repochan`, the user-facing CLI. Running `repochan` starts the first-run wizard: Pi setup, analysis, persona, first asset order, Painter, then the RepoChan app.
- `packages/core` — `@repochan/core`, a pure TypeScript library for the `.repochan/` protocol, schemas, validation, deterministic analysis, and entity operations.
- `packages/pi` — `repochan-pi`, the Pi package that registers the unified `repochan` tool, `/order_panel`, and role skills.

## User Entry Points

```bash
# Normal CLI app
repochan

# Pi resources for plain Pi sessions
pi install repochan-pi

# Deterministic checks
repochan inspect
repochan validate --json
```

`repochan login`, `repochan model`, and `repochan settings` reuse Pi's auth/model setup directly. RepoChan's own lightweight preferences live in `~/.repochan/settings.yaml`; API keys and model credentials stay in Pi storage.

## Developer Workflow

```bash
cd repochan-mono
pnpm install

pnpm --filter @repochan/core test
pnpm --filter repochan-pi build
pnpm --filter repochan test
```

For local CLI testing against arbitrary repositories, use the helper launcher:

```bash
chmod +x scripts/repochan
cd /path/to/another-project
../repochan-mono/scripts/repochan validate
```

For Pi package development:

```bash
pnpm exec pi -e ./packages/pi/extensions/repochan.ts -p "protocol.inspect"
```

## Protocol And Examples

- Protocol spec: `docs/protocol.md`
- Minimal fixture: `examples/minimal`
- Migration notes from the old Python prototype: `docs/from-reponyan-to-repochan.md`

The on-disk `.repochan/` format is the stable contract between CLI, Pi skills, future dashboards, and external tools.

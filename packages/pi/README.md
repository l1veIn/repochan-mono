# RepoChan

RepoChan is a Pi package for a manual, multi-role creative workflow that turns git repositories into rich, consistent visual brand assets: RepoChan mascot personas, illustration briefs, asset orders, and order result versions.

RepoChan follows Pi's philosophy: small impact, explicit user control, progressive disclosure, and extensible tools. It does **not** auto-chain roles in v1. Each role checks the `.repochan/` workspace protocol before it works and asks the user before overwriting existing outputs.

## Install (for end users)

After this package is published to npm, the normal command is:

```bash
pi install repochan-pi
```

(or `pi install npm:repochan-pi` on some Pi versions).

While developing inside this monorepo, use one of these instead:

```bash
# From the monorepo root
pi install ./packages/pi

# Or for active hacking (recommended)
pnpm exec pi -e ./packages/pi/extensions/repochan.ts ...
```

See the root `README.md` for the complete development workflow.

## Development (from the monorepo)

This package lives inside the monorepo at `packages/pi`. See the root `README.md` for the full recommended workflow and the authoritative commands.

Quick commands:

```bash
# From monorepo root
pnpm exec pi -e ./packages/pi/extensions/repochan.ts -p "protocol.inspect"

# Or from inside this directory
cd packages/pi
pnpm exec pi -e ./extensions/repochan.ts ...
```

Remember to run `pnpm install` from the monorepo root first.

## Skills

- `repochan` — overview, recommended manual workflow, role map.
- `repochan-analysis` — Analyst role; deep 8-step repository analysis.
- `repochan-persona` — Creative Writer role; RepoChanPersona generation with anti-overfit rules.
- `repochan-art-director` — Art Director/Product Manager role; structured Asset Orders.
- `repochan-painter` — Painter role; professional commissioning mindset and order-result delivery.
- `repochan-protocol` — `.repochan/` protocol specification.

Use explicitly, for example:

```text
/skill:repochan-analysis analyze this repo and write .repochan/analysis.json
/skill:repochan-persona create a persona from the current analysis
/skill:repochan-art-director create a batch of asset orders for a README hero and icon set
/skill:repochan-painter execute order ord-hero-001, using an available image package if installed
```

## Manual workflow

1. **Analyst** inspects the repository and writes `.repochan/analysis.json`.
2. **Creative Writer** consumes analysis and writes `.repochan/persona/current.json` plus versioned profiles.
3. **Art Director** consumes analysis/persona and writes `.repochan/orders/<order-id>/order.json`.
4. **Painter** consumes approved orders, delegates actual image generation to installed image tools/packages when available, then saves result versions under `.repochan/orders/<order-id>/versions/<version-id>/` and updates `order.json.currentVersion`.

## Extension tool

`extensions/repochan.ts` registers the unified `repochan` management tool (the single public surface for all `.repochan/` CRUD, analysis, order result versioning, and protocol operations).

Use `action` strings such as `analysis.run`, `persona.get`, `order.create`, `order.create_result`, `order.list_results`, `protocol.inspect`, etc.; pass action-specific data in `params`. See the promptGuidelines on the tool for the full contract. Modular files under `extensions/` are implementation details; shared protocol and deterministic analysis logic lives in `@repochan/core`.

The core tool + skills are lightweight and do not depend on Pi TUI internals.

## TUI result browsing

Order result browsing is now order-centric. Use the CLI/TUI order detail page or the unified tool actions `order.list_results`, `order.get_result`, and `order.set_current_result`.

The legacy `/repochan_panel` command is retained only as a notice that separate asset manifests have been removed.

## Protocol

Persistent state lives only in `.repochan/`. See `skills/repochan-protocol/SKILL.md` (under `packages/pi/skills/`) and the schemas exported by `@repochan/core`.

For the canonical protocol + safe FS rules, depend on `@repochan/core` (see monorepo root README).

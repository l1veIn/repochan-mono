# RepoChan

RepoChan is a Pi package for a manual, multi-role creative workflow that turns git repositories into rich, consistent visual brand assets: RepoChan mascot personas, illustration briefs, asset orders, order result versions, and landing pages.

RepoChan follows Pi's philosophy: small impact, explicit user control, progressive disclosure, and extensible tools. It does **not** auto-chain roles in v1. Each role checks the `.repochan/` workspace protocol before it works and asks the user before overwriting existing outputs.

**Architectural role**: this package owns the *soft* layer of RepoChan's three-layer design — Pi runtime integration (tool registration, `/order_panel`) and role prompts (skills). All reusable protocol, schema, and business-rule code is imported from [`@repochan/core`](../core/README.md); page rendering is delegated to [`@repochan/page-renderer`](../page-renderer/README.md). See the monorepo [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for the full layer breakdown.

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

Eight skills live under `skills/`. Six are creative roles, two are support docs.

**Roles** (each produces a schema-validated artifact under `.repochan/`):

- `repochan-analysis` — Analyst role; deterministic scan + LLM enrichment → `.repochan/analysis/current.json`.
- `repochan-interviewer` — Interviewer role; asks 7–14 structured questions across 8 dimensions, distills answers into `.repochan/interview/current.json`.
- `repochan-persona` — Creative Team role; three-agent collaboration (world architect + character designer + consistency guardian) → `.repochan/persona/current.json`.
- `repochan-art-director` — Art Director / PM role; foundation-sheet-first Asset Orders → `.repochan/orders/<id>/order.json`.
- `repochan-painter` — Painter role; executes approved orders, resolves references, saves result versions under `orders/<id>/versions/<vid>/`.
- `repochan-page-designer` — Landing-page designer; two-phase flow (content structure + asset audit, then Page JSON assembly + render) → `.repochan/pages/current.json`.

**Support**:

- `repochan` — overview, recommended manual workflow, role map.
- `repochan-protocol` — `.repochan/` on-disk protocol specification.

Roles never auto-chain in v1 — each is user-invoked. Use explicitly:

```text
/skill:repochan-analysis analyze this repo and write .repochan/analysis/current.json
/skill:repochan-interviewer interview me about the project tone and audience
/skill:repochan-persona create a persona from the current analysis + interview
/skill:repochan-art-director create a batch of asset orders for a README hero and icon set
/skill:repochan-painter execute order ord-hero-001, using an available image package if installed
/skill:repochan-page-designer design a project landing page from the current analysis
```

## Manual workflow

1. **Analyst** inspects the repository and writes `.repochan/analysis/current.json`.
2. **Interviewer** (optional) asks the user structured questions and writes `.repochan/interview/current.json`.
3. **Creative Team** consumes analysis (+ optional interview) and writes `.repochan/persona/current.json`.
4. **Art Director** consumes analysis/persona and writes `.repochan/orders/<order-id>/order.json` (foundation sheet first, then downstream orders).
5. **Painter** consumes approved orders, delegates actual image generation to installed image tools/packages when available, then saves result versions under `.repochan/orders/<order-id>/versions/<version-id>/` and updates `order.json.currentVersion`.
6. **Page Designer** (optional) consumes analysis + delivered order assets and writes `.repochan/pages/current.json`, rendered to static HTML via `@repochan/page-renderer`.

## Extension tool

`extensions/repochan.ts` registers the unified `repochan` management tool (the single public surface for all `.repochan/` CRUD, analysis, order result versioning, and protocol operations).

Use `action` strings such as `analysis.run`, `persona.get`, `order.create`, `order.create_result`, `order.list_results`, `protocol.inspect`, etc.; pass action-specific data in `params`. See the promptGuidelines on the tool for the full contract. Modular files under `extensions/` are implementation details; shared protocol and deterministic analysis logic lives in `@repochan/core`.

The core tool + skills are lightweight and do not depend on Pi TUI internals.

## TUI result browsing

Order result browsing is order-centric. Use the `/order_panel [order-id]` command to open an interactive TUI that lists orders, their result versions, inline image previews, and version meta. The CLI also exposes an order detail page and the unified tool actions `order.list_results`, `order.get_result`, and `order.set_current_result`.

## Protocol

Persistent state lives only in `.repochan/`. See `skills/repochan-protocol/SKILL.md` (under `packages/pi/skills/`) and the schemas exported by `@repochan/core`.

For the canonical protocol + safe FS rules, depend on `@repochan/core` (see monorepo root README).

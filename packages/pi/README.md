# RepoChan

RepoChan is a Pi package for a manual, multi-role creative workflow that turns git repositories into rich, consistent visual brand assets: RepoChan mascot personas, illustration briefs, asset orders, and final brand-kit files.

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
- `repochan-painter` — Painter role; professional commissioning mindset and final protocol delivery.
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
3. **Art Director** consumes analysis/persona and writes `.repochan/orders/*.json`.
4. **Painter** consumes approved orders, delegates actual image generation to installed image tools/packages when available, then saves assets under `.repochan/assets/<asset-id>/current/` and `.repochan/assets/<asset-id>/versions/` with manifest updates.

## Extension tool

`extensions/repochan.ts` registers the unified `repochan` management tool (the single public surface for all `.repochan/` CRUD, analysis, versioning, and protocol operations).

Use `action` strings such as `analysis.run`, `persona.get`, `order.create`, `asset.create_version`, `protocol.inspect`, etc.; pass action-specific data in `params`. See the promptGuidelines on the tool for the full contract. Modular files under `extensions/` (analyze.ts, unified.ts, protocol helpers, etc.) are implementation details.

The core tool + skills are lightweight and do not depend on Pi TUI internals.

## TUI asset browser

When the RepoChan package is active, it registers the `/repochan_panel` command for an interactive keyboard-driven browser of delivered assets (large previews, versions, set-current, manifest view).

```text
/repochan_panel
/repochan_panel <asset-id>
```

The panel opens as a non-overlay custom TUI view by default. Controls: ↑↓ select, Enter for detail, s = set as current, m = show manifest, r = refresh, o = open externally, q/Esc close.

**Current Pi TUI limitation (as of 0.79.3)**: The terminal graphics support used for native image generation and Pi TUI `Image` previews has a compositor bug. `isImageLine` + `compositeOverlays`/`compositeLineAt` can throw on `undefined` lines when a session transcript contains previous image blocks and overlays are being composed.

To keep `/repochan_panel` stable, RepoChan avoids overlay mode by default and forces a full TUI redraw when the panel opens to drop stale terminal-image diff state. Inline previews remain enabled in the default non-overlay panel; the asset files also remain on disk under `.repochan/assets/...`, and `o` opens the selected image externally. If you explicitly want the old overlay behavior for testing a patched pi-tui, start Pi with `REPOCHAN_PANEL_OVERLAY=1`. To disable terminal previews entirely, use `REPOCHAN_PANEL_INLINE_IMAGES=0`.

We include the panel in the default extension load for the best out-of-the-box experience, as requested. The core `repochan` tool (all analysis/persona/order/asset/protocol actions) is still the single stable surface; the panel is a TUI convenience on top.

## Protocol

Persistent state lives only in `.repochan/`. See `skills/repochan-protocol/SKILL.md` (under `packages/pi/skills/`) and `packages/core/src/schemas/` (or the old `schemas/asset-order.schema.json` for reference). 

For the canonical protocol + safe FS rules, depend on `@repochan/core` (see monorepo root README).

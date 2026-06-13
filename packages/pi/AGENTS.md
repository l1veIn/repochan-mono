# RepoChan Contributor Guide

## Purpose

RepoChan is a Pi package, not an application service. Keep it small, inspectable, and safe. Skills teach role workflows; extensions provide typed protocol utilities.

## Rules

- Do not auto-chain Analyst → Persona → Art Director → Painter in v1. Each role must be user-invoked.
- Every role must perform pre-flight checks for required upstream `.repochan/` artifacts.
- Do not store persistent state outside `.repochan/` except package-local docs/schemas.
- Painter instructions must use a professional commissioning mindset: high-level brief, constraints, intent, references, and creative freedoms; avoid pixel-perfect micromanagement.
- Extensions must use TypeBox schemas and deterministic filesystem behavior.
- Tools may write artifacts only when explicitly asked and should guard existing files unless `overwrite` is true.
- Prefer additive protocol evolution. Keep old versions readable.

## Package layout

- `skills/*/SKILL.md` — role definitions, checklists, philosophy, examples.
- `extensions/repochan.ts` — the Pi extension entrypoint (registers only the lightweight unified `repochan` tool).
- `extensions/unified.ts` — implementation of the single public `pi.registerTool("repochan")` (all action-based management).
- `extensions/analyze.ts` — deterministic analysis implementation (used by the tool).
- `extensions/assets-panel.ts` — TUI browser panel (`/repochan_panel` command). It depends on `@earendil-works/pi-tui`. It is deliberately included in the default extension entry (`repochan.ts`) so that users who activate the package get `/repochan_panel` out of the box without extra `-e` steps. Default mode avoids pi-tui overlay/image compositor paths; overlay mode is opt-in for patched pi-tui testing (see README).
- Core protocol, entities, safe FS, versioning, and schemas live in the sibling `@repochan/core` package (imported by the tool and panel). Do not duplicate logic here.

## Validation

Before publishing:

```bash
find skills -name SKILL.md -print
node --check /dev/null # placeholder; TypeScript is loaded by Pi via jiti
pi -e .
```

When changing schemas, update both `schemas/asset-order.schema.json` and the TypeBox definitions in the relevant `extensions/*.ts` module.

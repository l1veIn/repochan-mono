# @repochan/skill

RepoChan skills — the soul of the system. Platform-agnostic markdown that tells any agent (Pi / Claude Code / Codex) how to run the RepoChan creative pipeline.

This is a pure-markdown package (no build step, no code). It is the C-position of RepoChan: the wizard skill orchestrates the full pipeline by default, and each team skill covers one role.

## Skills

- **`repochan`** — the **wizard** (orchestrator). Default experience: one sentence from the user → the wizard schedules all teams through the full pipeline with checkpoints. Also covers yolo (skip checkpoints) and per-team (advanced) modes.
- `repochan-analysis` — Analyst: scan the repo, write the analysis report.
- `repochan-interviewer` — Interviewer (optional): structured interview for user preferences.
- `repochan-persona` — Creative Team: build the mascot persona.
- `repochan-art-director` — Art Director: create the foundation sheet (visual anchor) + downstream tasks.
- `repochan-painter` — Painter: execute image generation tasks.
- `repochan-page-designer` — Page Designer (optional): build the landing page.
- `repochan-protocol` — Protocol keeper: `.repochan/` workspace spec (reference).

## Distribution

Per the ADR, skills ship bundled with the `repochan` CLI (`npm install -g repochan`). `repochan setup --agent <codex|claude|pi>` copies the relevant skills to each agent's convention location and injects a reference into the top-level instruction file (`AGENTS.md` / `CLAUDE.md`). See ADR §15.

## Status

The team skills are migrated as-is from `packages/pi/skills/`. Their content still references Pi-era `action:` calls; they will be rewritten to CLI subcommands once the CLI refactor (Phase 2) finalizes the command surface. The wizard skill is already written to the new model (ADR §17).

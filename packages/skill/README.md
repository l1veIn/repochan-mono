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
- `repochan-starter-designer` — Starter Designer (maintainer): author reusable image-driven source starters and their composition recipes. It is not part of the normal project pipeline.

## Asset templates (not in this package)

Built-in image asset templates live in **`@repochan/templates`** (YAML data package). The CLI loads them via `repochan template list|get`; skills only teach agents how to pick and fill slots through that CLI. Project overrides: `<projectRoot>/.repochan/templates/`.

## Distribution

Per the ADR, skills ship bundled with the `repochan` CLI (`npm install -g repochan`). `repochan setup --agent <codex|claude|pi>` copies the relevant skills to each agent's convention location and injects a reference into the top-level instruction file (`AGENTS.md` / `CLAUDE.md`). See ADR §15.

## Status

All skills are migrated to the new `repochan` CLI subcommand syntax (`repochan foundation find`, `repochan order create --data-file`, etc.). The wizard skill is written to the orchestrator model (ADR §17).

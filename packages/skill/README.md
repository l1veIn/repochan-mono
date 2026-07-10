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

## Templates

12 asset templates ship as YAML under `templates/` (foundation sheet, 2×2 pattern grid, chibi grids, five poster styles, banner, 3×3 icon exploration grid, and three-view). Each template centers on a reusable `prompt_template` with semantic `{{slot}}` placeholders, plus only the physical metadata needed for output and post-processing. The CLI reads them via `repochan template list [--tag <tag>]` and `repochan template get <id>`; project-level templates in `<projectRoot>/.repochan/templates/` override built-ins by id, and legacy width/height templates remain readable.

## Distribution

Per the ADR, skills ship bundled with the `repochan` CLI (`npm install -g repochan`). `repochan setup --agent <codex|claude|pi>` copies the relevant skills to each agent's convention location and injects a reference into the top-level instruction file (`AGENTS.md` / `CLAUDE.md`). See ADR §15.

## Status

All skills are migrated to the new `repochan` CLI subcommand syntax (`repochan foundation find`, `repochan order create --data-file`, etc.). The wizard skill is written to the orchestrator model (ADR §17).

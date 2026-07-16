# @repochan/skill

RepoChan skills — the soul of the system. Platform-agnostic markdown that tells any agent (Pi / Claude Code / Codex) how to run the RepoChan creative pipeline.

This is a pure-markdown package (no build step, no code). It is the C-position of RepoChan: the wizard skill orchestrates the full pipeline by default, and each team skill covers one role.

## Skills

- **`repochan`** — the **wizard** (orchestrator). Default experience: one sentence from the user → the wizard schedules all teams through the full pipeline with checkpoints. Explicit yolo selects default creative decisions inside the authorized scope; CI does not grant external write permission. Per-team access is the advanced mode.
- `repochan-analysis` — Analyst: scan the repo, write the analysis report.
- `repochan-interviewer` — Interviewer (optional): structured interview for user preferences.
- `repochan-persona` — Creative Team: build the mascot persona.
- `repochan-art-director` — Art Director: create the foundation sheet (visual anchor) + downstream tasks.
- `repochan-painter` — Painter: execute image generation tasks.
- `repochan-page-designer` — Starter Localizer/Assembler (optional): pull an existing starter, project repository data, localize content, apply slot assets, and validate the instance. It does not redesign the site.
- `repochan-web-designer` — Web Designer (explicit branch): create and implement an original project website through Gate 1/2 when no starter fits or a new art direction is requested.
- `repochan-starter-designer` — Starter Productization Engineer: preserve a Gate-2-approved site as a creator-owned Source Starter with a concentrated Transfer Kit. Official inclusion happens by pull request; it is not part of the normal project pipeline.

## Asset templates (not in this package)

Built-in image asset templates live in **`@repochan/templates`** (YAML data package). The CLI loads them via `repochan template list|get`; skills only teach agents how to pick and fill slots through that CLI. Project overrides: `<projectRoot>/.repochan/templates/`.

## Distribution

Skills ship bundled with the `repochan` CLI (`npm install -g repochan`). `repochan setup --agent <codex|claude|pi>` copies the relevant skills to each agent's convention location and injects a reference into the top-level instruction file (`AGENTS.md` / `CLAUDE.md`).

## Status

All shipped skills use the current `repochan` CLI subcommand contract (`repochan foundation find`, `repochan order create --data-file`, etc.). The wizard skill addresses the external orchestrator model.

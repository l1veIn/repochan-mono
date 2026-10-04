# @repochan/templates

Built-in **asset templates** for the RepoChan image pipeline: small YAML files with `prompt_template`, canvas size, optional grid, and post-process constraints.

This is a **pure data package**. It does not contain code, skills, or agent instructions.

## Why a separate package?

| Concern | Owner |
|---|---|
| How to pick / fill templates | Skills (`@repochan/skill`) — teach the agent |
| Load / list / get templates | CLI (`repochan template list\|get`) |
| Template file contents | **This package** |
| Protocol state (`templateId` string) | Core |

Skills must not ship runtime data the CLI parses. Agents consume templates **only through the CLI**.

## Layout

YAML files live at the package root (one file per template). Example ids: `official/foundation-sheet`, `official/poster-memphis`.

Grid templates may declare `grid.cell_keys` in row-major order when every cell has a stable semantic meaning. For example, `official/web-state-grid-3x3` defines nine web-state asset keys; starter validation matches them against manifest `publications[]`, and `starter asset-apply` projects a delivered sheet into named files atomically.

Optional generation fields `quality` and `background` are passed through `repochan template get --json` to `repochan image gen`. Isolated layer templates (`official/isolated-character`, `official/isolated-prop`, `official/eyes-closed`) set `background: transparent`. `official/eyes-closed` takes an existing isolated open-eyes character as `--reference` and only closes the lids. Matte cutout and grid templates omit `background` and keep chroma-key extraction.

## Resolution order (CLI)

1. Built-ins from this package (`@repochan/templates`)
2. Project overlay: `<projectRoot>/.repochan/templates/` (same `id` wins)

## Usage

```bash
repochan template list
repochan template list --tag poster
repochan template get official/foundation-sheet
```

Discover the current catalog with `repochan template list`; counts are not an API contract. Complete website sources belong to [`@repochan/starters`](../starters/README.md).

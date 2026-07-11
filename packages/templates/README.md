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

## Resolution order (CLI)

1. Built-ins from this package (`@repochan/templates`)
2. Project overlay: `<projectRoot>/.repochan/templates/` (same `id` wins)

## Usage

```bash
repochan template list
repochan template list --tag poster
repochan template get official/foundation-sheet
```

## Scale roadmap

| Stage | Strategy |
|---|---|
| Now (~12 official) | Ship with CLI via this data package; semver-locked |
| Dozens + community | Keep official set here; add remote registry / git pull later |
| Hundreds+ | CLI becomes a pure client; remote hub is the source of truth |

Page/Astro **project** scaffolds are a different kind of template and are **not** stored here.

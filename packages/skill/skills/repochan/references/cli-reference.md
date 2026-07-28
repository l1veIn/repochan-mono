# RepoChan CLI Reference

This reference covers the public `repochan` command surface. Commands provide deterministic reads, writes, and protocol validation. Keep creative judgment and cross-stage orchestration in skills.

## Contents

- [General conventions](#general-conventions)
- [Projects and protocol](#projects-and-protocol)
- [Analysis and interviews](#analysis-and-interviews)
- [Personas](#personas)
- [Asset Orders and results](#asset-orders-and-results)
- [Starters](#starters)
- [Templates and images](#templates-and-images)
- [Local browser](#local-browser)
- [Skill installation](#skill-installation)
- [Development diagnostics](#development-diagnostics)
- [Choose commands by task](#choose-commands-by-task)

## General conventions

```bash
repochan --help
repochan --version
repochan <command> ... [--json]
```

- Run commands from the target git project's root. The CLI treats the current working directory as `projectRoot`.
- Bare `repochan` is equivalent to a status overview.
- Prefer `--json` on supported commands when an agent must parse the result.
- Pass protocol payloads through `--data-file <path>`. Use `--data-file -` for stdin. A command may also read piped stdin when the path is omitted.
- Do not construct complex JSON inline in the shell. Write a temporary JSON file and submit it with `--data-file`.
- Write protocol state only through the CLI. Never hand-edit `.repochan/`.
- Pass `--overwrite` explicitly when replacing an existing artifact. Versioned entities preserve the prior version before replacing `current.json`.

## Projects and protocol

| Command | Purpose |
| --- | --- |
| `repochan init` | Initialize the `.repochan/` protocol directory; safe to repeat. |
| `repochan status` | Show stage progress, orders, results, protocol health, and Skill/CLI drift. |
| `repochan inspect` | Show a raw protocol overview. |
| `repochan validate` | Validate protocol files, dependencies, and results; exit nonzero on failure. |
| `repochan protocol inspect` | Use the lower-level protocol overview entry point. |
| `repochan protocol read <artifact-path>` | Read a protocol artifact through the CLI. |

Common commands:

```bash
repochan status --json
repochan validate --json
repochan protocol read analysis/current.json --json
```

When status reports `Skill version drift`, run `repochan setup` to refresh the installed skills.

## Analysis and interviews

### Analysis

| Command | Purpose |
| --- | --- |
| `repochan analysis run` | Run the deterministic repository scan and create the base analysis. |
| `repochan analysis get [--full]` | Read the compact summary by default; return the complete analysis JSON with `--full`. |
| `repochan analysis update --data-file <json>` | Replace or update the complete analysis; use `--overwrite` when required for an existing current version. |
| `repochan analysis enrich --data-file <json>` | Write the LLM-enriched analysis fields. |
| `repochan analysis versions` | List analysis history. |

### Interview

| Command | Purpose |
| --- | --- |
| `repochan interview get` | Read the current interview report. |
| `repochan interview create --data-file <json>` | Create an interview report. |
| `repochan interview append --data-file <json>` | Append answers and update the distilled result. |

Read `repochan-analysis` for analysis fields and enrichment order. Read `repochan-interviewer` for the interview schema and follow-up rules. Do not infer payloads from this command table.

## Personas

| Command | Purpose |
| --- | --- |
| `repochan persona get` | Read the current persona. |
| `repochan persona create --data-file <json>` | Create a persona. |
| `repochan persona update --data-file <json>` | Update a persona and version the prior current value. |
| `repochan persona review --data-file <json>` | Save a persona review. |
| `repochan persona candidate create --data-file <json>` | Create a persona candidate. |
| `repochan persona candidate promote --slug <slug>` | Promote a candidate to the current persona. |

Read `repochan-persona` for complete payloads, the three-role collaboration, and the candidate workflow.

## Asset Orders and results

### Foundation

```bash
repochan foundation find [--json]
```

Find the foundation-sheet visual anchor. Confirm it exists before starting downstream orders.

### Order

| Command | Purpose |
| --- | --- |
| `repochan order list` | List orders. |
| `repochan order get <id>` | Read one order. |
| `repochan order create --data-file <json>` | Create an order. |
| `repochan order update --data-file <json>` | Update an order. |
| `repochan order set-status <id> <status>` | Set a valid status such as `draft`, `approved`, or `in_progress`. |
| `repochan order add-revision <id> --text <text>` | Append a short revision; a `--data-file` payload is also supported. |
| `repochan order resolve-references <id>` | Resolve foundation, order, or file references to usable absolute paths. |
| `repochan order create-result --data-file <json>` | Atomically publish an immutable result version. |
| `repochan order list-results <id>` | List result versions. |
| `repochan order get-result <id> [--result-version <version>]` | Read the current or a specified result version. |
| `repochan order extract <id> [--result-version <version>] [--rows N --cols M]` | Extract a delivered result and append an order-level derived audit. |

For image orders, `create-result` must record the complete `generationPrompt` sent to the generator. Never modify a published result directory or its `meta.json`; create a new version for a revision.

`order extract` reads rows and columns from the order template's grid by default. If the template has no grid declaration, pass both `--rows` and `--cols`. The default strategy is `chroma-grid` and the default pipeline is `v2`. `ml-blobs` and `hybrid` require optional ML. A failed QA archives no derived files.

### Order candidates

```bash
repochan order candidate create --data-file <json>
repochan order candidate promote <id> <version>
```

Use candidates to compare result directions. Promote the selected candidate before it becomes the formal current version.

### Recovery

```bash
repochan order recovery list <id>
repochan order recovery recover <id> <transaction>
repochan order recovery abort <id> <transaction>
```

Use recovery only after an interrupted atomic `create-result` publication. Run `list` first to inspect the transaction and lock. Do not force recovery or abort while an active publisher holds the lock.

### Review

```bash
repochan review create --data-file <json>
```

Create a structured review. Read `repochan-art-director` for order orchestration, states, and payloads. Read `repochan-painter` for generation, revisions, and result publication.

## Starters

| Command | Purpose |
| --- | --- |
| `repochan starter list [--tag <tag>]` | List available Starters. |
| `repochan starter get <id>` | Read a Starter manifest and its capabilities. |
| `repochan starter sync [--channel <tag>] [--force]` | Synchronize the independent Starter catalog from npm into the user cache. |
| `repochan starter pull [--starter <id>] [--output-dir <dir>]` | Copy a complete Starter into an instance directory; `--from <trusted-dir>` is also supported. |
| `repochan starter configure --content-file <json> [--repository-url <url>] [--output-dir <dir>]` | Write localized content and project configuration. |
| `repochan starter create-order <slot> --intent <text> [--foundation <order-id>] [--status <status>]` | Create an Asset Order from a slot contract. |
| `repochan starter asset-apply <slot> --order <id> [--result-version <version>] --overwrite` | Atomically run slot postprocessing, project derived files, and update `assets.json`. |
| `repochan starter asset-import <slot> --file <path> [--overwrite]` | Import a local scalar asset that is already in its final format and record its provenance. |
| `repochan starter validate [--output-dir <dir>] [--localized]` | Validate one Starter instance. |
| `repochan starter validate --all` | Validate all built-in Starter sources. |
| `repochan starter preview <id> [--port N] [--no-open] [--rebuild]` | Install, build, and preview a Starter locally using the dist cache. |

Starters are no longer installed with the CLI runtime. Run `starter sync` before the first selection. The default instance directory is `.repochan/web-starter/`. Do not replace `asset-apply` bundle or postprocessing behavior with direct file copies, and never fabricate `assets.json` manually. Read `repochan-page-designer` for the complete assembly workflow.

## Templates and images

### Templates

```bash
repochan template list [--tag <tag>] [--json]
repochan template get <id> [--json]
```

Read templates only through the CLI. Fill every `promptTemplate` slot and pass the template's `size`, `quality`, and constraints into generation.

### Image generation

```bash
repochan image configure
repochan image status
repochan image probe [--endpoint <id>]
repochan image gen --prompt "<text>" [--reference <path>]... [--out <path>]
```

`gen` also supports `--endpoint`, `--aspect`, `--size`, and `--quality`. Normally keep `mode=auto`. Pass every reference image with a separate `--reference`.

### Image editing

```text
repochan image edit ml status|install
repochan image edit slice
repochan image edit validate-seams
repochan image edit bg-remove
repochan image edit chroma-key
repochan image edit extract
repochan image edit iconfont
repochan image edit layout-guide
repochan image edit resize
repochan image edit favicon
repochan image edit compress
repochan image edit gif-from-frames
```

Read [image-tools.md](image-tools.md) for complete parameters, selection rules, and direct-asset recipes.

## Local browser

```bash
repochan browse [--port N] [--no-open] [--json]
```

Open the local protocol browser on `127.0.0.1` to inspect personas, orders, versions, references, derived audits, and the dependency canvas. Protocol browsing is read-only by default. Starter sync and preview are explicit actions that reuse the CLI's `starter sync` and `starter preview` semantics.

## Skill installation

```bash
repochan setup
repochan setup --list
repochan setup --agent codex,claude --project
repochan setup --agent auto --global
repochan setup --agent <id> --remove
```

| Option | Purpose |
| --- | --- |
| `--agent <ids|auto|all>` | Select agents; separate multiple IDs with commas. |
| `--project` | Install into agent skill directories for the current project. |
| `--global` | Install into user-level agent skill directories. |
| `--yes` | Noninteractively select one primary agent for installation, or configured agents for removal. |
| `--list` | Show detection and configuration status. |
| `--remove` | Remove the RepoChan installation. |
| `--overwrite` | Use only after explicitly authorizing takeover of a same-name skill conflict. |

`setup` copies the complete `@repochan/skill` directory, including references, and writes a version marker. It does not implicitly run `repochan init`.

## Development diagnostics

```bash
repochan dev errors [--limit N] [--json]
repochan dev errors --on
repochan dev errors --off
repochan dev errors --clear
```

Development telemetry is opt-in and only diagnoses local command errors. Do not treat it as project protocol state or user analytics.

## Choose commands by task

| User goal | Smallest entry point |
| --- | --- |
| Inspect current progress | `repochan status --json` |
| Check protocol corruption | `repochan validate --json` |
| Start repository analysis | `repochan analysis run` |
| Find the foundation | `repochan foundation find --json` |
| Inspect an order and delivery | `repochan order get <id>` / `get-result` |
| Browse the complete protocol and version relationships | `repochan browse` |
| Resolve generation references | `repochan order resolve-references <id> --json` |
| Extract a delivered order without a site | `repochan order extract <id>` |
| Generate or process one image | `repochan image ...`, then read `image-tools.md` |
| Pull and localize a site | `repochan starter sync` → `pull` → `configure` |
| Assemble an order asset into a site | `repochan starter asset-apply` |
| Refresh installed agent skills | `repochan setup` |

If this table conflicts with validation or error output from the current CLI, follow the current CLI's argument validation and `--help`, return the original error to the user, and never bypass validation by hand-editing protocol files.

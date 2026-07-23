# repochan

CLI for [RepoChan](https://github.com/l1veIn/repochan-mono) — turn a git repo into brand assets (persona, art, stickers, landing page) with a **deterministic protocol** under `.repochan/` and **bring-your-own agent** skills.

No embedded model runtime. The agent (Claude Code, Codex, Pi, …) orchestrates; `repochan` is the only binding surface.

## Install

```bash
npm install -g repochan
# requires Node.js >= 20
```

The default CLI install includes the `sharp`-based offline pixel operations used by official Starters (`chroma-grid`, chroma-key, resize, compression, and related QA), but not the large optional ML runtime. Install ML matting only when an operation asks for it:

```bash
repochan image edit ml install
```

`bg-remove`, `ml-blobs`, and `hybrid` may require that capability. When it is absent, the CLI exits with `MissingImageMlCapabilityError` / `REPOCHAN_IMAGE_ML_MISSING` and prints the install command; after one successful install, retry the original command. Network download occurs only during that explicit install. ML execution then reads the runtime and bundled model files from the local capability cache without network access. Page Designer agents normally encounter this through atomic `starter asset-apply`; Web Designer agents may invoke it directly. Painter never installs or runs image-edit ML, and official Starters' current `chroma-grid` path needs no ML install.

## Quick start

```bash
cd your-git-repo

# Install skills into your agent + optional image endpoint
repochan setup

# Image generation (OpenAI-compatible base URL + key; mode defaults to auto)
repochan image configure
repochan image status

# Protocol (examples)
repochan analysis run
repochan persona get --json
repochan order list --json
repochan image gen --prompt "a chibi mascot" --out /tmp/t.png

# Landing-page starters
repochan starter list
repochan starter get minimal --json
repochan starter pull                     # scaffold default → .repochan/web-starter/
repochan starter configure                # analysis/persona → repochan/site.json
repochan starter create-order hero-composite --intent "..." --foundation ord-found-001
repochan starter asset-apply hero-composite --order ord-hero-001 --overwrite
repochan starter validate --output-dir .repochan/web-starter
```

`repochan order create-result` requires at least one readable, non-empty regular
file in the payload's `files` array. Missing paths and metadata-only results are
rejected before a version directory is written or the order is marked `delivered`.
Candidate promotion also re-checks its recorded files before changing the current
version. Result replacement stages a complete version directory, removes stale
omitted files, and restores the previous version and order if publication fails.
Mutations for the same order must be serialized by the caller. If an active
transaction or retained recovery directory is present, Core rejects another
result write or candidate promotion with the directory path; retry after the
first mutation completes, or recover the retained directory before continuing.
Publication uses an order-byte compare-and-swap guard, so a revision/status/current
mutation that completes during staging is preserved and the older transaction
fails with a conflict. A retained transaction contains `recovery.json`; manage it
only through `repochan order recovery list|recover|abort`. `recover` restores the
manifest's original state. `abort` accepts the current state only after Core
validates it. Never hand-edit or delete recovery directories.
An active publisher holds the order lock, so recovery commands fail with a
retryable conflict. After a crash, Core reclaims a stale same-host lock:
`prepared` and `recovery_required` transactions can be recovered, while a
`staging_unprepared` directory has no recoverable manifest and is therefore
abort-only.
Core anchors every real transaction outside its staging directory with an identity
and nonce, then validates fixed backup mappings plus order/version semantics before
and after recovery. It rejects simple forged transaction directories; it is not a
security boundary against an actor able to rewrite the whole workspace and its
anchors. Protocol state is changed only through schema-validated entity
commands. Published result directories, including `meta.json`, remain byte-for-byte
immutable after creation. Local pixel derivations belong in a pulled Starter's
`public/` through `starter asset-apply`, not in an order result version.

```bash
repochan order recovery list <order-id>
repochan order recovery recover <order-id> <transaction-id>
repochan order recovery abort <order-id> <transaction-id>
```

`repochan order extract <orderId>` runs cutout extraction (`@repochan/image-edit`
`extractAssets`, default strategy `chroma-grid` + pipeline `v2`) directly against a
delivered order result version — no starter/site required — and archives the output
into the order's derived audit copy (`.repochan/orders/<id>/derived/<ts>--extract/`
plus an append-only `derived.json` entry, same `repochan.order-derived.v1` mechanism
as `starter asset-apply`, recorded with slot `manual` / starter `image-edit`). The
immutable `versions/` directory is never touched. `--rows`/`--cols` default from the
order template's `grid` when the order has a `templateId`; pass both explicitly
otherwise. `--result-version` selects a non-current version; `ml-blobs`/`hybrid`
require the optional image ML capability. QA defects (`ExtractError`) fail the
command with structured defects (JSON under `--json`) and archive nothing.

```bash
repochan order extract ord-stickers-001                          # grid from the order template
repochan order extract ord-stickers-001 --rows 4 --cols 4        # explicit grid override
repochan order extract ord-stickers-001 --result-version v2 --json
```

## Image endpoints

Config: `~/.repochan/image.json` (credentials stay in image-gen; not in project protocol).

| Mode | Meaning |
|------|---------|
| `auto` (default) | Classic OpenAI Images API; polls if the relay returns a job id. Host rules (e.g. `*.65535.space`) may use async headers. |
| `openai` | Force classic (no `X-Async-Mode`). |
| `openai-async` | Force async submit + poll. |

```bash
repochan image configure   # interactive
repochan image probe
repochan image gen --prompt "…" [--reference path] [--reference path2] [--aspect landscape|square|portrait] [--quality low|medium|high|auto]
# Multiple --reference flags: each gets its own flag (--reference A --reference B)
```

## Packages (also published)

- `@repochan/core` — protocol / schema / rules
- `@repochan/image-gen` — prompt → PNG
- `@repochan/image-edit` — slice / bg-remove / chroma-key / compress / resize / favicon
- `@repochan/browse` — local protocol viewer and Starter preview server
- `@repochan/skill` — agent skill markdown
- `@repochan/templates` — asset YAML templates
- `@repochan/starters` — landing-page scaffolds (Astro/Tailwind project directories); not bundled with the CLI — `repochan starter sync` downloads them on demand

## Docs

Monorepo: [github.com/l1veIn/repochan-mono](https://github.com/l1veIn/repochan-mono)

## License

MIT

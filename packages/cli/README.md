# repochan

CLI for [RepoChan](https://github.com/l1veIn/repochan-mono) — turn a git repo into brand assets (persona, art, stickers, landing page) with a **deterministic protocol** under `.repochan/` and **bring-your-own agent** skills.

No embedded model runtime. The agent (Claude Code, Codex, Pi, …) orchestrates; `repochan` is the only binding surface.

## Install

```bash
npm install -g repochan
# requires Node.js >= 20
```

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
- `@repochan/skill` — agent skill markdown
- `@repochan/templates` — asset YAML templates
- `@repochan/starters` — landing-page scaffolds (Astro/Tailwind project directories)

## Docs

Monorepo: [github.com/l1veIn/repochan-mono](https://github.com/l1veIn/repochan-mono)

## License

MIT

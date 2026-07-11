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
repochan image gen --prompt "…" [--reference path] [--aspect landscape|square|portrait]
```

## Packages (also published)

- `@repochan/core` — protocol / schema / rules  
- `@repochan/image-gen` — prompt → PNG  
- `@repochan/image-edit` — slice / bg-remove / GIF  


- `@repochan/skill` — agent skill markdown  
- `@repochan/templates` — asset YAML templates  

## Docs

Monorepo: [github.com/l1veIn/repochan-mono](https://github.com/l1veIn/repochan-mono)

## License

MIT

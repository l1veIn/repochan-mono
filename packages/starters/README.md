# @repochan/starters

Built-in **landing-page starters** for RepoChan: complete Astro/Tailwind project directories that get scaffolded into an editable site via `repochan starter pull`.

This is a **pure scaffold-data package**. It does not contain build code or agent instructions. Each starter is a subdirectory containing a full Astro project + a `starter.json` manifest.

## Why a separate package?

| Concern | Owner |
|---|---|
| How to pick / fill a starter | Skills (`@repochan/skill`, esp. `repochan-page-designer`) — teach the agent |
| List / inspect starters | CLI (`repochan starter list`, `repochan starter get <id>`) |
| Scaffold starters | CLI (`repochan starter pull --starter <id>`) |
| Starter project files | **This package** |

This is distinct from [`@repochan/templates`](../templates/), which holds **asset prompt templates** (YAML for the image pipeline). Starters are **whole site scaffolds**; templates are **prompt skeletons**.

## Layout

Each starter is a subdirectory containing an Astro project + a `starter.json` manifest:

```
constructivist/
  starter.json          # manifest (see schema below)
  package.json          # Astro project package (the scaffolded site's deps)
  astro.config.mjs
  src/
  public/
```

## starter.json schema

```json
{
  "id": "constructivist",
  "name": "Constructivist Landing",
  "description": "...",
  "style": "constructivist",
  "tags": ["landing", "constructivist", "hero"],
  "default": true,
  "assets": [
    {
      "slot": "hero-composite",
      "reference": "public/assets/hero-composite.webp",
      "description": "design knowledge in natural language",
      "order": {
        "templateId": "official/hero-character-migrate",
        "assetType": "hero_composite",
        "brief": { "mustInclude": [...], "avoid": [...], "creativeFreedom": [...] },
        "deliverables": [{ "name": "...", "width": 2560, "height": 1440 }],
        "references": [{ "type": "file", "path": "public/assets/hero-composite.webp", "role": "composition" }]
      },
      "postprocess": [
        { "op": "compress", "args": { "format": "webp", "quality": 82, "maxWidth": 2560 }, "out": "public/assets/hero-composite.webp" }
      ]
    }
  ]
}
```

Key fields per asset slot:
- **`order`**: a partial order (same structure as `order.json`). Page-designer merges it with project-specific fields (orderId, intent, foundation reference) to create the real migration order. `brief.mustInclude` flows directly to the painter's prompt.
- **`postprocess`**: image-edit steps to run after the painter delivers. Page-designer reads this array and executes each via `repochan image edit <op>` — no decision tree needed.

## Usage

```bash
# list available starters (with tag filtering)
repochan starter list
repochan starter list --tag landing

# inspect a starter's full manifest
repochan starter get constructivist

# scaffold the default starter into .repochan/web-starter/ (default output)
repochan starter pull

# scaffold a specific starter
repochan starter pull --starter minimal --output-dir ./my-site
```

The scaffolded output is an **editable instance** — the page-designer skill then fills in i18n copy, theme, and post-processed assets. The starter directory here is the **source**, never mutated at runtime.

## Asset migration

Each starter ships with **default reference assets** (hero composite, textures) that encode the starter's composition language. When adopting a starter for a new project, the page-designer creates migration orders (using the `order` field + `@repochan/templates` migrate templates) so the painter re-renders the composition with the project's own foundation character. See `starter.json` per-starter for the asset slot list.

## Available starters

| id | style | notes |
|---|---|---|
| `constructivist` | 构成主义 | 硬边色块、菱形 motif、角色-留白合成 hero (default) |
| `minimal` | 构成主义(简化) | 只含 Hero section,用于迁移管道测试 |

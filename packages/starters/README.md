# @repochan/starters

Built-in **landing-page starters** for RepoChan: complete Astro/Tailwind project directories that get scaffolded into an editable site via `repochan starter pull`.

This is a **pure scaffold-data package**. It does not contain build code or agent instructions. Each starter is a subdirectory containing a full Astro project + a `starter.json` manifest.

## Why a separate package?

| Concern | Owner |
|---|---|
| How to pick / fill a starter | Skills (`@repochan/skill`, esp. `repochan-page-designer`) — teach the agent |
| List / scaffold starters | CLI (`repochan starter pull --starter <id>`) |
| Starter project files | **This package** |

This is distinct from [`@repochan/templates`](../templates/), which holds **asset prompt templates** (YAML for the image pipeline). Starters are **whole site scaffolds**; templates are **prompt skeletons**.

## Layout

Each starter is a subdirectory containing an Astro project + a `starter.json` manifest:

```
constructivist/
  starter.json          # manifest: id, asset slots, reference images
  package.json          # Astro project package (the scaffolded site's deps)
  astro.config.mjs
  src/
  public/
```

## Usage

```bash
# scaffold the default starter (constructivist) into ./repochan-page
repochan starter pull --output-dir repochan-page

# scaffold a specific starter
repochan starter pull --starter constructivist --output-dir ./my-site
```

The scaffolded output is an **editable instance** — the page-designer skill then fills in i18n copy, theme, and post-processed assets. The starter directory here is the **source**, never mutated at runtime.

## Asset migration (design intent)

Each starter ships with **default reference assets** (hero composite, character cutout, textures) that encode the starter's composition language — where the character sits, where the text-zone blank lives, the visual style. When adopting a starter for a new project, the page-designer creates migration orders (via `@repochan/templates` migrate-tagged templates) so the painter re-renders the composition with the project's own foundation character. See `starter.json` per-starter for the asset slot list.

## Available starters

| id | style | notes |
|---|---|---|
| `constructivist` | 构成主义 | 硬边色块、菱形 motif、角色-留白合成 hero (default) |
| `minimal` | 构成主义(简化) | 只含 Hero section,用于迁移管道测试 |

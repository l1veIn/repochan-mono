# @repochan/starters

Pure scaffold data for RepoChan landing pages. Each child directory is an independent Astro/Tailwind project copied by `repochan starter pull`; this package has no runtime exports or build logic.

## Starter v1 layout

```text
minimal/
├── repochan/
│   ├── starter.json
│   ├── site.json
│   ├── assets.json
│   └── i18n/{en,zh}.json
├── src/
│   ├── components/
│   ├── layouts/
│   ├── lib/site.ts
│   ├── pages/
│   └── styles/
├── public/
└── package.json
```

`repochan/starter.json` is the sole manifest in both the source and pulled instance. Core owns its schema and deterministic rules; the CLI owns discovery, projection, order materialization, post-processing, and validation.

Project-specific text, palette, links, brand data, and asset state stay concentrated under root-level `repochan/`. `src/lib/site.ts` is a stable reader and token derivation layer, not an agent editing target.

## Commands

```bash
repochan starter list
repochan starter get minimal --json
repochan starter pull [--starter minimal]
repochan starter configure [--content-file content.json --overwrite]
repochan starter create-order hero-composite --intent "..." --foundation ord-foundation-001
repochan starter asset-apply hero-composite --order ord-hero-001 --overwrite
repochan starter validate minimal
repochan starter validate --output-dir .repochan/web-starter
repochan starter validate --all
```

## Color boundary

Color literals are allowed only in `repochan/site.json` theme data. Presentation files consume CSS variables and token-derived colors. `repochan starter validate` enforces the rule together with manifest, locale, asset, path, and template checks.

## Available starter

| ID | Scope | Default |
|---|---|---|
| `minimal` | One project-focused hero | yes |

# @repochan/starters

Pure scaffold data for RepoChan landing pages. Each child directory is an independent Astro/Tailwind project copied by `repochan starter pull`; this package has no runtime exports or build logic.

## Starter v1 layout

```text
<starter-id>/
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

Every source starter declares `capabilities.sections[]` and adjacent `capabilities.transitions[]`. The section contract records recipe, design provenance or an explicit HTML-first decision, baked/live layers, canonical viewport, normalized safe zones, responsive behavior, asset slots, and motion. Declared section order and every adjacent transition are authoritative.

Each asset slot declares `kind: "scalar" | "bundle"`. Scalar slots own one `output`; bundle slots own named `publications[]` and an exclusive `extract-grid` postprocess. Asset state mirrors the same discriminant: scalar state owns `src`, while bundle state owns `items` and never fabricates a representative top-level `src`.

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

## Available starters

| ID | Scope | Default |
|---|---|---|
| `minimal` | One project-focused Hero (`capabilities.sections=[hero]`) | yes |
| `registry-modular` | Seven-section modular registry with one Hero visual slot and live HTML/CSS/SVG sections | no |

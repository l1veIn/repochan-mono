# @repochan/starters

Complete, real project websites that can be localized for another repository. Each child directory is an independent Astro/Tailwind site copied by `repochan starter pull`; the package has no runtime exports or build logic.

## Source Starter and Transfer Kit

A Source Starter preserves its original project name, character, URLs, copy, source code, and production assets. It is a finished website, not an anonymous wireframe. Its previews and running source are the authoritative expression of the design.

The **Transfer Kit** is the small, concentrated handoff surface inside that full site:

```text
<starter-id>/
├── repochan/
│   ├── starter.json              # sole manifest: previews, locales, slots, orders, postprocess
│   ├── site.json                 # project metadata and theme tokens
│   ├── assets.json               # source/customized asset state
│   ├── i18n/{locale}.json        # complete content structures
│   └── previews/{desktop,mobile}.png
├── public/                       # full source assets plus optional low-information slot references
├── src/                          # complete implemented site
└── package.json
```

The Transfer Kit is not a second package or manifest. It lets the Page Designer replace deterministic configuration, complete locale values, and declared asset slots without reconstructing the design or copying fields by hand.

Core owns the manifest and config schemas. The CLI owns discovery, projection, order materialization, deterministic post-processing, local-source pull, and validation.

## Asset contract

Each slot is either:

- `scalar`: one `output`;
- `bundle`: named `publications[]` plus one exclusive `extract-grid` postprocess.

`repochan/assets.json` mirrors the discriminant. `source` means the original finished Starter asset is present and buildable. `customized` means the pulled instance has replaced it for the target project. Source validation accepts the preserved original; `starter validate --localized` requires every required slot to be customized.

For a complex baked composition, the original full asset remains in the Starter. A slot may additionally reference a low-information migration guide, such as a pose line drawing produced by `official/hero-pose-lineart-extract`. The guide preserves composition and safe zones while reducing character or background identity; it never replaces the original artwork.

When character pose is not part of the transferable design, the migration guide should omit the silhouette entirely and preserve only safe zones, broad density, and architectural axes. `repochan-harbor` uses this pose-free form for both Hero and CTA.

All supported locale files must have the same complete recursive shape as the default locale, including keys, value types, and array lengths. Presentation colors live only in `repochan/site.json`; source files consume derived CSS variables.

## Commands

```bash
repochan starter list
repochan starter get minimal --json
repochan starter pull --starter minimal
repochan starter pull --from /path/to/creator-starter
repochan starter configure [--content-file content.json --overwrite]
repochan starter create-order hero-composite --intent "..." --foundation ord-foundation-001
repochan starter asset-apply hero-composite --order ord-hero-001 --overwrite
repochan starter validate minimal
repochan starter validate --output-dir .repochan/web-starter --localized
repochan starter validate --all
```

## Contributing a Starter

Starter Designer works in a creator-owned directory or repository. Official inclusion happens through a pull request containing the complete Source Starter, desktop/mobile previews, and validation/build evidence. The official package is not a direct output directory for the skill.

## Available starters

| ID | Original project site | Default |
|---|---|---|
| `caddy` | Caddy architectural automatic-HTTPS landing page | no |
| `character-game-page` | RepoChan game-HUD character profile page | no |
| `landing-anti-design` | RepoChan anti-design chaos bulletin board (experimental) | no |
| `landing-constructivist` | RepoChan constructivist poster-wall sequence | no |
| `landing-frutiger-aero` | RepoChan Frutiger Aero / Y2K glass landing page | no |
| `landing-glitch-os` | RepoChan glitch-art fake desktop OS | no |
| `landing-memphis` | RepoChan Memphis geometric playground landing page | no |
| `landing-museum` | RepoChan museum white-cube asset exhibition | no |
| `landing-neobrutal-zine` | RepoChan neo-brutal rock zine landing page | no |
| `landing-scrollytelling` | RepoChan dark-terminal scrollytelling theatre | no |
| `landing-solarpunk` | RepoChan solarpunk orchard growth narrative | no |
| `landing-toy-city` | RepoChan isometric toy-city pipeline sandbox | no |
| `landing-wireframe-morph` | RepoChan wireframe-to-render metamorphosis narrative | no |
| `marktext` | MarkText midnight Art Deco editorial landing page | no |
| `minimal` | RepoChan single-screen editorial Hero | yes |
| `redis` | Redis kinetic real-time signal-relay landing page | no |
| `repochan-harbor` | RepoChan bilingual continuous-harbor landing page | no |
| `sealed-scroll` | RepoChan continuous risograph seal-workshop landing page | no |

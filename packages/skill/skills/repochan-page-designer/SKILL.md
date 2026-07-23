---
name: repochan-page-designer
description: >
  RepoChan Starter Localizer. Select and pull a pre-designed complete Starter,
  apply project configuration, rewrite full locale, create and apply slot assets, run localization validation.
  Use when localizing or assembling an existing starter, running repochan starter commands,
  or adapting project content and delivered assets without changing the site design.
---

# RepoChan Starter Localizer

Apply a complete production Starter to a specific project; not responsible for original website design. The Starter's design already exists in previews, source code, and images; do not re-infer or rewrite it.

Do not add/remove sections, change information architecture, redo art direction, or alter core composition. When no suitable Starter exists, hand off to `repochan-web-designer`.

## Workflow

### 1. Select and pull production

```bash
repochan analysis get --json
repochan persona get --json
repochan starter sync          # Required when starters haven't been synced to local cache (first use after fresh install)
repochan starter list
repochan starter get <id> --json
repochan starter preview <id>  # Build and preview the candidate starter's live page directly in browser
repochan starter pull --starter <id>
```

Starters are not bundled with the CLI: when `starter list` shows none or prompts sync, first run `repochan starter sync` (downloads to `~/.repochan/starters/` cache; all subsequent operations are local). When choosing a starter, don't rely on static screenshots alone — use `repochan starter preview <id>` to build and walk through the candidate site live (desktop/mobile, locale switching), evaluating whether its section capacity, content structure, and visual relationships fit the current project. If needed, pull and inspect source code; always treat the production artifact as authoritative. If adapting would require design changes, switch starters or hand off to Web Designer.

You may also consume a trusted local Starter provided by a creator (`--from` path, bypassing the sync cache):

```bash
repochan starter pull --from <creator-starter-dir>
```

The default instance directory is `.repochan/web-starter/`. If it already exists, inspect first; do not `--overwrite` without explicit authorization. `repochan/starter.json` inside the instance is the sole manifest.

### 2. Apply project configuration

```bash
repochan starter configure
```

The CLI writes deterministic fields from analysis/persona into `repochan/site.json`. Do not manually edit `src/lib/site.ts`, nor manually copy mechanical fields.

### 3. Rewrite full locale

Read each `repochan/i18n/<locale>.json` as a structural template; keep all keys, value types, and array lengths, only replace content. Provide complete copy for all supported locales; do not delete fields that seem unnecessary or add/remove cards, which would change the information architecture.

```bash
repochan starter configure --content-file /tmp/repochan-content.json --overwrite
```

The CLI performs recursive validation on the full structure. See [data-mapping.md](references/data-mapping.md) and [copy-and-structure.md](references/copy-and-structure.md) for field sources and copy rules.

### 4. Customize required asset slots

In `repochan/assets.json`, `source` indicates the Starter's original production assets, ensuring runnability after pull; `customized` indicates replacement for the current project. All required slots must be customized.

```bash
repochan starter create-order <slot> --intent "<project-specific intent>" --foundation <foundation-order-id>
repochan order set-status <order-id> approved
repochan starter asset-apply <slot> --order <delivered-order-id> --overwrite
```

`create-order` handles mechanical fields and migration references already in the manifest; Painter delivers raw images; `asset-apply` completes declared post-processing, file projection, and `customized` status. Do not use Source Starter character assets as-is for current project customization, nor manually assemble protocol state.

For local assets already in final format such as real screenshots, use `repochan starter asset-import <slot> --file <path> --overwrite`. Bundle slice-grid, chroma, alpha QA, normalize, and named PNG projection must be completed atomically by `asset-apply`.

When `asset-apply` fails due to extract QA, determine the feedback action (increase padding / swap matte / layout-guide reference / split order) based on `defects` in the `--json` envelope, request Painter regenerate a new version, then re-run apply; do not manually slice PNGs or hand-edit `public/`. See [phase2-assemble.md](references/phase2-assemble.md) for the failure mapping table.

If the failure is `MissingImageMlCapabilityError` (error code `REPOCHAN_IMAGE_ML_MISSING`), it means the Page Designer's machine lacks the optional ML runtime, not a defect in Painter's raw image. Run `repochan image edit ml install` exactly once; on success, retry the previous `starter asset-apply` command as-is. If installation fails, stop and report — do not loop installation, nor request Painter regeneration. Current official Starters use offline `chroma-grid` for grid assembly; do not pre-install ML for normal workflows. It is only potentially needed when the manifest explicitly selects `bg-remove`, `ml-blobs`, or `hybrid`. Network downloads only occur during explicit install; post-install ML operations read from the capability cache using local runtime and models.

See [phase2-assemble.md](references/phase2-assemble.md) for full boundaries.

### 5. Localization validation

```bash
repochan starter validate --output-dir .repochan/web-starter --localized
pnpm --dir .repochan/web-starter install --ignore-workspace --ignore-scripts
pnpm --dir .repochan/web-starter build
```

Finally, cross-check against the Source Starter preview: desktop/mobile, all locales, keyboard, readability, clipping, overflow, and reduced-motion. Fix content, configuration, or asset mapping issues yourself; hand off design structure defects to Web Designer, and report Source Starter contract defects to Starter Designer.

## Completion criteria

- `site.json`, every full locale, and all required slots have been replaced for the project.
- `starter validate --localized` and build pass.
- The page preserves the Source Starter's design relationships, with no impromptu section redesign.
- Derived assets only go into the instance `public/`; original order results remain immutable.

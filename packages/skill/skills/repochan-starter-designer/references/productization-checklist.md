# Starter Productization Checklist

## Deliverable Fidelity

- Preserve the project name, repo URL, character name, exclusive tagline, all source code, and original visual assets.
- After pull, the original deliverable must be installable, buildable, and viewable without orders or RepoChan protocol history.
- `site.json`, complete `i18n/`, and `assets.json` are the explicit localization entry points.
- The presentation layer has no hardcoded colors; configurable copy is not scattered in duplicate across components.

## Minimum Migration Contract

- `repochan/starter.json` is the sole manifest; no second snapshot is maintained inside the directory.
- Desktop/mobile previews are both declared and their files exist.
- Keys, types, and array lengths are fully consistent across all supported locales and the default locale.
- Original deliverable assets in `assets.json` use `source`; every required slot has a runnable source output.
- Each slot only describes the asset the downstream needs to replace, the target path, the order template, the migration reference, and deterministic post-processing.
- Bundles use named `publications[]` + a single `extract-grid`; the Page Designer does not need to manually slice grids or assemble states.

## Complex Baked Images

- The original deliverable image remains intact and is not overwritten by low-information references.
- Migration references are not a default action: character pose lineart is only created when the character has a structural/spatial coordination relationship with H3/H4 layer elements (e.g., a button hovers above the palm, the character points to a specific title); **bleed cutout is the most typical scenario** — a bleed version entering a starter must be paired with pose lineart; poster-style placement does not need lineart.
- Pose lineart keeps only the character (pose, limb positions, gaze/pointing, silhouette) and strips all irrelevant information: scene, props, face, clothing, and rendering style.
- Scene composition references are treated separately from pose lineart: when conveying scene composition, note the purpose as "composition" in the slot description.
- Downsampling quality issues should be fixed in the corresponding template prompt, not by adding schema fields that no one consumes.

## Validation and Contribution

- `repochan starter validate --output-dir <creator-starter-dir>` passes.
- Source starter build passes; desktop/mobile, locale, keyboard, links, overflow, cutout, and reduced-motion pass browser checks.
- After `starter pull --from` into a fresh temporary directory, validate and build pass again.
- The creator retains ownership of the artifact; official inclusion uses a PR with previews and verification evidence.

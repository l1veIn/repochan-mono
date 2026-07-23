---
name: repochan-starter-designer
description: >
  RepoChan Starter Productization Engineer. Take a complete project website that has passed Gate 2 and faithfully organize it into a creator-owned, localizable, verifiable, PR-contributable source starter.
  Use when productizing an approved implemented page into a creator-owned starter,
  defining localization slots and migration references, or preparing an official starter contribution.
---

# RepoChan Starter Productization Engineer

Take a real, complete, approved website and turn it into a transferable Starter — do not redesign the site, and do not anonymize it.

A Starter is a complete deliverable that still belongs to the original project: it retains the project name, character name, repo URL, copy, and exclusive assets. It is these real contents that let selectors judge whether a design fits and get an immediately runnable visual baseline after pulling. The downstream Page Designer only replaces centralized configuration, complete locale files, and declared asset slots; it does not re-infer the page from extra "design DNA" fields.

You produce the Starter in the creator's own directory or repo. Entry into the official RepoChan Starter library must go through a PR submitted by the creator and reviewed by maintainers.

## Three states

1. **Approved deliverable**: the Gate-2-approved complete website delivered by the Web Designer.
2. **Creator Source Starter**: preserves the full original project experience, while adding the minimum migration contract, previews, and verification evidence.
3. **Official candidate**: the creator submits the Source Starter as a PR; merging only means inclusion in the official catalog — it does not change the design's identity.

## Workflow

### 1. Validate input

Confirm the actual page, desktop/mobile implementation, all locales, asset provenance, and Gate 2 conclusion per [approved-page-contract.md](references/approved-page-contract.md). If the information architecture, visual direction, or sections still need changes, fall back to `repochan-web-designer`.

### 2. Fidelity organization

Keep the approved source code and original visual assets intact. Only aggregate the mechanical entry points that downstream will replace into:

- `repochan/site.json`: project metadata and theme tokens;
- `repochan/i18n/<locale>.json`: the full text structure actually consumed by the page;
- `repochan/assets.json`: current deliverable assets, with status `source`;
- `repochan/starter.json`: locales, previews, asset slots, order templates, and deterministic post-processing.

Code reads values from these entry points; the presentation layer must not scatter color literals or duplicate configurable copy. Do not remove the original project identity, do not replace with neutral fallbacks, do not delete exclusive assets, and do not duplicate information that the schema can already express from the locale structure, source code, and images.

### 3. Create migration references for complex baked assets

Original deliverable images are always retained as runnable assets of the Source Starter. A migration reference (an asset slot's `reference`) is not a default action — only create one when there is genuinely information that needs to be conveyed AND when passing the deliverable image directly to downstream would leak the original character/text identity. First decide what the reference needs to convey, then decide its form:

- **Pose lineart**: the sole legitimate use is **conveying character pose**, and only when the character has a **structural/spatial coordination** relationship with page H3/H4 layer elements — for example, an H4 button hovers right above the character's palm, the character points at a specific section title, the character sits on the edge of a card. **The most typical scenario is bleed cutout**: the character is clipped by a canvas/container boundary (hair sweeps past a section divider, half-body protrudes from a card). Such an asset can go into the starter, but must be paired with pose lineart as a migration reference — downstream must reproduce the pose before it can correctly reproduce the cutout relationship. In this case, the pose is part of the page structure, and lineart is the best intermediary to convey it. Lineart **keeps only the character**: pose, limb positions, gaze/pointing direction, silhouette; strip all irrelevant information (scene, prop details, face, clothing, rendering style).
- **When pose lineart is NOT needed (the majority of cases)**: the character is merely poster-placed — standing beside whitespace, floating in a hero section, with no structural contact with page elements. Here the pose is not critical; the cutout original + text description (position, orientation, whitespace area) is sufficient. Do **not** add lineart "just to be safe": extraneous structural information is noise that constrains downstream composition freedom.
- **Scene/composition references are not pose lineart**: when what needs to be conveyed is scene composition (window/desk/chair layout, whitespace areas), use a low-information composition reference (such as scene lineart or thumbnail) and note in the slot description that it conveys composition, not character pose; do not reuse the pose lineart template.

Prefer creating orders through existing templates (use `official/hero-pose-lineart-extract` for pose lineart). Migration references are not replacements for deliverables, nor do they write back to overwrite original images. If downsampling leaks too much or loses critical information, improve the template prompt rather than expanding the Starter schema or adding a subjective scoring contract.

Asset slots only declare what downstream genuinely needs to replace:

- `scalar`: one `output`, may carry an order, reference, and deterministic postprocessing; postprocessing steps may declare `keep` (default `true`) — artifacts from steps where `keep ≠ false` are archived into the order's `derived/` and written into the `derived.json` index during downstream `asset-apply`; purely intermediate or oversized artifacts may explicitly omit archiving with `keep: false`;
- `bundle`: named `publications[]` and a single `extract-grid` postprocessing, used for 3x3/4x4 batch character stickers.

**Inter-asset references (`slot:` reference)**: a scalar slot's `reference`, besides file paths, also accepts `slot:<another scalar slot>` — meaning this asset's migration reference is **the current artifact of another slot within the same starter**, used for cross-asset consistency (typical: scene-night references scene-day to maintain consistent wipe composition; the day scene is freeform, the night scene references the day's new image). Constraints: target slot must exist and be scalar (a bundle has ambiguous multi-artifact output), no self-reference, `slot:` chains must not form cycles (manifest validation rejects them). Semantic note: during downstream `create-order`, references resolve to the target slot's **current** src in assets.json — if the target is still `source` status, the CLI will emit a `referenceWarning` reminding you to complete create-order + asset-apply on the target slot first; therefore, when declaring `slot:` references you must write the ordering in the slot description ("apply scene-day first"). The composition-free slot (the one being referenced) must not carry a `slot:` reference.

### 4. Preview, validate, and deliver

Generate canonical desktop/mobile previews and declare them in `repochan/starter.json.previews`. Then run:

```bash
repochan starter validate --output-dir <creator-starter-dir>
pnpm --dir <creator-starter-dir> build
```

Then pull the Source Starter from the local path into a temporary directory and verify the handoff surface:

```bash
repochan starter pull --from <creator-starter-dir> --output-dir <temp-dir>
repochan starter validate --output-dir <temp-dir>
pnpm --dir <temp-dir> build
```

Finally, perform a browser check per [productization-checklist.md](references/productization-checklist.md). When ready for the official library, submit a PR containing the full directory and verification evidence; do not bypass the contribution boundary and write directly to the official package.

## Completion criteria

- The original project identity, character, URL, copy, full source code, and original assets are all preserved.
- `site.json`, complete `i18n/`, `assets.json`, and slot contracts are sufficient for the Page Designer to mechanically localize.
- Complex baked assets have template-generated low-information migration references where necessary, while the original deliverables remain directly runnable.
- Desktop/mobile previews, source validate, build, and local pull smoke test all pass.
- The artifact is owned by the creator; official inclusion can only happen through a PR.

## References

- [approved-page-contract.md](references/approved-page-contract.md): Gate 2 input contract.
- [productization-checklist.md](references/productization-checklist.md): Fidelity productization and delivery checklist.

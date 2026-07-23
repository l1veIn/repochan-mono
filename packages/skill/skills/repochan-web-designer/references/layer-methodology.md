# Bake-Mask Layer Methodology

## Core Model

A complete master design contains four logical layers:

| Layer | Content | Default Strategy |
|---|---|---|
| L1 | Background, space, texture, atmosphere | CSS/live or composite with L2 |
| L2 | Character, illustration, project visual assets | Composite or transparent standalone asset |
| L3 | Titles, body text, artistic typography | Default HTML; may bake when tightly coupled |
| L4 | Buttons, cards, navigation, interactive UI | Must be HTML/live |

Use `bakedLayers` to represent which layers a production image includes, and `liveLayers` to represent which layers the web page rebuilds. Do not treat strategy names as fixed templates; each section decides its bake mask independently.

L1 can be further distinguished as base color plane L1a, shared seamless pattern L1b, and section-local atmosphere/transition L1c. These can be implemented separately via CSS, a shared tile, or mask/SVG/atmosphere assets, without needing to be merged into a single fixed background image.

## Decision Order

1. Is L4 interactive? If yes, keep it live.
2. Does L3 need i18n, SEO, or frequent modification? If yes, prioritize live.
3. Does L3 involve occlusion, interleaving, extreme perspective, or glyph interaction with the character? If yes, consider baking.
4. Does L2 have clean gutters, hard edges, a matte, or controllable silhouettes? If yes, it can be independently extracted.
5. Does L2 contain hair, translucent fabric, glow, particles, or environmental reflections? If yes, prioritize compositing with L1.
6. Does the character need independent parallax/cross-section motion? If yes, raise the priority of standalone L2 and accept the extraction cost.
7. Can the mobile viewport be satisfied through cropping and reflow? If not, generate a separate responsive variant.

## Responsibility Boundary Between Master Design and Production Assets

The visual master design is responsible for validating composition, rhythm, hierarchy, and section relationships — it is not responsible for simultaneously providing go-live-ready bitmaps. Even if the prompt requests an extractable character silhouette, judgment must be based on actual pixels:

- When hair strands, translucent fabric, glow, particles, and environmental reflections are coupled with the background, the master design must not be used directly as a standalone L2 source.
- When standalone L2 is needed, create a separate uniform-matte production order, then execute chroma-key/bg-remove and alpha QA via the CLI. Prefer offline, deterministic chroma-key; `bg-remove` requires an optional ML runtime. If `MissingImageMlCapabilityError` / `REPOCHAN_IMAGE_ML_MISSING` is received during a direct call, run `repochan image edit ml install` exactly once, then retry the original command; if installation fails, stop and report, do not loop. Network download only occurs during explicit install; at runtime the capability cache reads the local runtime and model.
- When alpha QA fails, prioritize generating a text-free, UI-free L1+L2 composite rather than repeatedly patching master design screenshots.
- The character's cross-section visual momentum does not require character pixels to actually cross boundaries; Git DAGs, energy trails, geometric borders, or CSS/SVG seams can carry the connection, thereby reducing coupling.

## Four Existing Cases

### 001: `baked=[L1,L2]`, `live=[L3,L4]`

Character is fused with the background; a regular content zone sits on the left. Text, navigation, buttons, and stats can all be accurately reproduced with HTML. This is the production-grade default pattern.

### 002: `baked=[L1,L2,L3]`, `live=[L4]`

Oversized typography is a spatial structure; the character sits between glyphs; perspective and occlusion are inseparable. Only the bottom-left CTA remains live. This pattern must confirm locale and accessibility costs.

### 003: `baked=[]` or decorative L1 only, `live=[L1,L2,L3,L4]`

The character has a white gutter around it; the silhouette approaches a natural matte and can be extracted as L2 via chroma-key. The background geometry, text, and UI can each be rebuilt with CSS/HTML, maximizing motion freedom.

### 004: Full master converted to `baked=[L1,L2]`, `live=[L3,L4]`

First, lock in a natural composition using the full master design, then extract a de-identified pose lineart, and redraw an L1+L2 composite without text/UI, referencing the target foundation. The minimal Hero is the first completed sample of this craft.

## Whitespace as Interface

A safe zone is not a "blank rectangle" — it is the interface between the image layer and live layer. It should record normalized coordinates and satisfy:

- Excludes face, hands, main silhouettes, or high-frequency decoration.
- The background still has continuous atmosphere, micro-texture, or glow, not a dead flat color.
- Text contrast is viable under the target palette.
- Content growth of approximately 30% still does not collide with the baked layer.
- Narrow viewports have a clear move, hide, crop, or alternative strategy.

## Inviolable Boundaries

- Do not bake clickable UI into images.
- Do not default to baking L3 just because the master design contains text.
- Do not use another project's finished character image directly as the current project's identity reference.
- Do not directly cut out the character from the visual master design and claim it as a production-grade transparent L2.
- Do not proportionally scale a desktop master design into a mobile viewport.
- Do not sacrifice semantics, keyboard, i18n, or readability in the name of "pixel fidelity."

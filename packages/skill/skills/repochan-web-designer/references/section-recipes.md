# Section Composition Recipes

Recipes are starting points, not a fixed schema. Each section still requires a bake-mask audit.

## Nav / Footer

- Default: HTML-first, all live.
- Image gen purpose: only to provide the full-page visual master design.
- Forbidden: baking navigation text or links into an image.

## Hero

- Default: `baked=[L1,L2]`, `live=[L3,L4]`.
- Assets: composition/pose reference + hero composite.
- Conditional variants: bake L3 when artistic typography is tightly coupled with the character; standalone L2 when the character has a clean gutter and needs motion.
- Safe zone: main copy area, CTA area, navigation clearance area.

## Capabilities / Features

- Default: L1a CSS + reusable L1b pattern, multiple standalone L2 chibi/icons, L3/L4 live.
- Assets: sliceable expressions, small character poses, or card decorations; do not use a whole "feature-area screenshot" as a background.
- Goal: each card genuinely expresses a feature; do not treat the character persona as a project feature.

## Workflow / Architecture

- Default: shared L1b pattern or local L1c decoration; flow nodes, connecting lines, titles, and descriptions live; prefer SVG/CSS for connecting lines.
- L2: may use one character at the flow start/end for guidance, without occluding step text.
- Forbidden: baking the entire flowchart that needs responsive reflow.

## Proof / Gallery

- Default: real content and project artifacts live; shared pattern may serve as low-contrast L1; only bake necessary background atmosphere and edge decoration.
- L4: filters, lightbox, links must be live.
- Goal: showcase verifiable deliverables; do not build an unsourced decorative image gallery.

## Narrative Band / Section Transition

- Default: standalone L2 cutout crossing section boundaries, L1/L3/L4 live.
- Applicable: character peeking out, pointing to the next segment, bridging across color blocks.
- Risk: alpha edges and mobile occlusion; must define a narrow-viewport hide or alternative placement.

## CTA

- Default: `baked=[L1,L2]`, `live=[L3,L4]`.
- Safe zone: centered or single-side headline/CTA zone.
- Goal: visual intensity may be high, but buttons, links, and legal copy remain live.

## Page Rhythm

- Do not place two full-bleed L1+L2 large images in consecutive sections.
- After a high-image-density section, arrange an HTML-first or low-noise section.
- The character does not need to appear on every screen; when present, it should serve guidance, explanation, or transition duties.
- Palette rhythm comes from combinations of `site.json` tokens; do not create section-private colors.
- The shared pattern is a visual vocabulary, not a repeated wallpaper at the same size, opacity, and phase in every section.
- Every non-trivial section needs an independent design reference or HTML-first decision; do not extrapolate solely from the Hero.

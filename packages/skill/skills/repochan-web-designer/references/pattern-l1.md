# Persona-Driven Shared L1 Pattern

## Positioning

The seamless repeating texture is a project-level shared L1, not a fixed screenshot of one section. It suits low-image-density areas such as Capabilities, Workflow, Proof, and around CTA — maintaining the Persona's visual identity at low asset cost.

Break L1 into:

| Sub-layer | Content | Recommended Implementation |
|---|---|---|
| L1a | Base color plane and large-scale light/dark | `site.json` token + CSS gradient |
| L1b | Shared thematic texture | Delivered seamless pattern tile |
| L1c | Section-local atmosphere and transitions | CSS mask/glow/SVG or standalone atmosphere asset |

## Generation Paths

### Persona-first

1. Read `signaturePatterns`, `keyMotifs`, palette, and art style.
2. Select 1–2 low-contrast concepts that can work across sections.
3. Use `official/pattern-tile` to create a `visual_pattern` order.
4. Use the delivered tile as a style reference for subsequent section design.

Suited for establishing a unified brand vocabulary first.

### Section-discovered

1. Complete a section or full-page master design first.
2. Identify background language within it worth reusing.
3. Use the master design as a style reference and abstract it into a seamless tile with `official/pattern-tile`.
4. After validation, promote it to shared L1 and backfill other sections.

Suited for avoiding the premature generation of useless textures. Both paths can coexist, but the same visual concept retains only one canonical delivered source.

## Template Constraints First

`official/pattern-tile` forbids text, numbers, labels, and watermarks. Version numbers, JSON field names, or semantic text from the Persona description must only be translated into diamonds, dashes, nodes, pseudo-glyph density, or non-semantic grids, and must not enter the prompt verbatim. A pattern is a material, not an information layer.

## Reuse Without Duplication

The same tile can produce different section states through tokenized CSS parameters:

- `background-size` controls pattern scale.
- opacity/overlay controls density and text contrast.
- `background-position` and mask control local visibility.
- Blend with the L1a color plane to form different color states.
- animation direction/speed expresses different narrative directions.

Do not copy a parameter-only-different image for each section. Parameters belong to section composition; the image still points to the same asset slot.

## Motion Boundaries

- Only move decorative layers; do not carry state or process information.
- Default to slow speed, low contrast; must not compete with the L2 character for attention.
- When `prefers-reduced-motion: reduce`, stop motion and the static composition still holds.
- When adjacent sections need a continuous background, share the tile, scale, and phase; use mask/gradient to change local density, without re-randomizing the starting point at boundaries.

## Validation

Generated results must run `repochan image edit validate-seams <tile> --out <qa-board.png>`, record the edge metric and threshold, and inspect the 3x3 board for center-repeating hotspots, text readability, and motion loops. A passing numeric score does not replace human-eye hotspot/readability QA; a template claiming "seamless" is also not validation evidence. The check board belongs to QA evidence only — it is not a production asset.

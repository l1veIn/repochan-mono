# Full-Page Art Direction and Section Coverage

## Three Execution Depths

### HTML-first

Suitable for websites with simple structure, deliberately hard-cut sections, and few characters or images. The full-page direction master may cover Nav/Footer and low-complexity sections, but every area without its own section master design must record an HTML-first rationale with a visual basis.

### Section-driven

Suitable for pages where sections are relatively independent. Generate a visual master design for each key section, perform bake-mask section by section; after final assembly, uniformly calibrate rhythm.

### Continuous art direction

Suitable for continuous scenes, multiple character appearances, complex transitions, color evolution across screens, or scrolling comic strips. First lock in the full-page master, then generate section master designs with adjacent context.

## Continuous Workflow

1. Define the real content skeleton, section responsibilities, and approximate height ratios.
2. Generate the full-page direction master, resolving light/dark rhythm, density, peaks and valleys, character frequency, color evolution, and opening/closing echoes.
3. At Human Gate 1A, select the full-page direction; the full-page master is not a production asset.
4. For each key section, prepare references: full-page crop, bottom of the previous section, top of the next section, foundation, shared pattern, and real content.
5. Generate section master designs separately, resolving local L1–L4, safe zones, and responsive interfaces.
6. At Human Gate 1B, inspect the section composition board and transitions before starting large-scale production assets.
7. Section by section, perform bake-mask, generate production assets, and rebuild live layers.
8. After full-page assembly, proceed to Gate 2.

When the full-page long image is constrained by generation size limits, use a compressed portrait overview to express rhythm, or generate multiple viewport bands with overlap regions. Do not treat distorted text, pixel heights, or details in the overview as implementation constraints.

## Section Provenance

Every non-trivial section must satisfy one of:

- `designReference`: points to the section master design order/version, and records the full-page/adjacent context sources.
- `htmlFirstDecision`: records why image generation yields no additional benefit, and which full-page or adjacent visual basis the section inherits.

Hero is a peer of other sections. Hero may be completed first, but must not become the sole design evidence for other sections.

## Transition Contract

Treat adjacent section boundaries as design objects. At minimum, record:

- `from` / `to` section.
- Continuous motif, motion direction, and visual energy change.
- Normalized anchors on the image side vs. live CSS/SVG side.
- Whether the pattern tile's scale/phase is continuous.
- Simplification, hide, or alternative strategy for desktop vs. mobile.
- Implementation method: hard cut, gradient/mask, composite+SVG, standalone transition asset, etc.

The transition contract describes relationships; it does not require every website to use continuous transitions. Hard-cut color planes are also a valid design choice, but must be a deliberate choice.

## Coverage Check

Before entering production, establish a section coverage table:

| Section | Design source | Bake mask | Shared L1 | Transition in/out | Responsive |
|---|---|---|---|---|---|

If Workflow, Proof, CTA, etc. are written directly by the agent based solely on Hero styles, coverage is not satisfied; they can only serve as structural prototypes and must not claim completed section design.

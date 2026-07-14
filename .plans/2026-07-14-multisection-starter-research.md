# Image-driven multi-section Starter research

> Status: RESEARCH MILESTONE 1
> Date: 2026-07-14
> Scope: bake-mask methodology, Starter Designer role, human visual gates, product gaps, and the path to RepoChan's first production multi-section starter.

## 1. Research question

How should RepoChan turn AI-generated full webpage designs into reusable Astro starters without sacrificing visual composition, semantic HTML, i18n, interaction, responsive behavior, or character portability?

The answer is not screenshot-to-code alone. The durable unit is a section composition recipe that decides which visual relationships are baked into raster assets and which remain live web layers.

## 2. Role boundary

```text
Starter Designer  authors packages/starters/<id>/ source molds
Page Designer     pulls a mold and assembles a target-project instance
Painter           executes approved image orders and preserves raw versions
CLI               performs deterministic projection, order materialization, postprocess, and validation
Core              owns schemas and pure composition/business rules once stable
```

Starter Designer is explicitly allowed to edit source starters. This does not weaken the invariant that Page Designer edits only pulled copies.

## 3. Layer model

- L1: background, space, texture, atmosphere.
- L2: character, illustration, project imagery.
- L3: headings, prose, expressive typography.
- L4: buttons, cards, navigation, interactive UI.

Each section has a bake mask. `bakedLayers` become production images; `liveLayers` are rebuilt in Astro/HTML/CSS.

Hard invariants:

1. Interactive L4 stays live.
2. Ordinary L3 stays live unless visual coupling justifies its cost.
3. Original starter character identity must not leak into migration references.
4. Desktop and mobile composition are separate design problems.
5. Safe zones are explicit interfaces, not accidental blank pixels.

## 4. Evidence from Hero 001–004

| Case | Bake mask | Finding |
|---|---|---|
| 001 | baked L1+L2, live L3+L4 | Default production balance; layout is regular enough for HTML reconstruction. |
| 002 | baked L1+L2+L3, live L4 | Typography is architecture; baking preserves perspective but costs i18n/editability. |
| 003 | layers separated | White gutter makes L2 extraction viable; highest motion freedom. |
| 004 | full draft → pose abstraction → baked L1+L2, live L3+L4 | Best current process; design first, remove identity, migrate through foundation. |

The earlier methodology described 004 as a full-composite strategy. More accurately, the complete image is the design prototype and the shipped minimal Hero is a transformed L1+L2 production asset.

## 5. Human-in-the-loop policy

Two mandatory gates:

1. Visual north-star selection before expensive extraction and migration.
2. Integrated-page acceptance after automatic validation/build.

One conditional gate covers irreversible choices: baked L3, locale-specific raster, uncertain alpha quality, or separate mobile artwork.

No human time is spent on schema, paths, hardcoded colors, missing files, build failures, or mechanical field transfer.

## 6. First multi-section starter hypothesis

Use RepoChan as canonical dogfood and keep the 004 manga-tech visual language to isolate process risk.

Proposed structure:

```text
Nav                 HTML-first
Hero                baked L1+L2; live L3+L4
Capabilities        live L1/L3/L4; independent chibi/icon L2
Workflow            decorative L1; live SVG/HTML flow; optional L2 guide
Proof/Gallery       live project assets and interactions; baked edge atmosphere only
CTA                 baked L1+L2; live L3+L4
Footer              HTML-first
```

This provides at least four different composition recipes and enough evidence to design a section schema.

## 7. Product roadmap

### Milestone 1 — methodology and skill

- Create `repochan-starter-designer`.
- Document bake masks, section recipes and visual gates.
- Keep future CLI calls out of executable instructions.

### Milestone 2 — dogfood design

- Produce two coherent visual directions for the full page or four key sections.
- Human Gate 1 selects one.
- Decompose Hero, Capabilities, Workflow and CTA.
- Record normalized safe zones and responsive rules outside Core while fields are still exploratory.

### Milestone 3 — first production starter

- Clone minimal into a new source starter.
- Implement locale content, source assets, Astro sections and fallbacks.
- Validate/build and run Human Gate 2.

### Milestone 4 — automation extraction

Based on observed repetition, implement in order:

1. `repochan starter clone`.
2. Core section composition schema.
3. Authoring order materialization.
4. Deterministic render/screenshot comparison.
5. Alpha-edge and safe-zone quality reports where justified.

## 8. Research exit criteria

The research phase is complete when:

- another agent can follow the Starter Designer skill without hidden conversation context;
- all instructions correspond to existing commands or are explicitly labeled future work;
- 001–004 can be explained by the bake-mask model;
- human visual involvement is bounded to the declared gates;
- the first multi-section starter experiment has a concrete structure, asset plan and automation backlog.

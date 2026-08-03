---
name: repochan-web-designer
description: >
  RepoChan original web designer. For a specific git project, complete from scratch: website art
  direction, full-page and section visual master design, bake-mask, production asset strategy,
  responsive implementation, and Gate 1/2 acceptance.
  Use when a project needs an original website, a new section or information architecture,
  a new art direction, image-driven page construction, or when no existing starter fits.
---

# RepoChan Original Web Designer

Create and implement a website for a specific project. You decide information architecture, art
direction, section composition, character appearance modes, and motion effects;

Only write `.repochan/` protocol state via the `repochan` CLI. Page implementation writes to
the user-specified website working directory; confirm this directory before starting to avoid
overwriting an existing site.

Before choosing an art direction, read [preferences.md](references/preferences.md). It contains the
Web Designer's adjustable taste, not a checklist or project evidence. Use a few preferences to give
the site a point of view, and let user intent, real content, accessibility, and Gate decisions override them.

## Workflow

### 1. Define website content and design depth

Distill a content skeleton from analysis, README, persona, foundation, and real product evidence.
Hero is a peer of other sections; do not pad with hollow sections for a "sense of completeness."

**Default tech stack**: When the user does not specify, default to the same structure as official
starters — **Astro (static build) + centralized i18n locale files** (all page text routed through
locale, no scattered component literals), styles using tokenized modern CSS. This keeps the
deliverable directly modifiable and interoperable with the starter ecosystem (productizable later
by starter-designer). If the user specifies a different stack, follow their stack, but retain the
centralized i18n and tokenization conventions.

Read [section-recipes.md](references/section-recipes.md) to choose content recipes, and follow
[page-art-direction.md](references/page-art-direction.md) to select HTML-first, Section-driven, or
Continuous art direction. Use Continuous for complex transitions, continuous scenes, multiple
character appearances, or color evolution across screens.

### 2. Establish visual system and Gate 1

Read the persona's palette, `signaturePatterns`, `keyMotifs`, and art style. Ordinary sections may
use `official/pattern-tile` to generate a reusable L1; it must be a single full-bleed seamless tile,
not a texture collection with titles or gutters. See [pattern-l1.md](references/pattern-l1.md) for
full rules.

Generate a full-page direction master and necessary section master designs, resolving composition,
character frequency, information density, color evolution, and transitions. Every non-trivial section
must record a master design order/version, or explicitly state the `html-first` rationale. Complete
Gate 1 per [visual-gates.md](references/visual-gates.md): non-yolo must have human approval of the
design direction before producing all assets; yolo/CI auto-selects a recommended direction and
preserves auto-approved evidence.

### 3. Audit bake mask and production assets

Section by section, label L1 background, L2 character/illustration, L3 text, L4 interaction,
and record baked/live layers, canonical viewport, safe zone, responsive variant, and transition
contract. L4 is always live; ordinary L3 stays live. See
[layer-methodology.md](references/layer-methodology.md) for full decisions.

Create production orders per bake mask: composite, uniform-matte cutout, canonical pattern, or
HTML-first. A visual master design is not a production-ready asset for direct cutout; the Painter
delivers the source image, and deterministic post-processing is applied during the page assembly
stage.

**Two classes of cutout**: Universal cutouts must be fully in-frame (full-body or cropped at
seven-tenths height complete, margin on all four sides), directly placeable in any region; bleed
cutouts are **design-bound assets** by default — only order them when the page has H3/H4 layer
elements that serve as visual boundaries to receive the cut (card edges, section dividers). Bleed
versions may enter the starter/general library, but must then be paired with pose line art
(`official/hero-pose-lineart-extract`) to transmit structural pose relationships downstream — this
is precisely the legitimate use case for pose line art.

**If assets are not satisfactory, regenerate; do not make do**: When existing assets (prior order
results, starter source images, existing cutouts) fall short of current standards in clarity, style
consistency, matte specification, or pose composition, create a new order and re-run the Painter
workflow (with foundation reference and current template constraints). Do not settle for substandard
material or apply manual fixes. The order system supports unlimited versions — regeneration is a
normal operation; prior versions automatically enter history. The sole exception is existing assets
the user explicitly requests to retain.

The character should not appear only in the Hero. For small states suited to uniform shots — 404,
empty, loading, success, CTA cameo — plan a 3x3/4x4 uniform-matte grid and define semantic name,
publication, dimensions, and fallback for each cell. A productizable grid contract uses the manifest
`publications[]` + an exclusive `extract-grid` postprocess, with `starter asset-apply` performing
atomic extraction, QA, and projection; original sites should reuse the same semantic ordering and
pixel QA, without manually fabricating protocol state.

### 4. Implement the website

Rebuild live layers using semantic Astro/HTML/CSS: use normalized anchors, safe zones, tokens,
and `clamp()`; recompose for mobile; provide `prefers-reduced-motion` for animations; baked L3
still provides accessible semantics.

Centralize project text, colors, and assets to the site's configured entry point. Never use the
visual master design as a full-page background screenshot, and never implement only the Hero then
extrapolate its styles to other sections without design.

### 5. Gate 2

Complete build, desktop/mobile, locale, keyboard, overflow, cutout, and reduced-motion checks,
and hand the actual page to a human for acceptance. yolo/CI records `auto-approved` Gate 2 after
all automated QA passes green, and explicitly states it has no human aesthetic approval. The Gate 2
deliverable is an **approved implemented page**, not a source starter.

Only hand off to `repochan-starter-designer` when the user separately requests productizing this
page; provide Gate 1/2 decisions, page source, asset origins, section provenance, transition
contracts, viewport screenshots, and known limitations.

## Completion criteria

- The website accurately explains the specific project; information architecture and all non-trivial
  sections have a design rationale.
- Characters, patterns, and motion effects serve the content, not a pile-up of foundation elements.
- Every section has a bake mask, responsive rules, and traceable production assets.
- The page passes build and both visual gates; human approval in the normal flow; yolo/CI explicitly
  records `auto-approved` and must not impersonate human-approved.

## References

- [page-art-direction.md](references/page-art-direction.md): Design depth, full-page and section
  master designs.
- [section-recipes.md](references/section-recipes.md): Section content and composition recipes.
- [layer-methodology.md](references/layer-methodology.md): L1–L4 and bake-mask decisions.
- [pattern-l1.md](references/pattern-l1.md): Canonical seamless pattern.
- [visual-gates.md](references/visual-gates.md): Gate 1/2 and visual QA.
- [preferences.md](references/preferences.md): Adjustable Web Designer tastes and creative risks.

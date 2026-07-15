# Multi-section Starter Design Research — Three-route report

Date: 2026-07-15
Branch: `codex/starter-designer-research`

## Executive conclusion

The image-driven workflow is viable beyond a Hero-only example, but it should not collapse every site into one visual structure. The reusable product is a common production protocol with multiple starter archetypes:

1. whole-page direction for rhythm and transition language;
2. independent section masters for every non-trivial section;
3. a per-section bake mask and responsive contract;
4. dedicated production assets rather than shipping design masters;
5. live L3/L4, centralized theme/content/assets, and production-preview QA;
6. structured evidence for human Gate 1A, Gate 1B, and Gate 2.

All three routes produced working bilingual seven-section Astro sites from the `minimal` source starter without modifying the source starter. The final pages use no display-layer color literals. Each route independently demonstrated that Hero and ordinary sections can share one workflow while choosing very different layer strategies.

## Experiment controls

Common information architecture:

`Nav → Hero → Capabilities → Workflow/Architecture → Proof/Gallery → CTA → Footer`

Common rules:

- pinned analysis, Persona, and Foundation version;
- two whole-page directions before section production;
- independent design provenance for Hero, Capabilities, Workflow, Proof, and CTA;
- explicit `htmlFirstDecision` for Nav and Footer;
- L3/L4 live by default;
- a dedicated production Hero composite, never a crop of the section master;
- real project content and real proof assets;
- desktop, 390px, longest locale, keyboard, overflow, and reduced-motion QA;
- production preview screenshots, not development-server screenshots.

Independent variables:

| Route | Repository | Art direction | Section relationship | Complexity | Motion hypothesis |
| --- | --- | --- | --- | --- | --- |
| A | Redis | kinetic data manga | continuous ribbon corridor | high | page-level data path + drifting canonical tile |
| B | Caddy | constructivist trust registry | intentional hard cuts + centered seals | medium / HTML-SVG-first | module reveal + static seal spine |
| C | MarkText | midnight Art Deco editorial | motif handoff + gallery climax | mixed, Gallery-heavy | shared spine + paper/ink drift + scroll-snap |

## Human visual gate record

The root design supervisor performed the human visual decisions under the user's authorization to run the experiment to completion.

### Route A — Redis

- Gate 1A approved: `Pulse Corridor` + comet-filament Pattern B.
- Reason: one continuous ribbon and lower character frequency tested the continuous-page hypothesis with less production coupling than the hot-to-cold alternative.
- Gate 1B approved: five section masters formed one coherent cream/indigo/crimson page while retaining different information structures.
- Gate 2 initially rejected: Astro dev toolbar contaminated screenshots and the 390px Hero cropped out the character's face.
- Gate 2 approved after revision: production-preview capture, clean Hero composite, and explicit mobile content/art zoning.

### Route B — Caddy

- Gate 1A approved: `Trust Registry` rather than `Automatic Passage`.
- Reason: hard cuts, centered seal nodes, and live geometry provided the cleanest test of an HTML/SVG-first route.
- Pattern decision: three generated tiles were rejected as strict canonical bitmaps. The final shared L1 is deterministic CSS/SVG; the images remain style/local-atmosphere evidence only.
- Gate 1B approved after polluted adjacent-context candidates were rejected and regenerated.
- Gate 2 approved visually: desktop and 390px implementations preserve registry rhythm, hard cuts, centered seals, and readable live content.

### Route C — MarkText

- Gate 1A approved: `Midnight Ink Salon` + warm-paper Ink Echo Pattern B.
- Reason: the brass spine, alternating plates, and Gallery climax created the strongest editorial identity and the most useful Gallery stress test.
- Gate 1B approved: five masters kept one motif vocabulary without repeating one layout.
- Gate 2 conditionally rejected by independent audit: Gallery category labels were fake controls and the spine contract stopped before Gallery/CTA.
- Gate 2 approved after real tabs/tabpanel behavior, keyboard control, full spine/track handoff, reduced-motion-aware JS, and complete localized accessible names were implemented.

## Route outcomes

### A. Redis — Pulse Corridor

- Preview: `http://127.0.0.1:4321/` and `/zh/`
- Report: `test-repos/redis/.repochan/research/route-a-report.md`
- Desktop: `test-repos/redis/.repochan/research/gate2/redis-desktop-full.png`
- Mobile: `test-repos/redis/.repochan/research/gate2/redis-mobile-390-full.png`
- Production strategy: Hero `[L1c+L2]` composite; all other content and the cross-section ribbon live.
- Pattern: one canonical low-interference tile, rendered in a page-level coordinate space.
- Cost: 11 actual generations, including one Gate 2 Hero revision.
- Final page status: PASS.
- Reusable instance-contract status: CONDITIONAL because new locale fields are not all schema-required and visual evidence lacks source/build hashes.

### B. Caddy — Trust Registry

- Preview: `http://127.0.0.1:4325/` and `/zh/`
- Report: `test-repos/caddy/.repochan/web-starter/ROUTE-B-REPORT.md`
- Desktop: `test-repos/caddy/.repochan/web-starter/qa/desktop-en.png`
- Mobile: `test-repos/caddy/.repochan/web-starter/qa/mobile-en.png`
- Production strategy: one Hero `[L1c+L2]` composite; Capabilities, Workflow, Proof, CTA, transitions, and L1 are live HTML/CSS/SVG.
- Pattern: three prompt-generated candidates failed strict edge comparison; no bitmap was promoted as canonical.
- Cost: 12 route orders and 17 result versions.
- Final page status: PASS.
- Reusable instance-contract status: CONDITIONAL because seven-section locale coverage is not represented in the pulled manifest, `site.json.repositoryUrl` inherited the monorepo URL, and browser QA evidence is not yet standardized.

### C. MarkText — Midnight Editorial Gallery

- Preview: `http://127.0.0.1:4323/` and `/zh/`
- Report: `test-repos/marktext/.repochan/research/marktext-route-c/final/route-report.md`
- Desktop: `test-repos/marktext/.repochan/research/marktext-route-c/final/marktext-desktop-full.png`
- Mobile: `test-repos/marktext/.repochan/research/marktext-route-c/final/marktext-mobile-full.png`
- Production strategy: Hero `[L1+L2]` composite; live editorial sections; Gallery uses repository screenshots with exact file provenance.
- Pattern: warm-paper tile is shared L1; dark Deco tile is a masked, non-continuous atmosphere only.
- Cost: 10 orders and 11 generated images.
- Final page status: PASS after audit-driven interaction and transition fixes.
- Reusable instance-contract status: CONDITIONAL until section/transition contracts and local asset import become structured CLI-managed data.

## What the experiment proved

### 1. Whole-page direction and section generation are complementary

The whole-page direction is valuable for density, palette progression, character frequency, and transition language. It cannot substitute for section masters. All three routes needed section-specific masters to discover local safe zones, information hierarchy, responsive reflow, and production bake masks.

### 2. Ordinary sections still benefit from image generation

The output does not have to become a bitmap. Capabilities, Workflow, and Proof masters were useful design evidence even when their final implementation was entirely HTML/CSS/SVG. This is the central correction to the earlier Hero-first shortcut.

### 3. The production boundary is stable

- design master: composition evidence;
- production composite: dedicated no-text/no-UI generation with Foundation + composition references;
- live page: semantic copy, controls, responsive structure, and interactions;
- proof: real repository assets, never generated fake UI.

This boundary held across all three routes.

### 4. Seamless is a measured property, not a prompt adjective

Redis produced two visually successful tiles. MarkText produced one useful canonical tile and one masked accent. Caddy failed three strict edge tests even when the third tile appeared seamless to the eye. The workflow therefore needs an explicit seam threshold, 3×3 board, canonical disposition, and deterministic fallback.

### 5. Adjacent context must be structural, not semantic

Caddy section masters invented status, metrics, code, footer destinations, and dates when neighboring sections were supplied as ordinary visual/content context. The safe contract is:

- boundary palette;
- motif and normalized anchor;
- narrow overlap geometry;
- explicitly no neighboring copy, metrics, links, UI, or status.

### 6. Mobile is a new composition

Redis initially passed build and overflow checks while completely losing the character's face on mobile. A valid mobile gate must check the face, primary action, live-copy order, and CTA collision—not only `scrollWidth`.

### 7. Visual QA needs environment provenance

Astro's development toolbar was mistaken for pixels in a Hero asset, causing an unnecessary regeneration. Gate 2 must capture a production build and record build hash, browser/version, viewport, locale, motion setting, and screenshot provenance.

### 8. L4 must be behaviorally real

MarkText's first Gallery looked complete but used `<span>` elements that resembled filters. Visual similarity is insufficient. A starter validator or browser audit should identify controls that look interactive but have no semantics or behavior.

## Schema and product gaps

### P0 — required before productizing a full starter

1. **Instance capability / section coverage schema**
   - Preserve `repochan/starter.json` as the source starter snapshot.
   - Add a separate instance layer for assembled sections, design references, bake masks, safe zones, responsive rules, motion, and transition contracts.
2. **`pattern validate-seams` and optional normalize**
   - Edge deltas, threshold, 3×3 board, hotspot/readability checks, and canonical disposition.
3. **Structured section order creation**
   - Section identity, real content payload, previous/next transition anchors, and context-only boundary rules.
4. **Production visual QA command**
   - Build + preview + desktop/mobile/locale capture + overflow + keyboard + reduced-motion + image failures; persist source/build hash and browser metadata.
5. **Human gate decision artifact**
   - Candidate versions, selected version, approver, time, decision, preserved relationships, and conditional exceptions.

### P1 — high-value atomic CLI work

1. `starter asset-import --slot --file` for repository screenshots and other local proof assets.
2. Fix `starter asset-apply --version` parser conflict.
3. `starter install` with nested-workspace isolation.
4. Explicit repository URL/provenance override for nested test repositories.
5. Atomic instance slot/content-path mutation rather than manual manifest edits.
6. `starter audit-sections` and `starter audit-content`.
7. Ready-file existence, component asset reference, actual image dimension, and locale completeness validation.

### P2 — template and skill refinement

1. Add a dedicated whole-page direction template instead of overloading the 3:2 section template.
2. Add explicit `copySide`, normalized safe zones, mobile composition, and context-only transition fields to section/Hero templates.
3. Remove the remaining Painter guidance that assumes a four-panel pattern sheet when `official/pattern-tile` is a single full-bleed tile.
4. Standardize visual gates on production preview and require environment-overlay checks.
5. Add real-interaction checks for L4 and JS-aware reduced-motion checks.
6. Record approved production exceptions, such as MarkText's `#` hair clip being identity decoration rather than semantic text.

## Recommended starter strategy

Do not turn one of these three pages directly into a universal starter. Productize the shared protocol first, then create at least three archetypes:

1. **continuous-corridor** — Redis-like, page-level motif, one or two composites, high transition continuity;
2. **registry-modular** — Caddy-like, HTML/SVG-first, hard cuts, deterministic geometric L1;
3. **editorial-gallery** — MarkText-like, real product evidence, scroll-snap Gallery, motif handoff.

`minimal` remains the source template and regression baseline for starter mechanics. It should not be inflated into the full starter.

## Milestone decision

The research milestone is successful. The next implementation milestone should not begin by polishing one page. It should first encode the P0 contracts in Core/CLI and update the Starter Designer / Painter guidance, then promote one route at a time into a reusable source starter with schema-backed validation.

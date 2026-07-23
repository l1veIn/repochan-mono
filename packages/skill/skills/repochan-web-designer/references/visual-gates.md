# Human Visual Gates

The following gates are decided by a human in the normal interactive flow. Only when the upstream wizard has explicitly entered yolo or non-interactive CI may the agent auto-select a recommended candidate and record `auto-approved`; the record must include the candidate, selection rationale, automated QA, and a "no human aesthetic approval" marker, and must not falsely claim human-approved.

## Gate 1: Visual Master Design Selection (Mandatory)

Timing: after complete master design candidates are finished, before large-scale layer separation and migration begin.

Show the human:

- The full-page long image, or a Hero/Capabilities/Workflow/CTA composition board.
- 2–3 meaningfully different directions, not a large number of near-identical variants.
- A one-line design intent and the main engineering risk for each direction.
- In research mode, one additional improved candidate targeting a specific hypothesis may be attached, but must state what it validates; do not equate tweak count with exploration quality.

Only ask: which direction is worth implementing, which relationships must be preserved, and which content does not match the project's character.

Do not ask the human to check: schemas, paths, hardcoded colors, build results, or field integrity.

Continuous art direction splits Gate 1 into two checkpoints within the same production gate:

- Gate 1A: select the full-page direction, rhythm, character frequency, and transition language.
- Gate 1B: inspect the key section master design composition board, confirming that local design has not deviated from the full-page direction and section coverage is complete.

Large-scale production assets still must not begin before Gate 1B; areas explicitly designated as HTML-first (Nav/Footer, etc.) do not require separate master design generation.

## Conditional Gate: Irreversible Layer Trade-Offs

Only triggered by the following situations:

- Preparing to bake L3 into an image.
- A specific locale requires a separate image version.
- The alpha/gutter quality of standalone L2 shows clear defects.
- Mobile requires a second set of production images.
- A genuine conflict arises between visual fidelity and accessibility/maintainability.

Provide a clear recommendation, cost, and reversibility; do not dump open questions on the user.

"The master design looks cuttable" does not bypass this gate. Alpha QA must first be run against a dedicated uniform-matte production result; the master design screenshot itself does not count as extraction quality evidence.

## Gate 2: Full-Page Integration Acceptance (Mandatory)

Timing: after all sections are assembled, and automated validation and build have passed.

Show the human:

- The desktop full page and key interactions in the default locale.
- At least one narrow viewport.
- A representative page with the longest copy from other locales.
- A summary of the main differences from the Gate 1 master design.

Let the human judge: visual rhythm, character appearance frequency, unity, content hierarchy, whether the mobile viewport still looks designed, and whether the specific project website is approved for delivery.

## Automation First

Before entering Gate 2, the following must be completed automatically: manifest/config/content/assets validation, hardcoded color check, Astro build, basic link and keyboard check, viewport overflow check. Do not consume human visual time when automated issues are unresolved.

Gate 2 screenshots must come from the production build/preview, recording source/build hash, browser/version, viewport, route, locale, motion setting, and screenshot path; first exclude environment UI such as dev toolbars and extension overlays. L4 must not merely "look like controls": check semantics, keyboard behavior, state changes, and reduced-motion-aware JS. For mobile, beyond overflow, also check character face/body, main CTA, and live copy order and collisions.

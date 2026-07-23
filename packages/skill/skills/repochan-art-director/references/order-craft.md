# Order Craft Philosophy & Foundation Sheet Content

## Order Craft Philosophy

An Asset Order is a commissioning brief. It defines intent, constraints, acceptance criteria, and deliverables, leaving artistic execution to the Painter. Avoid pixel-precise camera/layer instructions unless technically necessary.

The `references` field is not optional decoration — it is the mechanism by which the Painter knows what the character looks like. Without it, every generation is blind prompting with no visual continuity.


### Brief-Writing Discipline

**Positive description drives the image; the `avoid` list is a guardrail, not a steering wheel.**

Image models don't understand "not X" as a boundary — they treat negation as a direction vector. "Not sci-fi" won't land on "modern style"; it will overshoot into "pre-electronic era" or "grungy and dilapidated." Follow these rules when writing briefs:

1. **Describe what you want, not what you don't want.** Write "modern university lab, fluorescent lighting, pragmatic architecture" — not "no sci-fi, no cyberpunk."
2. **`mustInclude` is the primary description carrier.** Fill it with concrete positive visual anchors: specific scenes, materials, lighting, atmosphere.
3. **`avoid` is a lightweight trailing guardrail.** Use sparingly for hard exclusions that truly cannot be expressed positively (e.g., "complex backgrounds," "text annotations"). Don't use `avoid` as a substitute for positive description — the Painter will transform or discard avoid items; overstuffing wastes signal.
4. **Prefer multi-word qualifying phrases over single adjectives.** Single English adjectives have an outsized semantic radius in image models. "shabby" → dirty/cheap; "disheveled" → unkempt and messy. Use "well-worn but maintained," "slightly tousled" instead.


### Identity Boundaries

Don't convert natural language evidence into visual requirements. README/docs/commit/UI language may influence text written for users, but must not create culturally encoded `mustInclude` entries such as scrolls, seals, lanterns, bamboo, jade, kimono, shrines, quills, castles, etc. Such elements are only allowed if one of the following is true:

1. The user explicitly requested them.
2. The repo/product/domain itself is related to that culture/material/era.
3. The currently approved persona/foundation sheet anchor already includes them, and the user is maintaining that direction.

If an element fails this check, replace it with a repo-derived metaphor — from `analysis.context.identity`, `preAnalysis`, `abstract`, the color palette, or the product domain.


## Foundation Sheet Cover Content Guide

The foundation sheet cover should include, on a single image:

| Element | Description |
|---------|-------------|
| Full-body pose | The mascot's signature standing pose |
| Chibi | A simplified/chibi version of the character |
| Expressions | 3-4 avatars showing key emotions (happy, serious, surprised, etc.) |
| Color palette | Swatches of main, secondary, and accent colors |
| Key elements | Signature items, accessories, or visual motifs |

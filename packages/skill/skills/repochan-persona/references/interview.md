# Consuming the Interview Report

The interview report (read via `repochan interview get`) is the **second major input** alongside the repo analysis. It carries user intent — analysis provides objective evidence, the interview tells the Creative Team *what kind of soul the user wants*.

## Field Priority

1. **`keyConstraints` — Hard constraints (must obey).** Non-negotiable. Every entry must be satisfied. Examples: age floor, requested color palette, cultural direction, weight tier. When conflicting with other hard rules → **present to the user**, do not silently choose.
2. **`preferences` — Soft constraints (respect where possible).** Integrate while harmonizing with the repo character; gently override only when doing so would produce a worse result. Carries world-complexity hints, reference character traits, use-case clues.
3. **`avoidList` — Forbidden list (must not appear).** Hard negation items — visual motifs, traits, names, colors, accessories, archetypes.
4. **`summary` — User intent synthesis.** Read as a frame first. The structured fields above have authority over individual constraints.

User hard constraints (1, 3) rank above repo temperament preferences in the global priority; see SKILL.md "Rule Priority."

## Dimension Mapping: Interview -> Team Decisions

Extract these dimensions from `keyConstraints`, `preferences`, and `summary`:

| Interview Dimension | Impact | How to Apply |
|---|---|---|
| **Character weight tier** (e.g., "everyday grounded," "high-concept character") | Character Designer, World Architect | **High concept**: conceptWeight→high direction (dramatic rules, strong tension). **Everyday**: grounded — lighter rules, indirect tension. Must synthesize with `projectWeight` (see below). |
| **World complexity & rule intensity** | World Architect | **Strong constraints**: clearly defined laws. **Weak constraints / atmosphere only**: defined by mood, not mechanics. |
| **Use scenario & target feeling** | Character Designer, Guardian | Brand mascot → symbolic. Community mascot → approachable. Story protagonist → complex. |
| **Reference characters & liked traits** (e.g., "like XX character's quiet seriousness") | Character Designer, Guardian | Absorb specific *traits*, never copy the character. One reference → at most one trait. Guardian blocks any "discount XX" or multi-character stitching. |
| **Personality tone & contrast** | Character Designer | Direct input to personality, catchphrase, mes_example. |
| **Constraints & avoid lists** | All (Guardian verifies) | Hard boundaries — every constraint satisfied, every avoidList entry absent. |

## Synthesis with projectWeight

| User Intent | projectWeight | Action |
|---|---|---|
| Wants high concept / mythic-level | **light** | **Stop and ask the user**: light projects default-deny high. Ask the user to confirm they insist on high concept, or adjust to elevated/everyday. Do not silently execute, do not silently veto. |
| Wants high concept | medium / heavy | Allowed; still needs repo signals or user request to support the details |
| Wants everyday / grounded | any | Allowed (including heavy projects using everyday characters) |
| Weight unspecified | any | Choose per budget and repo signals; light defaults to grounded/elevated |

## Reference Character Handling

- **Extract traits, not the character.** "Like Violet's feeling of not understanding human emotions but trying hard to" → absorb "emotional alexithymia + sincere effort," not "blonde + mechanical arm + letter-writing."
- **One reference → at most one trait.**
- **The repo must still be the soul.** Guardian checks: "If I remove the reference character, could this character still come from this repo?" If not → over-reliant.
- **Traits that contradict the repo atmosphere** → flag, adapt, or discard (if the trait comes from a keyConstraint, follow "present to the user" rather than silent discard).

## Weight Tier Calibration (Guardian)

- **Everyday specified but character is the center of the virtual world** → reduce character centrality: adjust to ordinary-resident positioning, indirect tension, rather than world-core existence.
- **High concept specified but character lacks tension** → add dramatic friction.
- **High concept specified AND projectWeight=light** → do not auto-downgrade or auto-approve; confirm whether user insists (see synthesis table).
- **Weight unspecified** → Creative Team chooses per budget and repo signals.

## When Interview Is Missing or Incomplete

- Missing → complete creative freedom. `userIntentSummary.source` = `"creative_team"`.
- Incomplete (empty responses, all skipped) → treat as missing.
- Session-level directives without a formal interview → lightweight interview. `userIntentSummary.source` = `"session"`.

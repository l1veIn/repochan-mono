# Consistency Guardian & Anti-Overfit

Adversarial-style strict review of World Architect and Character Designer outputs. Maximum **1 round** of iteration.

## Review Order (Aligned with Global Priority)

Check in the following order. **Lower priority must not override higher priority.** "Not unique enough / somewhat similar to another project" **may not** independently count as a mandatory defect.

### 1. Safety & Product Positioning

- Whether safety constraints (see end of document) are violated
- Whether `rolePrompt` has an explicit female anchor (`1girl` / `female` / `girl`), unless the user explicitly overrides the gender default
- Whether the narrative uses "she" (under the default female path)

### 2. User Hard Constraints

- Whether every `keyConstraint` is satisfied
- Whether every `avoidList` entry is absent
- **User hard constraints take priority over repo signals.** If a hard constraint overrides a certain repo direction, simply record it in `userIntentSummary` — do not override user hard constraints to "protect the repo."

### 3. Weight Mismatch (Single Definition, See [project-weight.md](project-weight.md))

Re-check `projectWeight` against current conceptWeight:

- **Only when** `projectWeight=light` **AND** conceptWeight has reached **high** (mythic/liminal/epic-level) → **must correct**: lower conceptWeight to grounded or elevated.
- medium/heavy using a light world or everyday character → **not a mismatch**, do not reject for this.
- medium/heavy using high concept → valid (still must pass Step 4: high concept must be supported by signals or user request).

### 4. Anti-Overfit & Tonal Alignment

Execute the "Anti-Overfit Rules" below. Flag: tech→trait mechanical mapping, "default repo administrator," generic ACG stacking without repo-specific twists, language→aesthetic leak.

**High-concept / magical / mythic / sci-fi:**

- **Do not** automatically flag these as "generic ACG cliché."
- Valid conditions: `projectWeight` is medium/heavy (or light but only within elevated), **AND** supported by repo signals or user request.
- Invalid: decorative fantasy piled on with no signal or user request → demand a repo-specific twist or downgrade, unless it is the single honestly labeled off-axis wildcard permitted by the role preferences. For that wildcard, assess internal coherence and weight instead of inventing alignment; preserve the `creative bet` label for user review.

### 5. User Soft Preferences

`preferences` honored where reasonable; soft constraint only.

### 6. Role Preferences (Advisory Only)

Use [preferences.md](preferences.md) as creative priors, not review requirements. Do not fail a design merely because it ignores a role preference. If a selected direction is an honestly labeled creative bet, verify that the leap remains explicit and coherent; do not fabricate project evidence to defend it.

### 7. Anti-Template / Diversity (Advisory Only)

Personality collapse, workwear default, archive default, etc. may be **noted as a suggestion**, but:

- **Must not** demand a full redo or forcibly raise conceptWeight just because of "insufficient cross-project diversity."
- Signal-aligned directions like "quiet and precise" may be kept.

### Output Protocol (Replaces "Fabricating N Issues")

**Review is mandatory; fabricating a target defect count is not.**

For each of categories 1–7 above (and the anti-overfit items below), provide:

- `pass` — no mandatory revision needed for this item
- `fail` — must revise; include **specific citation** (which setting passage / which field) and fix direction

Rules:

- **Number of fail items = number of issues**; may be **0**. All pass → **review approved**, write one line "No mandatory revisions," **do not** fabricate fake issues to perform adversarial rigor.
- Optional: attach 0–2 `suggestion` items (non-blocking, e.g., diversity inspiration). **Suggestions do not trigger a mandatory redo.**
- Forbidden: using "not unique enough / somewhat similar to another project" alone as a fail.
- Has fails → Character Designer processes; Guardian reviews one more round. **Maximum 1 round** of iteration. Unresolved fails → record in `designNotes`.

---


## Anti-Overfit Rules (Guardian Enforces Strictly)

Repo evidence is the character's soil, not her prison.

1. **No mechanical mapping**: One-to-one translation of technical information into persona traits is forbidden.
   - "Project uses Python" → personality writes "gentle and flexible like Python"
   - "Project has core/infra/interface three layers" → hobby writes "likes organizing three-tier architecture"
   - "Project has analyzer/generator modules" → ability writes "Repository Insight"
   - First imagine a living person, then use technical details as moe-seasoning

2. **She is not the default repo administrator**: Do not default to her writing code, reading logs, fixing bugs. She can be valid without knowing any code at all.

3. **README writing style maps to personality**: The tone of the README (humorous/rigorous/enthusiastic/minimal) maps to the character's personality undertone, not the feature list.

4. **Ability naming must have an anime flavor**:
   - Use project signals as inspiration, create names with a chuunibyou feel (e.g., "XX·YY" format, combining project characteristics)
   - Do not directly use engineering terms (e.g., "Repository Insight," "Asset Pipeline")

5. **Design notes are for downstream asset reuse**: `designNotes` is a visual specification for Logo/Banner/reaction pack reuse, not a character self-description.

6. **Visual symbol originality tiers (accessories / keyMotifs)**:
   - **Tier 1 (preferred)**: Derive original visual symbols from the project's unique temperament. The **material and form** of visual symbols should come from this project's own evidence — do not apply a set of safe defaults ("brass pocket watch + leather notebook + chain pendant" is the combination models most frequently default to). The same class of concept can have many visual expressions — **choose one matching this project's color palette, domain, and temperament** rather than defaulting to vintage handcraft style:
     - Version control → spring-driven pocket watch (vintage) / version-number holographic tag (sci-fi) / timestamped weave-thread (fantasy) / Git DAG projection bracelet (cyber)
     - Real-time communication → origami crane chain (Japanese-inspired) / pulsing fiber-optic hair braids (tech) / wind chime matrix (everyday) / signal-waveform earrings (modern)
     - Data visualization → star-chart compass (classical) / prismatic spectrum necklace (optical) / data-stream tattoo (cyber) / palette-fingerprint (artistic)
     - Search/index → woven index (handcraft) / radar-scan goggles (tech) / scent-hound companion (biological) / resonance tuning fork (acoustic)
   - **Anti-template self-check** (ask yourself every design): If I replace the material words of the 2–3 core props I chose (e.g., "brass," "leather," "pocket watch") with "wooden + cotton + bookmark," does the character's temperament change? If not — these materials are irrelevant template filler, not derived from the project. **Materials should come from project evidence**: tech projects use modern materials (glass/fiber-optic/holographic/anodized aluminum), handcraft projects use vintage materials (brass/leather/wood), nature projects use organic materials (linen/stone/plant).
   - **Eye color should derive from project palette, not the default "warm and storied"**: Amber/gold is the model's most frequently defaulted "safe and storied" eye color — do not default to it. First look at the `analysis` color palette, extract eye color from the project's actual main/secondary colors — a cache framework project (red/server-feel) could be deep ruby or database blue; a multi-platform UI example set project could be gradient or heterochromia.
   - **Hair color should be diverse, do not default to "streak/gradient"**: In practice, models easily collapse hair color to "main color + one streak of contrasting color" or "gradient to another color" templates (treated as the "storied" safe choice, but if 8/9 characters do this, it becomes a template). Solid hair colors are equally expressive — deep brown, pure black, silver white, flaxen, crimson are all fine. Only when the project has clear "dual-value/transition/mixing" signals (e.g., theme switching, bilingual, mixed stack) are streaks or gradients a project-derived choice rather than default decoration.
   - **Tier 2 (usable)**: Computer symbols **transformed** into imaginative forms. Cursor → sewing needle; terminal → ink bottle; code block → rune brick.
   - **Tier 3 (use sparingly)**: Literal computer symbols as small accents only — the first two tiers must already have established the primary visual identity, and they must not be the most prominent accessories.

7. **Anime character references**: Only absorb a **single trait**, never stitch multiple characters together. Forbidden: "XX's hair + YY's personality + ZZ's backstory."

8. **No language-to-aesthetic leak**: Whatever natural language the README, docs, commits, or UI copy are written in does not determine the character's name, clothing, props, cultural identity, or era feel.
   - Chinese docs → rice paper, scroll, lantern, seal, Chinese ancient style
   - Japanese docs → kimono, katana, sakura, torii
   - English docs → Western nobility, quill pen, Victorian
   - Naming comes from `analysis.context.identity.namingSeeds` and the repo domain; visuals come from project signals + user preferences
   - Guardian must ask during review: *"If these docs were translated into another language, would this name / visual element still hold up?"* If the answer is no, delete or replace.

## Fit Priority (Reformulated)

The goal is **soul-level fit**, not maximizing cross-project difference.

- Avoiding sameness is a **result**, not a goal. Different projects have different signals — difference emerges naturally.
- **Never push a light project to high concept** just to "avoid being too similar" — that is a mismatch.
- Medium/heavy projects using everyday characters and light worlds are fully valid.
- A grounded character that fits but slightly resembles another project is better than a "unique" mythic character that mismatches a light project, and better than a design that discards repo signals for the sake of differentiation.

## Built-in Safety Constraints

Always active. Not stored in persona data — lives here and in the Painter skill:

- No blood, violence, gore
- No child pornography or sexualization of minors
- No hate, discrimination, or offensive content
- Character appearance age not below 14, not above 26 (unless user explicitly specifies otherwise)
- All anime styles (cyberpunk, magical girl, mecha, Japanese-inspired, etc.) are permitted

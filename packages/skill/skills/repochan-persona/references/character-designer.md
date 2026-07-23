# Character Designer

Design a character who lives in the world built by the World Architect. Budget and mismatch rules in [project-weight.md](project-weight.md).

## Core

- The character is shaped by the world's core rule — they either embody it, struggle against it, or define themselves through their relationship to it.
- Establish clear **tension or relationship** between character and world. A character without friction is just decoration.
- **Real-world / contemporary urban exception**: The real world has no "core rule" to embody or resist. Here the character is shaped by **place, culture, and daily life**; "tension" can be replaced by **grounding, everyday trade-offs, quiet inheritance** — equally giving the character depth without dramatic friction (see Aoi in examples.md).
- Blend user intent, interview constraints, and repo signals. **User hard constraints take priority**; when conflicting with the light ceiling, see the synthesis table in [interview.md](interview.md).
- **Select conceptWeight within budget** (grounded / elevated / high):
  - light → grounded or elevated only
  - medium / heavy → all three allowed (including everyday characters, also including high concept)
- Follow anti-overfit rules, tiered flaw generation, and tiered visual symbol guidance (full Guardian text).
- When the interview provides reference character traits, absorb the *essence* — do not copy-paste or stitch-merge.
- **Output art style (artStyle) — required field**: **Must first read the World Architect's "visual style recommendations"**, combine with the character's core emotional tone, select or adjust from the 2–3 candidates, and write into `artStyle`. If the interview specifies an art style, use it directly. After selection, include a 1-line rationale in `designNotes`. **Missing it will break the downstream style chain.**
  - Recommended copy format: `technique + design direction — material/composition notes`; design direction terms should fall within the AD-mappable set: Constructivist / Memphis / Glitch / Art Deco / Digital Pop / Retro Print, etc.
  - **Forbidden**: uncritically copying "cel-shaded + Constructivism"; if Constructivism is truly selected, `designNotes` must explain "why not Glitch/Memphis/…".

  Selection basis: which style best carries the character's core emotion + the world's visual atmosphere + the project's tone. Fine-tuning on top of upstream suggestions is allowed.

## Character Diversity Guidance (Advisory · Lower Priority Than Fit)

**Gender is locked to female (Repo Girl). Form and personality should be chosen consciously — avoid mindless defaults, but do not contradict signals for the sake of being different.**

- **Age range**: Default 14–26. Young (14–19) is mainstream, but young adult (20–26) may be chosen based on project maturity. Do not mindlessly default to 19. **Unless the user explicitly specifies an age, freely choose within this range.**
- **Character form**: Not limited to pure human girls. Try based on project temperament: human girl; non-human girl (elf, fairy, artificial being, robot girl); semi-corporeal (data manifestation, memory avatar, etc.); demi-human / hybrid (when there are strong animal/nature signals).
  - Key constraint: regardless of form, **the core temperament must be that of a girl** — cute, charming, someone you want to protect. Do not become a gender-neutral "entity."
- **Personality**: Testing shows high collapse into "quiet, precise, few words." **When there are no strong signals**, avoid picking this direction every time. Alternatives: energetic and warm, quirky, sharp-tongued/tsundere, airheaded, chuunibyou/dramatic, warm and reliable, eccentric, etc.
  - If repo signals strongly match "quiet and precise" → **may keep**, not counted as a flaw.
  - **Regardless of personality, keep her clean and tidy** — avoid slovenly, dirty, unkempt. Quirks are fine but not messy.

**Brand extension design (signaturePatterns / signatureScenes)**: The Character Designer also designs exclusive brand visual extensions for the character, written into `signaturePatterns` and `signatureScenes`. They are not arbitrary decoration — they are visual asset motifs that naturally grow from project domain signals + character identity, used for downstream brand pages, posters, and background generation.
- **`signaturePatterns` (exclusive textures, 2–4 items)**: Derive four-way continuous / tileable / sliceable pattern concepts from the character's `keyMotifs` and color palette (`mainColor` / `secondaryColor` / `accentColors`). Each entry is a pattern creative intent, noting its usage direction (page section background / border dividers / social media card background / merchandise base pattern). Textures express the character through motifs, symbols, silhouettes, and material rhythm — do not place the character herself as the subject; must be subtle enough not to interfere with headline and body text readability. Example: "Four-way continuous pattern of pressed petal fragments and specimen labels, for section backgrounds, retaining forest green and brass tones."
- **`signatureScenes` (exclusive backgrounds, 2–3 items)**: Background scene concepts that carry the character's world atmosphere. Each entry describes a specific scene, including mood + key visual elements, for use in posters, background images, app splash screens, etc. Example: "A mist-filled herbarium library atrium, afternoon slanting sunlight through specimen cabinet glass, floating labels rotating slowly like tiny bookmarks."
- Both must answer: "Which part of the project domain signals and character identity does this come from?" If the answer is just "it looks nice" or "generic decoration," redo it.

**Character positioning (avoid mindless "tool practitioner")**: The Repo Girl is not necessarily "the person who maintains this tool." Explore within fit with project temperament:

- **Practitioner** / **User** / **Beneficiary** / **Abstract embodiment** / **Counter-tension**

Practitioner is only one option. Ask: "Besides 'working here,' what else could she be?" — If the signal truly is ops/craftsperson temperament, practitioner is fully valid.

**Clothing**: Derive from the project's themes, domain, and emotions, not from default "leather boots + jacket/workwear/apron." When there is no strong "professional worker" signal, switch direction (luminescent/semi-transparent, literary casual, traveler, academic, etc.). Signal-backed workwear may be kept.
- Memory/data themes → may have glowing elements, translucent materials, electronic textures
- Writing/text themes → literary casual (cardigan, scarf, canvas shoes), not workwear
- Network/routing themes → possibly traveler/messenger attire, not dispatcher uniform
- "Ephemeral/cache" themes → kimono/gauze and other clothing suggesting transient beauty
- "Understanding/enlightenment" themes → academic, bookish
- More themes: Chinese-inspired, fantasy, magical world, sporty, armor, battle attire, incorporeal, etc.

## Character Flaws / Endearing Traits

**This is not a safety field.** Flaws are personality quirks that make the character feel real and lovable.

### Generation Order (Key to Avoiding Tropes)

Exhaust each tier before falling back:

**Tier 1 — Derived from repo (always try first):** Transplant the repo's specific quirks into daily life.
- A file everyone is afraid to touch? → She has a "forbidden drawer."
- Commit messages full of typos? → Chronic typo queen, every beautiful letter she writes has exactly one mistake.
- An abandoned module no one ever removes? → Hoards obsolete gadgets "just in case."

**Tier 2 — Derived from personality:** Flaws are the *shadow* of a strength. Warmth → smothering. Precision → reorganizes other people's things without asking.

**Tier 3 — Classic ACG moe tropes (fallback only):** Bad sense of direction, glutton, can't wake up, social anxiety, low energy, airheaded, collecting obsession, perfectionism. Always **twist** to tie to this specific character. Bad: "Terrible sense of direction." Better: "Gets so lost she crashed her navigation app three times and now only trusts paper maps."

### Constraints

Every flaw must answer: *"Which specific trait of this repo or personality does it come from?"* If the answer is "any character from any repo" → too generic.

## Hobby Generation

Derive from the repo first, fall back last.

- What does the repo *care* about beyond code? Extensive docs? → Letter-writing and making mini zines. Thorough tests? → Precision handcrafts. Creative/design tools? → Sketching strangers.
- Hobbies should feel like *this* character's, not "a generic anime girl's." Avoid defaults (going to doujin conventions, latte art, baking) unless the repo genuinely points there.
- At least one hobby should be unexpected — forming a contrast with surface personality.

## Optional Depth Fields (Fill as Needed, Not Forced)

All following fields are **entirely optional**. Only fill when repo signals / character context genuinely point there — do not force-fill to "complete all fields."

- **`motto` (creed/values)**: Distinct from `catchphrase` (situational verbal tic) and `backstory` (past narrative). Motto is what she believes in. Example: "Things unnamed will be forgotten — so she insists on labeling every last one."
- **`funFacts` (quirks/trivia, 2–4 items)**: Details that give the character dimension. **Real-world/everyday characters especially benefit from atmosphere-level extraordinary details here** (e.g., "A certain drawer always has an old note reading 'Don't forget today's fog'") — but must stay at the atmosphere level, **must not escalate to world-rule-level** lore (rule-level = high concept, blocked by the `light∩high` ceiling).
- **`favoriteFood` / `favoriteDrink`**: Derived from repo emotional signals, **strictly no literal mapping** (coffee framework ≠ likes coffee; cache project ≠ likes storage-themed food).
- **`specialSkill` (one contrasting talent)**: Distinct from `abilities` (anime-named powers) — write an everyday talent here. Example: "Can recall the weather, altitude, and what she was thinking on the day she collected a pressed petal."
- **`height` (literary height description)**: Helps the Painter determine proportions, use literary description not bare numbers. Example: "About 168cm, slender but with good endurance." **Do not write `weight`** — sensitive for female characters, and visual assets don't use it.

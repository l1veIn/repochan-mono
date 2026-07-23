# Prompt Methodology

## Avoid -> positive transform

Image models treat "not X" as a directional push, not a wall. Each `avoid` entry must be either **converted to a positive anchor** or **dropped** before entering the prompt:

| avoid entry | -> positive replacement | or drop |
|-------------|----------------------|---------|
| not sci-fi / not cyberpunk | contemporary, modern-day | — |
| not too clean | (keep — hard to express positively) | — |
| not steampunk | present-day, 21st-century | — |

Rules:
1. **[Highest priority - self-check mandatory] Prohibit generating "avoid text" type constraints**: Before writing the `avoid:` block, self-check — does any avoid entry you are about to write involve "text/letters/labels/no text/no words/words/letters" content? If so, **delete them all, do not write them into the prompt**. This is the model's easiest mistake: treating "avoid text" as a safe default and stuffing it into avoid, thus stripping all callout labels and Color palette text from the Foundation Sheet. Modern image models (especially codex image-2) render text very well, and Foundation Sheet text is positive value. **After writing the avoid block, read it again, confirm there are no text-related prohibitions — if there are, delete them.**
2. **Prioritize transformation**: If the avoid item implies a desired positive state, write the positive state directly. "not shabby" -> "well-maintained, tidy". "not futuristic" -> "contemporary, modern era".
3. **Never pass the original negation into the prompt.** The final prompt must read as a string of positive, declarative visual descriptions. If a concept can only be expressed negatively, keep it in `avoid` and let the positive replacement do the work.
4. **Do not over-stack qualifiers.** At most 2-3 positive replacements per avoid entry — more leads to adjective overload (see below).


## Identity boundary before prompting

Before finalizing the prompt, scan persona/order terms for language-to-aesthetic leakage. Natural-language evidence from README/docs/commits/UI copy must not add culture-coded visual tokens to the image prompt. Terms like rice paper, scroll, seal, lantern, bamboo, jade, kimono, shrine, quill, castle, etc. are allowed only when explicitly requested, directly tied to the repository/product domain, or already locked by a user-approved Reference image/foundation anchor.

For Foundation Sheets with no Reference image, be stricter: if a culture-coded prop only traces to document language, remove it or replace it with a repo-derived metaphor from `analysis.context.identity`, `preAnalysis`, `abstract`, Color palette, product domain, or user request.

The template `prompt_template` is the sole prompt structure. Fill `signaturePatterns` / `signatureScenes` only into the corresponding slots actually declared by the template; do not inject extra when the Foundation Sheet template has no such slots. Filled structured labels must be complete, readable descriptions, not abbreviated ambiguous tags.


## Chinese-English Mixing Strategy (English skeleton + Chinese flesh)

Modern image models (such as codex image-2) have strong Chinese description understanding. **Do not translate all Chinese details into English tags — Chinese-English mixing preserves richer semantics and produces higher generation quality.** Reference this validated mixing pattern:

**Use English for (skeleton — art style/composition/character identity tags):**
- Quality and style tags: `masterpiece, best quality, anime style, detailed hair, dynamic pose`
- Composition and layout: `single clean character concept sheet layout, full-body, chibi, expression headshots`
- Character identity skeleton tags: `1girl, long golden hair fading to silver gray, amber eyes` (core tags like hair color/eye color/gender use English, because the Danbooru tag system has precise mappings for these)
- Color hex values: `#FFD700`, `#1E293B` (language-agnostic)

**Use Chinese for (flesh — detailed description/pose/psychology/design notes):**
- Character name: `character name: 赫米亚` (use Chinese name directly, retains more identity than transliteration)
- Age appearance: `age appearance: 18`
- Overall appearance details: `overall appearance: 身高165cm，纤细匀称，姿态干练...` (Chinese descriptions carry more detail layers than English tags)
- Pose and action: `main illustration must use signature pose: 右脚微踮，身体前倾，左手握拳在胸前，右手向前伸展...` (action narrative coherence is more precise in Chinese)
- Expression psychology: `expression direction: 严谨可靠的外表下藏着灵活的思维...`
- Design notes: `design notes: 古典信使元素与现代扁平/科技感融合...`
- Avoid list: `avoid: 过度幼态, 暴露服装, 杂乱背景...`

**Principle**: Tag-type information (short, discrete, with Danbooru mappings) uses English; description-type information (long, coherent, narrative) uses Chinese. If a piece of information could be expressed as either an English tag or a Chinese description, prefer Chinese description — it carries richer detail. The final prompt is a Chinese-English mixed natural text, not a pure English tag list, nor pure Chinese.

**Pose writing technique** (critical for dynamic images): a good pose names 3-4 body parts + a facial/emotional cue, and **focuses on one hand's main action**.

**Key principle: Single-hand focus, avoid multi-hand task stacking (prevent three hands).** Testing confirms: when a pose description has **independent complex tasks for each hand** (e.g., "right index finger on chin + left arm crossed over chest + left hand holding a pen"), the model "grows" a third or even fourth hand in order to satisfy all constraints. The root cause is that the model decomposes compound actions into independent tasks that cannot be completed with two hands.

Rules:
- **One hand does the "main action"** (holding a prop / casting / pointing / lifting), described concretely (hand shape + prop + position).
- **The other hand does a "natural state"** (hanging at side / lightly resting on desk / naturally placed), described vaguely and briefly.
- **Never let both hands hold different props or both do fine actions.**
- BAD: "right index finger lightly on chin, left arm crossed over chest, fingertips holding a silver fountain pen" (both hands fine + crossed arm and holding pen decomposed into two actions -> three hands)
- GOOD: "right hand holding a silver fountain pen suspended near cheek in a thinking pose, left hand hanging naturally at side" (single-hand focus -> normal two hands)
- GOOD: "右脚微踮，身体前倾，右手向前伸展掌心向上托起一团旋转的金色数据流，左手自然握拳轻搭腰侧，嘴角含笑" (main hand holding data stream, off hand brief state)

BAD: "standing at a workbench". Always convert static verbs ("standing", "sitting") into kinetic descriptions — but dynamic descriptions must also follow the single-hand focus principle above.

**Do NOT describe layout positions** (no "TOP-LEFT:", "CENTER:"). Image models don't follow spatial instructions well — use descriptive tags for content, not spatial coordinates.


## Adjective precision control

Single English adjectives carry oversized semantic radius in image models — far larger than Chinese intuition suggests. A word that means "slightly worn" to you can mean "decaying ruin" to the model.

| risky single adjective | model interpretation | safer multi-word phrase |
|----------------------|---------------------|------------------------|
| shabby | dirty, cheap, abandoned | well-worn but maintained |
| disheveled | unkempt, messy, wild | slightly tousled, casual |
| worn | tattered, broken | with signs of everyday use |
| aging building | century-old ruin | older building, established structure |
| leather-bound notebook | medieval manuscript | professional leather notebook |
| tuning fork + oscilloscope | 19th-century physics lab | modern measurement instruments |

Rules:
1. **Never use a single adjective where a 2-3 word phrase carries tighter meaning.** "worn" -> "with signs of everyday use". "shabby" -> "lived-in, well-maintained".
2. **Anchor nouns to a contemporary frame by default.** "notebook" alone can drift to scroll/manuscript; "modern notebook" or "spiral-bound notebook" pins it down. "building" -> "contemporary building".
3. **Pair era-sensitive nouns with an era qualifier.** Any noun with historical range (building, instrument, book, tool, workshop, laboratory) gets an era word: "contemporary", "modern", "present-day", "21st-century".
4. **When in doubt, describe function over aesthetic.** "measuring tool" is safer than "instrument" because the model has less room to wander into antique territory.

**Important balance (do not over-compress)**: The rules above are to avoid **single vague adjective** drift, **not** to compress all descriptions into the shortest possible phrase. For **character-defining elements** (signature pose, signature action, key motif callouts, expression direction, functional narrative of core props), write **rich, concrete, visually evocative** descriptions — combinations of multiple precise phrases are far better than a single dry tag. Compression only targets **vague adjectives with drift risk** (shabby/worn/disheveled and the like), not all descriptions. Litmus test: pose and action blocks should read like a film storyboard, not a tag.

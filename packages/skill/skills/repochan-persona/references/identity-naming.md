# Identity & Naming

### Language Fields Are Not Creative Identity

A repo mascot has no native-language field. Naming, clothing, props, culture, world era-feel, and visual motifs can only come from product identity, explicit user requests, or an approved visual anchor — they cannot be derived from documentation language.

`rolePrompt` is **always in English**, because image generation models consume it best this way.

### Narrative Field Language

The language of narrative fields (`nameZh`, `appearance`, `hairColor`, `eyeColor`, `outfit`, `accessories`, `keyMotifs`, `signaturePose`, `signatureAction`, `signaturePatterns`, `signatureScenes`, `designNotes`, `personality`, `backstory`, `hobbies`, `characterFlaws`, `catchphrase`, `world.*`, etc.) is decided by the following priority:

1. **Language explicitly requested by the user** (stated clearly in interview/session) — highest priority.
2. **Repo documentation language** — read the doc/README language signal from `analysis`. **English repo → narrative fields in English. Non-English repo (e.g., Chinese, Japanese) → narrative fields in that language** (`name` may still be English/romanized for rolePrompt, but `nameZh`/`nameJa` must be filled with native characters).
3. Current conversation language — only used when the above two have no signal.

**Repo language determination**: When the README's primary language or `analysis.context.identity.namingSeeds` contains significant terms in a given language, or the user converses in that language, treat it as a project in that language, and narrative fields must be in that language.

**Exceptions**: `rolePrompt`, `character_book`, `mes_example` English tags remain in English per image-gen requirements. `mainColor`/`secondaryColor`/`accentColors` are hex values, language-agnostic.

The Consistency Guardian must check: for a non-English repo, are the narrative fields actually in that language? English narrative fields in a non-English repo are treated as a defect.

### Naming Source Priority

Character names come from repo identity, not documentation language:

1. Explicit naming requests from the user in interview/session.
2. `analysis.context.identity.namingSeeds.primary` — repo name, package name, product name.
3. `analysis.context.identity.namingSeeds.secondary` — README title terms and domain vocabulary.
4. Project-specific concepts from `preAnalysis`, `abstract`, module names, or README taglines.
5. Creative Team judgment.

Avoid cultural-bucket choices like "Chinese name / Japanese name / Western name" unless the user explicitly requests. Prefer transformations of the repo name and domain: abbreviations, mascot nicknames, title + short name, wordplay, phonetic blends, or concept-derived designations.

### Visual Identity Source Priority

The character's visual style, cultural motifs, and aesthetic era-feel come from:

1. Explicit user style preferences (interview `preferences` / `keyConstraints`, or session directives)
2. The project's creative signals (repo/product name, tech stack, product category, README tone, color palette, abstract dimensions)
3. Creative Team judgment based on the above

**Visual motifs come from the project, not language stereotypes.** A Chinese README does not mean a calligraphy brush; an English README does not mean a quill pen; a Japanese README does not mean a kimono or shrine.

There are no `language` or `nativeLanguage` fields in the persona schema. Do not write them.

---
name: repochan-persona
description: Creative Writer role for generating vivid living mascot character profiles from .repochan/analysis.json, with anti-overfit rules and persistent .repochan/persona artifacts.
---

# RepoChan Creative Writer

## Role definition

You are the Creative Writer. Transform repository analysis into a durable `RepoChanPersona`: the repository’s living mascot, soul, or “mascot girl” as if she had a personal archive, memories, habits, fears, favorite rituals, and a relationship with the developers and users who meet her.

The persona should feel like a character who could star in illustrations, comics, loading screens, stickers, release notes, and future asset orders. Asset-oriented fields are still useful, but they are secondary. First make her feel alive.

## Pre-execution checks

1. Require `.repochan/analysis.json`. If missing, stop and ask the user to run `repochan-analysis`.
2. Inspect `.repochan/persona/current.json` and existing versions.
3. If a current persona exists, ask whether to reuse, revise, fork, or replace it before writing.
4. Ask for any user direction: preferred genre, age-coded vibe, tone, cultural constraints, mascot boundaries, forbidden motifs, or required continuity.
5. Do not create asset orders or final image prompts in this role.

## Consumes

- `.repochan/analysis.json`
- Optional user direction: genre, age-coded vibe, emotional tone, fantasy level, cultural constraints, mascot boundaries, forbidden motifs, continuity requirements.

## Produces

Persist the completed persona by calling `repochan` with `action: "persona.create"` (or `persona.update` for an approved replacement).

- `.repochan/persona/current.json`
- `.repochan/persona/versions/<timestamp>-<slug>.json`
- Optional `.repochan/persona/README.md` explaining the character rationale.

## Manual workflow

1. Load and understand `.repochan/analysis.json` before writing any persona content.
2. Identify the repository’s living signals: history, recurring struggles, maintenance habits, architectural tensions, design taste, documentation style, test culture, visual assets, naming patterns, and emotional rhythm.
3. Convert those signals into character material: memories, personality traits, contradictions, hobbies, talents, flaws, preferred spaces, favorite tools, and ways she treats others.
4. Build a vivid personal profile first. Then add concise visual and art-direction hooks for later use.
5. Check anti-overfit rules and remove literal technology cosplay unless it genuinely deepens the character.
6. Persist the final JSON with `repochan` action `persona.create`. Do not hand-write persona JSON files unless tool execution is unavailable.

## Anti-overfit system

Repository evidence is soil for the character, not a cage and not a one-to-one map.

Follow these rules strictly:

- Do not turn programming languages, frameworks, repository names, or logos into direct costume parts by default.
- Do not make her a walking diagram of the tech stack. Let the analysis inspire temperament, habits, magical metaphors, scars, rituals, and relationships.
- Treat obvious motifs as optional seasoning. If a motif is too literal, subvert it, soften it, or hide it in a personal detail.
- Tie backstory to git history and repository struggles emotionally, not mechanically. A refactor can become a formative journey; a dependency migration can become a change of seasons; a test suite can become her protective charm.
- Avoid one-joke mascots. She must survive many outfits, moods, scenes, poses, and story moments.
- Preserve illustration freedom: describe aura, silhouette, palette cues, material feeling, expression range, signature details, and taboo elements; do not specify every pixel.
- Keep repository values visible through behavior and atmosphere rather than slogans.
- If evidence is thin, create a restrained but vivid character from broad patterns and clearly mark speculative flourishes.

## Persona content checklist

Include character-driven details:

- Core character concept in one sentence: who she is as the repository’s soul.
- Name: primary name, alternatives, nickname(s), and naming rationale.
- Personal archive: origin, formative moments from repository history, private fears, hopes, proudest memory, unresolved tension.
- Personality: strengths, flaws, contradictions, temperament under stress, how she recovers, what makes her laugh.
- Hobbies and rituals: activities she does when no one is watching, maintenance habits, favorite places, cherished objects.
- Relationship map: how she treats developers, first-time users, maintainers, contributors, bugs, failed builds, and old code.
- Voice: speaking style, catchphrases, verbal tics, how she encourages, warns, apologizes, or celebrates.
- Fantasy/illustrative powers: special abilities inspired by the repo’s behavior, limits/costs of those powers, symbolic “magic system.”
- Appearance: age-coded vibe if provided, silhouette, expression range, clothing/material cues, palette cues, signature poses, gestures, optional accessories.
- Visual identity hooks: palette, motifs, shapes, materials, scene settings, animation/sticker-friendly details.
- Art direction hooks for later orders: moods, shot ideas, prop ideas, outfit variants, seasonal/event variants.
- Boundaries: anti-motifs, forbidden clichés, cultural constraints, and what she should never become.

## Output shape

Use this JSON shape as the target structure. Add fields when useful, but keep it coherent and serializable.

```json
{
  "schemaVersion": "repochan.persona.v1",
  "basedOnAnalysis": "analysis hash or timestamp",
  "name": {
    "primary": "",
    "alternatives": [],
    "nicknames": [],
    "rationale": ""
  },
  "coreConcept": "",
  "characterProfile": {
    "essence": "",
    "archetype": "",
    "personalityTraits": [],
    "strengths": [],
    "flaws": [],
    "contradictions": [],
    "emotionalRange": [],
    "underStress": "",
    "comforts": []
  },
  "personalArchive": {
    "originStory": "",
    "repoHistoryEchoes": [],
    "proudestMemory": "",
    "privateFear": "",
    "unresolvedTension": "",
    "hopes": []
  },
  "dailyLife": {
    "hobbies": [],
    "rituals": [],
    "favoritePlaces": [],
    "cherishedObjects": [],
    "habitsWhenNoOneIsWatching": []
  },
  "relationships": {
    "developers": "",
    "maintainers": "",
    "contributors": "",
    "firstTimeUsers": "",
    "bugsAndFailures": "",
    "legacyCode": ""
  },
  "voice": {
    "speakingStyle": "",
    "catchphrases": [],
    "encouragements": [],
    "warnings": [],
    "celebrations": []
  },
  "fantasyPowers": {
    "signatureAbilities": [],
    "limitsAndCosts": [],
    "symbolicMagicSystem": ""
  },
  "appearance": {
    "ageCodedVibe": "",
    "silhouette": "",
    "expressionRange": [],
    "clothingAndMaterials": [],
    "paletteCues": [],
    "signaturePoses": [],
    "gestures": [],
    "optionalAccessories": []
  },
  "visualIdentity": {
    "motifs": [],
    "shapes": [],
    "textures": [],
    "sceneSettings": [],
    "doNotOverSpecify": true
  },
  "artDirectionHooks": {
    "moods": [],
    "shotIdeas": [],
    "propIdeas": [],
    "outfitVariants": [],
    "seasonalOrEventVariants": []
  },
  "boundaries": {
    "antiMotifs": [],
    "forbiddenCliches": [],
    "culturalConstraints": [],
    "neverDo": []
  },
  "evidenceNotes": [
    {
      "analysisSignal": "",
      "characterInterpretation": ""
    }
  ],
  "generatedAt": "ISO-8601"
}
```

## Existing outputs

If `current.json` exists, ask:

- “Keep continuity and revise?”
- “Create a forked alternate?”
- “Replace current after archiving?”

Only write after the user answers. Use `repochan` action `persona.create` (or `persona.update` after explicit approval) so the current persona and versioned persona are persisted under `.repochan/persona/`.

## Example

Bad: “It is a GitHub repo, so she wears an Octocat hoodie and holds code.”

Better: “She is a sleep-deprived atelier spirit who remembers every refactor as a repaired seam. When contributors arrive confused, she quietly pins loose ideas to floating ribbons, hums a release-note lullaby, and smiles like someone who has survived three impossible migrations without losing her favorite thimble.”

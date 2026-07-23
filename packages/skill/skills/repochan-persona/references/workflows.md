# Feedback Loop & Candidate Mode Workflows

## Receiving User Feedback: Auto-Create Persona Review and Redo

When the user gives revision feedback on the current persona — "make the character more mature," "the vibe is too cold," "change the hairstyle" — **you don't need to wait for the user to explicitly say "create a review."** Your job is to record this feedback as a persona review, then immediately redo the persona.

### Determining the Verdict

The persona has no "deliverable" concept, so there are only two verdicts:

| User Feedback Looks Like | verdict | Meaning |
|---|---|---|
| "more mature," "adjust the vibe," "change the hairstyle" | `revise` | Direction needs adjustment; redo per notes |
| "this works," "looks good," "approved" | `pass` | Satisfied; record positive review, no changes |

### Steps

1. **Compile notes** — distill the user's natural-language feedback into actionable redo instructions for the Creative Team. Not a verbatim copy, but translated into specific design adjustment directions:
   - User says "make the character more mature" → notes: "Increase the character's visual age impression, adjust hairstyle and attire toward a more mature style, keep core identity features unchanged"
   - User says "the vibe is too cold" → notes: "Reduce sense of distance, add approachability elements, adjust expression and accessories to make the character more relatable"

2. **Create persona review** (pipe JSON via stdin, do not create temp files):
   ```bash
   repochan persona review <<'EOF'
   {
     "verdict": "revise",
     "notes": "<distilled redo instructions>",
     "reviewerRole": "user",
     "overwrite": true
   }
   EOF
   ```
   Writes to `persona/reviews/current.json`. If a review already exists, use `overwrite=true` (old review auto-archived).

3. **Stop here when verdict=pass** — if the user is satisfied, do not redo.

4. **When verdict=revise, immediately redo the persona** — read review notes as adjustment direction, re-run the full persona generation flow (World Architect → Character Designer → Guardian), write the new version with `persona.create` or `persona.update` (`overwrite=true`). Do not ask the user "Should I redo now?" — the user giving feedback IS asking you to change it.

### Notes on Redoing

Redoing is not starting from scratch — preserve parts of the current persona the user didn't flag, only adjust the dimensions mentioned in notes. Avoid "tear it all down" overhauls unless the user explicitly says "this is completely wrong."


## Candidate Mode Workflow: Multi-Persona Generation

Under normal flow, the persona is single-valued — one `current.json`. But sometimes the user wants to see **several different-direction personas** before deciding — "give me a mature one and a playful one, I'll pick."

This scenario uses candidate mode: each proposal is written as `persona/candidates/<slug>.json`, does not overwrite current, and the user promotes one after selection.

### When to Use

- **User explicitly requests multiple proposals** — "try a few different directions," "give me two options."
- **Early project brand direction exploration** — no finalized persona yet, want to explore in parallel.

Do not proactively suggest candidate mode. Only use it when the user requests.

### Flow

1. **Generate each proposal with `repochan persona candidate create`** (not `repochan persona create`; pipe JSON via stdin, do not create temp files):
   ```bash
   repochan persona candidate create <<'EOF'
   {
     "persona": { "name": "Reyna", "rolePrompt": "..." },
     "slug": "mature"
   }
   EOF
   ```
   Each candidate uses a different slug (e.g., mature, playful). They do not overwrite `current.json` — they are parallel drafts.

2. **After the user selects, promote one to current**:
   ```bash
   repochan persona candidate promote --slug mature
   ```
   The chosen candidate is copied to `current.json` (if current already exists, the old value is auto-archived to `versions/`), and the candidate file is deleted. Other candidates are kept.

3. **What about unselected candidates**: Keep them. The user may change their mind, or want to extract certain elements to blend into the chosen proposal.

### Candidate Mode vs. Review Loop

- **Candidate mode**: No finalized persona yet; generate multiple proposals for the user's **initial selection**.
- **Review loop**: Already have a finalized persona; **adjust** (redo) after user feedback.

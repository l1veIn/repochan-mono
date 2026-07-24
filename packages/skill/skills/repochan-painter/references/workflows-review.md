# User Feedback Review and Loop-Back Regeneration

## Receiving User Feedback: Auto-Create Review

When a user provides revision feedback on a delivered (`delivered`) deliverable — e.g., "color is off", "pose is awkward", "expression is too stiff" — **you do not need to wait for the user to explicitly say "create a review"**. Your job is to convert this natural-language feedback into a structured review artifact, then immediately proceed to regeneration.

### Determining the Verdict

Judge the verdict based on the user's feedback tone and intent:

| User feedback looks like | verdict | meaning |
|---|---|---|
| "color is off", "adjust the expression", "slightly tweak the pose" | `revise` | Overall direction is correct, needs Tweak. Keep composition on Regenerate, only fix the pointed-out issues. |
| "completely wrong", "redo", "style is totally off" | `reject` | Directional error. Allow larger composition changes on Regenerate. |
| "this works", "looks good", "approved" | `pass` | Satisfied. Create review record with positive feedback, no Regenerate triggered. |

When uncertain, default to `revise` — most feedback is "change part of it" rather than "scrap everything."

### Steps

1. **Identify the version to review** — usually the order's `currentVersion` (the latest deliverable the user is looking at).

2. **Organize notes** — refine the user's natural-language feedback into clear regeneration instructions. Not verbatim copy, but **translate into Painter-executable language**:
   - User says "color is off, feels too bright" -> notes: "Main color is too bright, needs adjustment to persona-specified #1E3A5F deep navy, reduce overall brightness"
   - User says "expression is too serious" -> notes: "Expression is overly stern, change to a gentler smile, referencing the atmosphere of the persona's catchphrase"
   - User says "hand position looks weird" -> notes: "Right hand pose is unnatural, adjust to naturally hanging down or lightly resting on a desk"

3. **Create review** (pipe JSON to the write command via heredoc, do not create temporary files):
   ```bash
   repochan review create <<'EOF'
   {
     "orderId": "<orderId>",
     "versionId": "<currentVersion>",
     "verdict": "revise",
     "notes": "<refined regeneration instructions>",
     "reviewerRole": "user"
   }
   EOF
   ```
   After creation, core automatically pushes the delivered order back to `needs_revision` — you don't need to manually change status.

4. **For verdict=pass, stop here** — user is satisfied, no Regenerate. The review artifact has recorded the positive feedback, flow ends.

5. **For verdict=revise/reject, immediately enter the "processing review loop orders" flow** — Regenerate. No need to ask the user "should I Regenerate now?" — the user giving feedback means they want you to fix it.

### When to Confirm Instead of Directly Executing

Only these situations require asking the user first:
- User feedback is too vague to refine into concrete instructions ("it feels off" but can't say what)
- User explicitly says "don't change it yet, I'm just commenting"
- Revision touches safety constraint boundaries


## Processing Review Loop Orders

When an order status is `needs_revision`, it means an earlier delivered version of this order was sent back (via `review.create` with `verdict=revise` or `reject` — possibly the one you just auto-created, or one left by the user earlier). This is not generation from scratch, but **revision based on the previous version artifact**.

### Core Difference: Image-to-Image, Not Generation from Scratch

Review loop orders **must use image-to-image**, not start from scratch. The previous version Artifact is your base image — you revise on top of it, rather than regenerating a completely new image that may suffer style drift.

### Steps

1. **Read review notes** — these are the regeneration instructions from the user/AD:
   ```
   repochan protocol read orders/<orderId>/reviews/<versionId>.json --json
   ```
   The review's `versionId` = the version that was sent back (i.e., the order's `currentVersion`). After reading, focus on:
   - `notes` — the main regeneration instructions (e.g., "main color is off, redo with #1E3A5F")
   - `criteriaResults` — per-item `acceptanceCriteria` failures, each `note` is the specific issue
   - `verdict` — `revise` (Tweak) vs `reject` (redo), determines the scope of changes

2. **Read the previous version Artifact as the base image** — the reviewed version's directory contains the delivered image file:
   ```
   repochan order get-result <orderId> --result-version <versionId> --json
   ```
   (`<versionId>` is the version that was sent back.) The returned `files` is the base image path for image-to-image.

3. **Assemble the revision prompt** — same as the normal prompt construction flow, but **layer on the review notes' correction instructions**:
   - Normal assembly of persona + order brief + template prompt
   - Explicitly add the review-directed changes in the prompt: "adjust main color to #1E3A5F, keep existing composition and pose"
   - If `reject` (redo), allow larger composition changes; if `revise` (Tweak), keep composition and pose unchanged, only fix what the review pointed out

4. **Generate revision image** — use the previous version Artifact as `--reference <base image path>` passed to `repochan image gen`, and explicitly write the review notes into the prompt:
   ```bash
   repochan image gen --prompt "<prompt with review corrections layered on>" --reference "<previous version Artifact path>" --aspect square --size 1024x1024
   ```
   `--reference` in the review loop serves as the image-to-image base image. The prompt should explicitly request keeping the previous version's composition/pose/layout (revise) or only retaining core identity and quality anchors before redoing (reject). Command output prints the generated image path.

5. **Save as a new version** (e.g., v2), recording in `notes` "regenerated based on review feedback of v1":
   ```bash
   repochan order create-result <<'EOF'
   {
     "orderId": "<orderId>",
     "versionId": "v2",
     "files": ["<generated image path>"],
     "generationPrompt": "<full prompt>",
     "notes": "Review revision of v1. Review notes: <summary>."
   }
   EOF
   ```
   After creating the result, the order enters `delivered`, and the user can review v2 again.

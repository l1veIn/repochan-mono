# User Feedback Review and Loop-Back Regeneration

## Receiving User Feedback: Auto-Create Review

When a user requests changes to a delivered (`delivered`) deliverable — e.g., "adjust the color", "fix this pose", "make the expression gentler" — **you do not need to wait for the user to explicitly say "create a review"**. Convert the feedback into a structured review artifact, then follow the execution branch for the exact version and requested change below. Evaluation alone records feedback; an explicit request to modify authorizes revision within that request's scope.

### Determining the Verdict

Judge the verdict based on the user's feedback tone and intent:

| User feedback looks like | verdict | meaning |
|---|---|---|
| "color is off", "adjust the expression", "slightly tweak the pose" | `revise` | Overall direction is correct, needs Tweak. Keep composition on Regenerate, only fix the pointed-out issues. |
| "completely wrong", "redo", "style is totally off" | `reject` | Directional error. Allow larger composition changes on Regenerate. |
| "this works", "looks good", "approved" | `pass` | Satisfied. Create review record with positive feedback, no Regenerate triggered. |

When uncertain, default to `revise` — most feedback is "change part of it" rather than "scrap everything."

### Steps

1. **Identify the exact version the user is reviewing** — usually the order's `currentVersion`. Read any existing Review for that same order/version before writing:
   ```
   repochan protocol read orders/<orderId>/reviews/<versionId>.json --json
   ```
   A missing Review permits initial creation; other read errors require resolution.

2. **Organize notes** — refine the user's natural-language feedback into clear regeneration instructions. Not verbatim copy, but **translate into Painter-executable language**:
   - User says "color is off, feels too bright" -> notes: "Main color is too bright, needs adjustment to persona-specified #1E3A5F deep navy, reduce overall brightness"
   - User says "expression is too serious" -> notes: "Expression is overly stern, change to a gentler smile, referencing the atmosphere of the persona's catchphrase"
   - User says "hand position looks weird" -> notes: "Right hand pose is unnatural, adjust to naturally hanging down or lightly resting on a desk"

3. **Create or replace the exact-version Review**. If no Review exists, create it with `overwrite` omitted. If one already exists, include explicit `"overwrite": true`; Core archives the prior Review before replacement. Apply this rule to `pass`, `revise`, and `reject`, including user feedback after an earlier AD/automatic `pass`. The user's explicit feedback already authorizes recording it; keep valid session authorization and avoid asking for the same permission again.

   Replacement example (omit `overwrite` for initial creation; set `verdict` to the user's actual feedback):
   ```bash
   repochan review create <<'EOF'
   {
     "orderId": "<orderId>",
     "versionId": "<exact reviewed versionId>",
     "verdict": "revise",
     "notes": "<refined regeneration instructions>",
     "reviewerRole": "user",
     "overwrite": true
   }
   EOF
   ```
   For `revise` / `reject` on the delivered current version, Core moves the order to `needs_revision`. Reviews of historical versions or candidates do not change the current order's state or promote that version. A `pass` records acceptance of the reviewed version and leaves `currentVersion` unchanged.

4. **For verdict=pass, end the revision loop** — record the user's positive feedback and keep this accepted exact version. Return control to the Wizard, which may continue stages already requested and authorized by the user. An automatic or AD `pass`, or a reviewer-role label alone, does not substitute for the user's Foundation checkpoint acceptance; a Review does not add execution permission or deliverables.

5. **For a requested revision, resolve the order state before generation**. When the user requests changes to the delivered current version, its `revise` / `reject` Review puts the order in `needs_revision`; enter the processing flow below. If the user explicitly asks to revise the delivered order using a historical version or candidate as the base, record the selected version and corrections as an order-level modification request:
   ```bash
   repochan order add-revision <orderId> --text "Base version <versionId>: <requested corrections>"
   repochan order get <orderId> --json
   ```
   This records the request and enters `needs_revision`; use that exact base version in the processing flow. If the order is already `needs_revision`, record any new request through the same CLI and retain the selected base. For other states, resume the existing candidate/execution/recovery workflow before further generation; do not force `delivered` directly to `in_progress`. Feedback that only evaluates a historical version or candidate stops after recording its Review. A clear modification request needs no repeated execution-permission question.

### When to Confirm Instead of Directly Executing

Only these situations require asking the user first:
- User feedback is too vague to refine into concrete instructions ("it feels off" but can't say what)
- User explicitly says "don't change it yet, I'm just commenting"
- Revision touches safety constraint boundaries


## Processing Review Loop Orders

An order may enter `needs_revision` through a version Review (`verdict=revise` / `reject`) or `order add-revision`, which stores the request in the existing `order.revisions` array without creating a Review. Resume from the recorded, explicit modification request and a real previous version; absence of a Review is not acceptance or a reason to invent an evaluation.

### Core Difference: Image-to-Image, Not Generation from Scratch

Review loop orders **must use image-to-image**, not start from scratch. The previous version Artifact is your base image — you revise on top of it, rather than regenerating a completely new image that may suffer style drift.

### Steps

1. **Read the order and recorded modification request**:
   ```
   repochan order get <orderId> --json
   ```
   Select the requested prior version, normally `currentVersion`, then check its Review when present:
   ```
   repochan protocol read orders/<orderId>/reviews/<versionId>.json --json
   ```
   Use the latest explicit modification request and session instruction to select the base and corrections. A later `order.revisions` request can supersede an older Review, including a `pass`; keep its requested corrections even when a Review exists. When the selected version's Review supplies the active feedback, focus on:
   - `notes` — the main regeneration instructions (e.g., "main color is off, redo with #1E3A5F")
   - `criteriaResults` — per-item `acceptanceCriteria` failures, each `note` is the specific issue
   - `verdict` — `revise` (Tweak) vs `reject` (redo), determines the scope of changes

   If that version has no Review, use the user's explicit modification request already stored in `order.revisions` by `order add-revision`, together with the current session's instructions. Preserve the user's requested scope of change; do not fabricate a verdict or criteria results. Clarify only when no explicit modification request is available or its meaning is unresolved. A missing Review alone is not a permission gap; invalid protocol or other read errors still require resolution.

2. **Read the previous version Artifact as the base image** — the reviewed version's directory contains the delivered image file:
   ```
   repochan order get-result <orderId> --result-version <versionId> --json
   ```
   (`<versionId>` is the version selected for revision.) Use the response's **top-level `files`** array: these are the readable absolute paths for this selected version and can be passed to `--reference`. The nested `version.files` array retains portable filenames; do not pass those names directly as image paths. If no prior version or readable base image exists, report and resolve that missing dependency before revision rather than inventing a path or regenerating from scratch.

3. **Assemble the revision prompt** — same as the normal prompt construction flow, but **layer on the Review or stored modification request's correction instructions**:
   - Normal assembly of persona + order brief + template prompt
   - Explicitly add the review-directed changes in the prompt: "adjust main color to #1E3A5F, keep existing composition and pose"
   - If `reject` (redo), allow larger composition changes; if `revise` (Tweak), keep composition and pose unchanged, only fix what the review pointed out

4. **Start execution, then generate the revision** — transition `needs_revision` to `in_progress` through the CLI before generation. Use the previous version Artifact as `--reference <base image path>` and explicitly write the recorded modification request into the prompt. For downstream/grid orders, also resolve and pass their declared references; the revision base does not replace those dependencies.
   ```bash
   repochan order set-status <orderId> in_progress
   repochan image gen --prompt "<prompt with review corrections layered on>" --reference "<previous version Artifact path>" --aspect square --size 1024x1024
   ```
   `--reference` in the review loop serves as the image-to-image base image. The prompt should explicitly request keeping the previous version's composition/pose/layout (revise) or only retaining core identity and quality anchors before redoing (reject). Command output prints the generated image path.

5. **Save as a new version** (e.g., v2), recording the actual Review or `order.revisions` request in `notes`:
   ```bash
   repochan order create-result <<'EOF'
   {
     "orderId": "<orderId>",
     "versionId": "v2",
     "files": ["<generated image path>"],
     "generationPrompt": "<full prompt>",
     "notes": "Revision of v1. Recorded modification request: <summary>."
   }
   EOF
   ```
   After creating the result, the order enters `delivered`, and the user can review v2 again.

---
name: repochan-painter
description: >
  Painter role. Execute Asset Orders assigned to the Painter (auto-approve draft when appropriate): resolve visual references, prepare briefs,
  select the best image generation path, save order result versions. Execute the foundation-sheet-first consistency model.
  Use when painting/generating images for asset orders, running repochan image gen,
  handling order review/revision/candidate, or when the user asks painter/generate image/regenerate/create image.
---

# RepoChan Painter

Use the [RepoChan domain glossary](../repochan/references/terminology.md) for role, asset, status, and completion terms. Schemas and CLI help define serialized fields and arguments.

You are the Painter and final gatekeeper. You receive Asset Orders assigned to the Painter for execution, resolve their visual references, prepare professional Painter briefs, select the best available image generation path, and save order result versions under the `.repochan` protocol.

> **Progressive disclosure**: This file is the executable main flow. Detailed methodology, workflows, and examples are in `references/` — **read them on demand**, do not rely on memory to skip hard rules.

Before interpreting the brief, read [preferences.md](references/preferences.md). It contains adjustable artistic tastes, not order requirements. Apply a few only within the freedom left by the user, references, template, safety rules, and protocol.

## Core Principle: Reference-Anchored Generation

**Every non-foundation-sheet order should have references.** References are resolved to actual image files and passed as reference images to the image generation tool. This is how visual consistency is maintained across assets.

The Foundation Sheet cover (`assetType: foundation_sheet` or `cover_sheet`) is the only order type that can be generated without references — it IS the anchor.

## Batch Execution (Multiple Approved Orders)

The Art Director creates all requested orders at once (Foundation + requested downstream). When you receive multiple approved orders, **execute them in dependency order within the user's scope**:

1. **Execute foundation first** — it is the Visual Anchor for all downstream assets and must be generated first.
2. **Then execute downstream** — each downstream order's `references` point to the foundation, and `resolve-references` can now successfully resolve the foundation image path.

**yolo mode**: After Foundation is generated, continue directly to requested, authorized downstream work without stopping. A first-cover-only request ends at Foundation delivery, including under yolo.
**Non-yolo mode**: After foundation is generated, stop at Checkpoint 2 (controlled by the Wizard), continue downstream after user confirmation.

If Foundation is not in the current order list because it already exists, first ensure the Wizard's [resume branch](../repochan/references/foundation-resume.md) has resolved its current-version revision and confirmation conditions. Then `resolve-references` can supply that selected anchor for requested downstream work.

Execute orders one by one: read order → resolve references → assemble prompt → `repochan image gen` → `repochan order create-result` → next.

**Visual inspection (`repochan browse`)**: After delivering a result or when inspecting versions, use `repochan browse` to open the local protocol browser — the Orders grid shows covers, Order details let you switch between versions, the Persona card shows character settings, and the derived view shows derivation audit. Use Refresh after CLI writes to load current results. Protocol inspection is read-only.

Before starting actual generation, explicitly switch the current order to `in_progress`; results that pass QA are marked as `delivered` by `create-result`. Do not leave an order showing `approved` during remote generation.

## Pre-Execution Checks

1. Analysis report must be ready (check with `repochan analysis get`).
2. Persona must be ready (check with `repochan persona get`).
3. Select an order (`repochan order get <id>`) and check its references. Execute `approved` / `in_progress` / `needs_revision` orders within the user's authorized scope. For a `draft`, approve through `repochan order set-status <orderId> approved` only when the user's request, confirmed checkpoint, or explicit yolo already authorizes execution and required references are complete. Wizard assignment and CI alone do not grant approval. Return incomplete references to AD; ask only when execution permission is actually missing. **Do not** ask for an API key or stop merely because bookkeeping left an authorized, complete order in draft.
4. **`repochan image gen` wait rules**: Complex/landscape images often need 2–5 minutes; the approximately **20-minute** async poll budget starts after a submit response provides a task/job ID. `openai-async` uses OpenAI Images submit headers, not native `/v1/tasks` submission; a relay may still return a synchronous `200`. Bash `timeout` should be ≥ **1320000** (22 minutes for polling, with separate allowance for submit/read time). **Only one gen per order at a time**. On failure with `jobId` or `billedRisk`, follow [interrupted-generation recovery](../repochan/references/image-tools.md#recover-an-interrupted-generation) before another paid call. A missing ID does not establish that no task exists; keep an unidentified or unfinished request unresolved and never automatically switch modes to re-send it. When configuration is missing, have the user run `repochan image configure` / `repochan image status`, **do not** ask the user for an API key.
5. **If status is `needs_revision`, this is a review-loop order.** Enter the review loop flow — read [workflows-review.md](references/workflows-review.md), use the previous version artifact for img2img, not generation from scratch.
6. **Check whether the order has `references`.** If so, resolve them.
7. **Read the order's `templateId`** (if present): `repochan template get <templateId>`. This gives you the authoritative `prompt_template`, output dimensions, grid layout, and technical constraints. **If the template declares a `grid` (`rows`/`cols`), a layout-guide reference is mandatory** — see Step 3.
8. **If the order has no references and is not a Foundation Sheet cover, warn the user** (see edge cases below).
9. Check relevant existing order result versions.
10. Ask before changing `currentVersion`. Prefer adding new versions.
11. After completing reference resolution and prompt assembly, before calling the image tool, run `repochan order set-status <orderId> in_progress` (skip if already `in_progress`).

User feedback revisions / multiple candidates → [workflows-review.md](references/workflows-review.md), [workflows-candidate.md](references/workflows-candidate.md).

## Key Hard Rules Checklist

Full rules are in references; references take precedence in case of conflict.

1. **Do not restate appearance when reference images exist** — reference images handle "what it looks like", the prompt handles "what it does / how it is composed".
2. **Must stop on `resolve-references` failure** — having references but resolving to empty means you cannot pretend there is an anchor.
3. **Must call `repochan image gen` for authorized execution** — after the user's request or resolved checkpoint authorizes a complete order, deliver its image rather than stopping at a brief or asking for the same permission again. Wizard dispatch alone is not approval.
4. **`generationPrompt` is mandatory** — `create-result` must include the full exact text passed to `--prompt`, otherwise core will reject the save.
5. **Template constraints are not weakened** — post-processing constraints like slicing/pure white background/spacing are preserved as-is.
6. **Review loop uses img2img** — the previous version artifact serves as the `--reference` base image.
7. **Single-hand focus for poses** — having both hands perform fine actions easily causes "three hands" (see prompt-methodology).
8. **Safety**: No gore, CSAM, hate/discrimination; character apparent age no lower than 15 (full text in safety-and-mindset).
9. **Do not hijack the target repo** — do not run project code for image generation/auth.
10. **Do not store absolute paths in meta** — only record portable information like `referenceImagesUsed`, orderId, etc.
11. **Do not run image-edit or install its optional ML capability** — Painter delivers original generated images. Guide preparation, slicing, background removal, alpha QA, and optional ML installation belong to assembly or the Wizard's standalone image-tools route. For `REPOCHAN_IMAGE_ML_MISSING`, return the environment issue to the assembly owner; do not regenerate the original image.
12. **Grid orders must use a prepared layout-guide reference** — the AD declares it as a `composition` file reference, so `resolve-references` returns it (composition sorts first). Read and pass it like any resolved reference. If the template declares a grid but no usable guide resolves, return the order to AD for reference completion before generation. Never create a guide or silently add an undeclared reference yourself.

## Reference Resolution Flow

### Step 1: Read the Order

```
repochan order get <orderId> --json
```

Check the `references` field and `assetType`.

### Step 2: Resolve References (if any)

```
repochan order resolve-references <orderId> --json
```

Returns absolute file paths for each reference, grouped by role: `character` / `style` / `composition`.

**Hard constraint (must read for non-foundation assets)**: If the order has `references` but resolve returns empty, **must stop and error**. Check whether the foundation is `delivered`, whether the versionId is correct, fix it, then generate.

**Never skip resolve-references** — the resolved absolute paths are passed as reference images to `repochan image gen`.

### Step 3: Inject References into the Generation Call

**Each reference image must use a separate `--reference` flag** — do not attach multiple paths to a single flag (the CLI will discard paths after the first):

```bash
# ✅ Correct: one --reference per path
repochan image gen --prompt "<refined painter brief>" \
  --reference "<resolved path 1>" \
  --reference "<resolved path 2>" \
  --aspect landscape|square|portrait --size 1024x1024

# ❌ Wrong: multiple paths on one flag → second path discarded as positional arg
repochan image gen --prompt "..." --reference "<path1>" "<path2>" --aspect landscape
```

Key CLI parameters: `--prompt`, `--reference <path>` (repeatable, one flag per reference image), `--out` (do not pass by default, CLI writes to `~/.cache/repochan/`), `--aspect`, `--size`, `--quality`, `--background`, `--output-format`. Generally do **not** pass `--mode` (defaults to auto). Diagnostics: `repochan image status`, `repochan image probe`.

**`--quality` read from template**: The `quality` field (`low` | `medium` | `high` | `xhigh` | `max` | `auto`) returned by `repochan template get <templateId> --json` is passed directly to `image gen --quality`. Do not pass when the template does not declare quality (use default). `xhigh` / `max` only work on GPT-Image-2.5 endpoints and cost more — never raise the tier on your own initiative.

**`--background` read from template**: The `background` field (`transparent` | `opaque` | `auto`) returned by `repochan template get <templateId> --json` is passed directly to `image gen --background`. When the value is `transparent`, also pass `--output-format png` (jpeg cannot carry alpha). Do not pass `--background` when the template does not declare it. Isolated templates (`official/isolated-character`, `official/isolated-prop`) declare `background: transparent`; matte cutout / grid templates do not — they keep uniform matte for chroma-key.

**`--size` resolution order**: User explicit size > deliverable's `genSize` (the generation resolution declared by the order, >= output size) > template `size` > deliverable's `width`/`height`. Generation size is always >= output size; downsampling is left to post-processing — this is the source of high-DPI sharpness.

**Large size note**: `2K`/`4K` keywords may be interpreted as square on some endpoints (observed: bare `4K` produces 2880²). For landscape/portrait large images at 2K/4K, you must write explicit `WxH` (e.g., `3840x2560` landscape, `2048x3072` portrait), do not pass only the keyword.

**Grid orders: layout-guide reference (mandatory).** If `repochan template get <templateId> --json` returns a `grid` field (`rows`/`cols`), the order is a grid asset — sticker/chibi sheet, item/prop grid, badge grid, icon matrix, iconfont sheet, web-state grid, or any future N×M template.

1. **Primary path**: the Art Director declares the layout-guide as a `composition` file reference at order creation, so `resolve-references` returns it (composition sorts first). Pass it via its own `--reference` flag together with the foundation — no extra work on your side.
2. **Incomplete order**: if the template declares a `grid` but no usable composition guide resolves, stop and return the order to AD. The assembly owner or Wizard image-tools route prepares the guide; AD adds it through `repochan order update`. Resolve the completed order again before generation.
3. The guide constrains composition only — **do not** paint its frame lines, safe-zone lines, crosshairs, or cell numbers into the final image (this constraint is also restated in the grid templates themselves).

Foundation Sheet covers and single-subject templates (no `grid` field) never use a layout-guide.

foundation_sheet itself is the anchor and does not need `--reference`.

### Step 3.5: Simplify Prompts When Reference Images Exist

**When a character reference image exists, keep the prompt as concise as possible — do not unnecessarily restate appearance already locked in by the reference image.**

With a reference image, the prompt should **only include**: composition and layout, this specific pose/expression/action, asset type constraints, background and environment.  
**Do not restate**: hair color/eye color/outfit/accessories/body type.

- ❌ Wrong (restating appearance): "1girl, long crimson hair..., standing on left side"
- ✅ Right (concise): "character standing on left side, right hand raised in greeting, warm expression, project name as large title on right side, soft gradient background"

**Without a reference image** (foundation, or a reference-free order explicitly revised by AD under user direction): the prompt must fully describe character appearance. A resolution failure never authorizes silently dropping declared references.

The mantra: **reference images handle "what it looks like", the prompt handles "what it does / how it is composed"**.

### Step 4: Reference Image Usage Rules

1. First run `resolve-references` to get absolute paths.
2. Pass them to `repochan image gen`, one `--reference` flag per path.
3. Record `referenceImagesUsed: true` and reference sources in the result `meta`; do not store absolute paths.

## Prompt Construction (Summary)

Full assembly and methodology:

| Topic | File |
|---|---|
| Source priority, template slots, no-template compatibility | [prompt-assembly.md](references/prompt-assembly.md) |
| Avoid→positive, identity boundaries, Chinese-English mixing, Pose, adjective precision | [prompt-methodology.md](references/prompt-methodology.md) |
| poster / chibi / banner / foundation special guidance | [asset-type-guides.md](references/asset-type-guides.md) |

**Source priority (on conflict)**:

1. User request / explicit execution instruction (must not violate safety)
2. **Template** — `prompt_template`, size/grid/constraints win
3. Order brief / mustInclude / avoid / acceptance criteria

Default path: `template get` → fill all `{{slot}}` placeholders (none left behind) → attach constraints → apply methodology → pass to `image gen`, write the full string to `generationPrompt`.

**Must read** [asset-type-guides.md](references/asset-type-guides.md) before generating per asset type.

## Output Specifications and Generation

See [output-and-save.md](references/output-and-save.md).

Key points:

1. User explicit size > template size/aspect > deliverable specs.
2. **Pass both `--size` and `--aspect`**.
3. **Must actually call** `repochan image gen`; generated images default to cache output, path used for `create-result`'s `files`.
4. Anatomy: prevent with "single-hand focus"; probabilistic errors handled by rerun/review; **do not** pile on `no extra hands` negative constraints.

## Protocol Save (Hard)

```bash
repochan order create-result <<'EOF'
{
  "orderId": "<orderId>",
  "files": ["<path printed by image gen>"],
  "generationPrompt": "<full exact text passed to --prompt>",
  "promptBrief": "<optional short summary>",
  "notes": "..."
}
EOF
```

- **`generationPrompt` is mandatory**: the image generation tool will throw an error and refuse to save without it.
- meta contains only portable fields: `referenceImagesUsed`, `references`, `templateId`, `aspectRatio`, `safetyConstraintsApplied`.
- Published result versions and their `meta.json` bytes are immutable; every revision uses a new `versionId`, including an explicitly requested overwrite.

Full text and mindset/safety in [output-and-save.md](references/output-and-save.md), [safety-and-mindset.md](references/safety-and-mindset.md).

## Edge Cases

### Order has no references and is not a Foundation Sheet cover

1. `repochan foundation find`.
2. Foundation Sheet exists: suggest adding it as a reference before generating; ask the user.
3. No Foundation Sheet: warn that there is no Visual Anchor; only proceed after explicit user confirmation, and record in notes.

### Order is the Foundation Sheet cover itself

No references needed. Generate image from persona + analysis plain text. Use the persona visual description as the main driver.

### The Foundation Sheet referenced by the order has no delivered result yet

Report that resolution is impossible; prioritize generating and delivering the Foundation Sheet first. If the user explicitly chooses a no-reference path, first create/correct an order via CLI that does not declare that reference, then continue with the new order; do not take the original order that "declares references but resolves to empty" and generate directly.

### References for multiple different characters

Resolve all, pass each path with a separate `--reference` flag; the prompt should describe each reference's role (character/style/composition).

## End-to-End Examples

Full bash-level examples (Foundation Sheet / downstream / review loop) → [examples.md](references/examples.md).

## References Index

| File | When to Read |
|---|---|
| [workflows-review.md](references/workflows-review.md) | User feedback revisions, `needs_revision` |
| [workflows-candidate.md](references/workflows-candidate.md) | User wants multiple candidates |
| [prompt-assembly.md](references/prompt-assembly.md) | Filling templates / no-template assembly |
| [prompt-methodology.md](references/prompt-methodology.md) | Methodology before writing any prompt |
| [asset-type-guides.md](references/asset-type-guides.md) | Before generating per assetType |
| [extract-qa-retry.md](references/extract-qa-retry.md) | starter-localizer loop when extract QA defects |
| [output-and-save.md](references/output-and-save.md) | Spec mapping, mandatory gen, saving |
| [safety-and-mindset.md](references/safety-and-mindset.md) | Safety and order mindset |
| [examples.md](references/examples.md) | Reference full execution paths |
| [preferences.md](references/preferences.md) | Adjustable Painter tastes for interpreting open creative space |

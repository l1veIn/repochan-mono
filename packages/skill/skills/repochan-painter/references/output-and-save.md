# Output Specifications, Mandatory Generation, and Protocol Save

## Output Spec Resolution

Before calling `repochan image gen`, resolve output specifications and map them to CLI-supported aspect ratio and size parameters:

1. If the user gave explicit size/aspect ratio instructions for this execution, use them (unless unsafe or impossible).
2. Otherwise, if the order's first deliverable declares `genSize`, **use it as the generation resolution** — `genSize` >= output size, downsampling is left to post-processing, ensuring sharpness on high-DPI screens.
3. Otherwise, if a template exists, use the template's canonical `size`, and adopt the derived aspect ratio returned by `template get`.
4. Otherwise, use the order's first deliverable `width`, `height`, `aspectRatio`.
5. Map the resolved dimensions to `repochan image gen` parameters:
   - `--size`: exact dimension string, e.g. `2048x2048`, `1200x800`; `2K`/`4K` keywords also accepted.
   - `--aspect`: `1:1` or equal width/height -> `square`; wider than tall -> `landscape`; taller than wide -> `portrait`.

**Sharpness discipline**: When `genSize` or template size is below `1024` (short edge), unless the user explicitly requests small images, generate at short edge >= `1024` (grid images at >= `2048`, so cells have downsampling room). The delivered output size is constrained by the deliverable's `width`/`height`; **generation size is always >= output size**, never the reverse.

**Critical: Pass both `--size` and `--aspect`.** `--size` preserves target pixel specification, `--aspect` provides degraded semantics for providers that only support coarse ratios.

Call example:
```bash
repochan image gen --prompt "<assembled prompt>" --aspect square --size 2048x2048
```

Do not invent special aspect ratio rules for Foundation Sheet covers. Foundation Sheet covers follow their template like all other orders.


## Generation: Mandatory Tool Usage

**You must call `repochan image gen` to produce the image.**

Do not:
- Confirm with the user before generating — the user already approved by dispatching the Painter.
- Write a brief and stop — a brief without a generated image is an incomplete deliverable.
- Describe what you "would" generate — actually call the CLI.

Call `repochan image gen` (one separate `--reference` flag per Reference image):
```bash
repochan image gen --prompt "<your assembled persona + order + template prompt>" \
  --reference <resolved path 1> \
  --reference <resolved path 2> \
  --aspect landscape|square|portrait --size 1024x1024
```

If foundation_sheet or another order truly has no Reference images, omit `--reference`:
```bash
repochan image gen --prompt "<your assembled persona + order + template prompt>" --aspect landscape|square|portrait --size 1024x1024
```

Write commands using pipe stdin for JSON, do not create temporary files in the project directory; generated images default output to `~/.cache/repochan/`, the command prints the path. Use that path in the `files` field of the `repochan order create-result` payload.


### Post-Generation Self-Check: Handling Anatomical Errors

Image generation models (including gpt-image-2) produce anatomical errors — extra fingers, three hands, misaligned limbs, floating hands, etc. These errors have **two main causes**:

1. **Multi-hand task stacking (preventable at the prompt level, see the "single-hand focus" principle in Pose writing technique above)** — this is the **primary, most avoidable** cause. When the prompt assigns independent complex tasks to each hand, the model "grows" extra hands. Following the single-hand focus principle can dramatically reduce three-hand incidence at the source.
2. **Model's inherent probabilistic errors (cannot be eliminated at the prompt level)** — even with a perfect prompt, extra fingers/limb misalignments still occur occasionally. This is inherent to diffusion models.

**Do not pile on "no extra hands / correct anatomy" negative constraints** in the prompt to eliminate probabilistic errors — testing shows such constraints have unstable effects and instead introduce new problems (making the model over-focus on "hands", producing other anomalies).

**Handling mechanism** (by priority):
1. **Prevention (most effective)**: Follow the "single-hand focus" principle when writing poses, avoiding multi-hand task stacking at the source.
2. **Pre-delivery self-check**: After receiving the image, if the model has multimodal capability, use `read` to take a look; if there is an obvious anatomical error visible to the naked eye (and you are confident the prompt has no multi-hand stacking), **regenerate once** — probabilistic errors usually fix on rerun. If the prompt does have multi-hand stacking, fix the prompt first then rerun.
3. **Post-delivery user/AD review**: When the user points out anatomical issues, follow the "processing review loop orders" flow for image-to-image regeneration.

In short: **multi-hand stacking is prevented via prompt, probabilistic errors are handled via rerun/review, never use negative constraints.**


## Protocol Save Rules

When the output is accepted:

1. Use `repochan order create-result` to save the binary image file as a new result version; pipe JSON payload via heredoc stdin, do not write temporary JSON files. Payload parameters include: `{ orderId, files, versionId?, tool?, promptBrief?, generationPrompt?, revisedPrompt?, notes?, meta?, provenance? }`. `files` must contain at least one currently readable, non-empty regular file; core pre-checks all paths before creating the version directory and advancing to `delivered` — cannot use empty arrays, empty files, missing paths, or notes to impersonate a deliverable. Each `versionId` can only be published once; revisions must use a new id.
2. In `meta.json`, record whether Reference images were used and which foundation/order they came from.
3. **Mandatory — `generationPrompt`**: Record `generationPrompt` as the exact full prompt you passed to `repochan image gen --prompt`. **This is a hard requirement enforced by core** — when the `tool` field involves image generation (any tool name containing `image-gen`), `repochan order create-result` will **throw an error and refuse to save** if `generationPrompt` is missing or empty. **You cannot save the result without it.** Do not substitute `promptBrief` for `generationPrompt` — `promptBrief` is a short human-readable summary; `generationPrompt` is the verbatim full prompt string. If you assembled a 500-word prompt and passed it to `repochan image gen --prompt`, that entire 500-word string goes into `generationPrompt`.
4. **Never store absolute filesystem paths in `meta`** (such as temporary generated paths or `/Users/.../generated-images/...`). The image-gen config cache is at `~/.repochan/image.json`, but result metadata should not depend on local machine cache paths. Images are already copied to the version directory by `repochan order create-result`; `meta` should only contain portable information: `referenceImagesUsed` (boolean), `references` (orderId/role list), `templateId`, `aspectRatio`, `safetyConstraintsApplied`.
5. `repochan order create-result` atomically creates the current result and advances the order to delivered; put delivery notes in notes.
6. Preserve prior versions; never overwrite existing result versions without the user's explicit approval.
7. Result publishing, candidate promotion, and normal status changes for the same order must be serial. If CLI reports transaction/recovery conflicts, first run `repochan order recovery list <order-id>` to view; wait and retry while an active publish still holds the lock; stale locks from crashed processes are auto-recovered by core. `prepared` / `recovery_required` can use `repochan order recovery recover <order-id> <transaction-id>` to restore the pre-transaction state; `staging_unprepared` has not yet written to the protocol target, only use `repochan order recovery abort <order-id> <transaction-id>` to discard the staging directory. In other cases only use `abort` when you confirm accepting the current complete state. **Prohibit manual modification or deletion of transaction/recovery files under `.repochan/`.**
8. All order status and result changes must call the corresponding `repochan order ...` commands. After a result version is published, the version directory and `meta.json` bytes remain unchanged; derived assets like slices, background removal, compression are generated by the Page Designer via `repochan starter asset-apply` into the pulled Starter's `public/`, never written back to the order result.

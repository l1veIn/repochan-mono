# Example Execution Flows

### Foundation Sheet Cover (No References)

```
1. repochan order get ord-foundation-001 --json
   -> assetType: "foundation_sheet", no references needed

2. repochan template get official/foundation-sheet
   -> prompt_template, size, grid, and technical constraints

3. repochan persona get --json
   -> rolePrompt, hairColor, eyeColor, outfit, accessories, signaturePose

4. Fill the template's prompt_template slots, and refine each slot with persona precision fields

5. After confirming this order's execution is already authorized, mark it in progress.
   repochan order set-status ord-foundation-001 in_progress
   Parse output specs from official/foundation-sheet. If 1:1:
   repochan image gen --prompt "<assembled prompt>" --aspect square --size 1024x1024
   -> Command output prints the generated image path, e.g. ~/.cache/repochan/generated-<timestamp>.png

6. Pipe payload via heredoc, then save the result:
   repochan order create-result <<'EOF'
   {
     "orderId": "ord-foundation-001",
     "files": ["<generated image path printed by repochan image gen>"],
     "promptBrief": "<brief summary>",
     "generationPrompt": "<exact assembled prompt passed to repochan image gen --prompt>",
     "revisedPrompt": "<provider-revised prompt (if returned)>",
     "notes": "Generated Foundation Sheet cover from persona. No references (first anchor)."
   }
   EOF
   -> Fetch the delivered exact version with order get-result --json and show
      its top-level files paths. Guided Mode returns to Wizard Checkpoint 2;
      a first-cover-only request ends here, including under yolo.
```

### Downstream Order (With References)

```
1. repochan order get ord-readme-hero-001 --json
   -> references: [{ type: "order", orderId: "ord-foundation-001", role: "character" },
                   { type: "file", role: "composition", path: "references/layout-guide-3x3.png" }]

2. repochan order resolve-references ord-readme-hero-001 --json
       -> [{ type: "order", role: "character", orderId: "ord-foundation-001", versionId: "v1",
        files: ["<absolute path returned by resolve-references>"] }]

3. repochan template get <templateId> + repochan persona get --json -> assemble prompt
   -> Pass the foundation's resolved path as `--reference` to the generation command, letting the Reference image anchor character identity

4. Parse output specs from the selected template/order, then call:
   repochan image gen --prompt "<brief>" --reference "<absolute path returned by resolve-references>" --aspect <landscape|square|portrait> --size <WxH>
   -> Command output prints the generated image path, e.g. ~/.cache/repochan/generated-<timestamp>.png

5. Pipe payload via heredoc, then save the result:
   repochan order create-result <<'EOF'
   {
     "orderId": "ord-readme-hero-001",
     "files": ["<generated image path printed by repochan image gen>"],
     "promptBrief": "<brief summary>",
     "generationPrompt": "<exact assembled prompt passed to repochan image gen --prompt>",
     "revisedPrompt": "<provider-revised prompt (if returned)>",
     "notes": "Resolved Foundation Sheet ord-foundation-001/v1 and used via --reference as character anchor."
   }
   EOF
```

### Grid Order (Layout-Guide Reference)

```
1. repochan order get ord-item-grid-001 --json
   -> references: [{ type: "order", orderId: "ord-foundation-001", role: "character" }]

2. repochan template get official/item-prop-grid-3x3 --json
   -> grid: { rows: 3, cols: 3 }  → a layout-guide composition reference is MANDATORY
      (any template with a grid field: sticker/chibi, item/prop, badge, icon, iconfont, web-state — not only stickers)

3. repochan order resolve-references ord-item-grid-001 --json
   -> [{ role: "composition", files: ["<order references/layout-guide-3x3.png>"] },   <- declared by the AD at order creation
       { role: "character",   files: ["<foundation absolute path>"] }]
   -> If no usable guide resolves, return to AD for completion; resolve again
      after AD has added the prepared guide through order update.

4. repochan order set-status ord-item-grid-001 in_progress
   Generate with BOTH references (one --reference flag per path, composition first):
   repochan image gen --prompt "<assembled grid prompt>" \
     --reference "<layout-guide path>" --reference "<foundation path>" \
     --aspect square --size 2048x2048
   -> The guide constrains composition only; the prompt must not reproduce
      its frame/safe-zone lines, crosshairs, or cell numbers

5. Pipe payload via heredoc, then save the result:
   repochan order create-result <<'EOF'
   {
     "orderId": "ord-item-grid-001",
     "files": ["<generated image path printed by repochan image gen>"],
     "generationPrompt": "<exact assembled prompt passed to repochan image gen --prompt>",
     "notes": "Grid order: AD-declared layout-guide (composition) + foundation passed as --reference composition constraints."
   }
   EOF
   -> Painter delivers the original sheet only; slicing/QA belongs to the Starter Localizer's asset-apply
```

### Review Loop (Image-to-Image Revision)

```
1. repochan order get ord-foundation-001 --json
   -> status: "needs_revision", currentVersion: "v1"
   -> Enter review loop flow

2. repochan protocol read orders/ord-foundation-001/reviews/v1.json --json
   -> verdict: "revise", notes: "Main color leans blue, persona requires #1E3A5F deep navy"
   -> criteriaResults: [{ criterion: "color consistency", passed: false, note: "actual leans #2B4A7B" }]
   -> If v1 has no Review because order add-revision recorded the feedback,
      use the explicit modification request from order.revisions returned in
      step 1; do not fabricate a Review verdict or treat its absence as approval.

3. repochan order get-result ord-foundation-001 --result-version v1 --json
   -> files: ["<absolute readable path for v1 returned by get-result>"]
      version.files: ["<portable filename stored in v1 metadata>"]
   -> Use the TOP-LEVEL files array for the revision reference; version.files
      contains filenames, and get-result selected v1 even if current changed.

4. Normal prompt assembly + layer on review correction instructions:
   "...adjust main hair/coat color to #1E3A5F deep navy, keep existing composition, pose, and layout unchanged..."

5. repochan order set-status ord-foundation-001 in_progress
   Generate revised image using the previous version Artifact as base:
   repochan image gen --prompt "<prompt with review corrections layered on>" --reference "<previous version Artifact path>" --aspect square --size 1024x1024
   -> Command output prints the generated image path, e.g. ~/.cache/repochan/generated-<timestamp>.png

6. Pipe payload via heredoc, then save as a new version:
   repochan order create-result <<'EOF'
   {
     "orderId": "ord-foundation-001",
     "versionId": "v2",
     "files": ["<generated image path printed by repochan image gen>"],
     "generationPrompt": "<full prompt>",
     "notes": "Review revision of v1: main color corrected to #1E3A5F. Used v1 Artifact as --reference base image for image-to-image revision."
   }
   EOF
   -> Order returns to delivered, user can review v2 again
```

# Example Execution Flows

### Foundation Sheet Cover (No References)

```
1. repochan order get ord-foundation-001 --json
   -> assetType: "foundation_sheet", no references needed

2. repochan template get official/foundation-sheet
   -> prompt_template, size, grid, and technical constraints

3. Read persona current.json
   -> rolePrompt, hairColor, eyeColor, outfit, accessories, signaturePose

4. Fill the template's prompt_template slots, and refine each slot with persona precision fields

5. Parse output specs from official/foundation-sheet. If 1:1:
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
```

### Downstream Order (With References)

```
1. repochan order get ord-readme-hero-001 --json
   -> references: [{ type: "order", orderId: "ord-foundation-001", role: "character" }]

2. repochan order resolve-references ord-readme-hero-001 --json
       -> [{ type: "order", role: "character", orderId: "ord-foundation-001", versionId: "v1",
        files: ["<absolute path returned by resolve-references>"] }]

3. repochan template get <templateId> + read persona current.json -> assemble prompt
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

### Review Loop (Image-to-Image Revision)

```
1. repochan order get ord-foundation-001 --json
   -> status: "needs_revision", currentVersion: "v1"
   -> Enter review loop flow

2. repochan protocol read orders/ord-foundation-001/reviews/v1.json --json
   -> verdict: "revise", notes: "Main color leans blue, persona requires #1E3A5F deep navy"
   -> criteriaResults: [{ criterion: "color consistency", passed: false, note: "actual leans #2B4A7B" }]

3. repochan order get-result ord-foundation-001 --result-version v1 --json
   -> files: ["<absolute path returned by resolve-references>"]

4. Normal prompt assembly + layer on review correction instructions:
   "...adjust main hair/coat color to #1E3A5F deep navy, keep existing composition, pose, and layout unchanged..."

5. Generate revised image using the previous version Artifact as base:
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

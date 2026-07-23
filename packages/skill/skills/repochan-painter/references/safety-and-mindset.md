# Order Mindset, Infrastructure Boundaries, and Safety

## Order Mindset

Treat the image model like a professional illustrator. The Foundation Sheet cover is the character bible you hand it. Provide:

- Reference images from the Foundation Sheet cover,
- Purpose and audience,
- Character identity and atmosphere (reinforced by Reference images),
- Composition intent,
- Constraints and forbidden elements,
- Brand color/material cues,
- Delivery specifications,
- Creative freedom.

Avoid over-constraining with fragile pixel-precise instructions. The brief should guide taste, Reference images should anchor identity.


## Prohibit Hijacking Project Infrastructure

Never run or import target repo code for image generation, auth discovery, model discovery, prompt execution, or asset production. The target repo is treated as a black box.

- Only read repo files for context via standard Pi session tools.
- Only use standard Pi session capabilities for generation: native model image support, registered Pi image tools/packages, or user-provided files.
- Do not run `uv run python`, `python`, project CLI, project tests, or ad-hoc imports from the target repo.


## Built-in Safety Constraints (Always Active)

These constraints are hardcoded in the Painter role and apply to all generations, regardless of what the order brief or persona fields say:

- No generation of content containing blood, violence, gore
- No generation of content containing child pornography or any form of minor sexualization
- No generation of content containing hate, discrimination, or insulting content
- Character apparent age no lower than 15
- Various anime styles (cyberpunk, magical girl, mecha, Japanese-style, etc.) are all allowed

If an order brief or persona field requests content violating these constraints, refuse and state the reason. These constraints do not exist in persona data — they are Painter-layer rules.

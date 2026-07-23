# Per Asset Type Special Guidance

### Poster Asset Special Guidance (assetType=poster)

Posters are **artistic-release assets** — completely different from Foundation Sheets (which are information carriers). The goal of a poster is a visually striking character Key visual, not a character information display.

**Poster must**:
- **Let the selected template's design movement lead**: Constructivism, Glitch art, Risograph pop, or Memphis composition language is the poster's skeleton. After reading persona.artStyle, only blend material, linework, and rendering traits compatible with the template into the corresponding slots; do not override the chosen design direction with a generic "character illustration style."
- **Free composition**: Dynamic poses, dramatic angles, environmental storytelling are all encouraged. Not constrained to "Full-body standing pose" — close-ups, half-body, high/low angles are all allowed.
- **Atmospheric background**: Not a white background — a design field matching the template style + project temperament.
- **No Foundation Sheet elements**: Absolutely no chibi, expression grids, color palette cards, or callout labels.
- **Reference foundation for character consistency**: Still first use `repochan order resolve-references <orderId> --json` to confirm foundation is resolvable; pass the resolved foundation image path via `--reference <path>` to `repochan image gen`, letting the Reference image anchor character identity; the graphic design language is determined by the selected template, not constrained by the foundation's art style.
- **Borrow identity only, not Foundation Sheet layout**: The prompt must specify *single poster composition only*; **prohibit** carrying over chibi grids, expression 3x3 grids, color palette cards, or callout labels from the foundation into the poster (common failure: posters crammed with Emoji packs).

### Brand Texture / Pattern Special Guidance (assetType=visual_pattern)

Pattern is a **direct-consumption asset**. Each `official/pattern-tile` order delivers only one full-bleed 1x1 canonical tile; do not generate 4-grid compilations, title plates, sample borders, or gutters. You (Painter) are responsible for the candidate matching the template; the page side handles reuse and deterministic QA; do not run image-edit yourself.

**Must**:
- **Single tile bleeding to edges**: The entire image is the tile, with no frames, margins, or partitions.
- **Four-way seamless**: Left-right and top-bottom seamlessly tileable, no perspective, no scene illustration.
- **No character Key visual**: Abstract motifs / geometric / brand symbols dominate.
- **No text or numbers**: Semantic text can only be abstracted into non-semantic geometric rhythm.
- Template constraints are not weakened.

### Sticker Sheet Special Guidance (assetType=chibi_emojis / sticker_sheet / web_state_stickers)

Sticker sheets are **grid production assets**. They carry expressions and can also mass-produce semantic states for web use (404, empty, loading, success, CTA cameo, etc.). Slicing quality depends on strict grid, uniform matte, spacing, and outlines; you (Painter) are only responsible for the original image — do not slice cells yourself, and do not promise the current CLI can auto-project multiple slots.

**Division of labor boundary**: Slicing, QA, and named projection belong to the Page Designer's `repochan starter asset-apply`; the Painter does **not** run `image edit extract*` on order deliverables as delivery pre-check, nor writes derived alpha/slices back to the order — the deliverable is always the original image. Asset-apply QA failures will loop back regeneration requests by defect code; for quick fix reference see [extract-qa-retry.md](extract-qa-retry.md).

**Sticker sheet must**:
- **Simplify each cell's content**: Each expression cell only keeps character avatar/upper body + expression + simple colors. **Do not** inject background accessories, text labels, complex scenes, or extra props into cells. `{{key_motifs}}` and `{{color_palette}}` are only used for character color coordination, not turned into decorations inside cells.
- **Ensure uniform matte**: Strictly use the single key-out background color specified by the template/order, consistent across the entire sheet, flat, with no gradient, texture, shadow, or ambient light pollution; follow template default when not specified, do not change color arbitrarily.
- **Matte and subject hue separation**: Matte must be a non-white solid color, and far from any part of the character's colors. Choose matte by subject hue: pink/purple subject -> green matte; green subject -> magenta matte; deep red subject -> green matte.
- **Ensure sufficient spacing**: Stickers must have abundant matte whitespace between them; stickers must not touch cell edges or each other. Insufficient spacing causes stickers to be truncated or stuck together during slicing.
- **~10% safe margin inside cells**: Each cell has ~10% inset on all four sides as a safe zone; sticker subjects (including props, effects, outlines) must not enter this margin band.
- **Grid orders use layout-guide reference**: First use `repochan image edit layout-guide --rows R --cols C --out <guide.png>` to generate a deterministic composition reference, then pass it together with the foundation as `repochan image gen --reference` (one flag per reference for multiple references). The guide only constrains composition — **do not** paint the guide's frame lines, safe zone lines, crosshairs, or cell numbers into the final image.
- **Keep square aspect ratio**: The overall image must be 1:1 square, otherwise cell proportions deform after slicing.
- **Keep cells consistent**: 3x3/4x4 grid rows, columns, camera distance, character scale, and safe margins are strictly consistent; each cell expresses only one state defined by the order.
- **Control alpha risk**: Avoid character colors close to the matte, large semi-transparent areas, glow, hair color bleeding, and cross-cell elements; for high-risk states, split to separate production orders.
- **Constraints are hard constraints**: Template constraints (spacing, uniform matte, no borders, etc.) must not be weakened or omitted.

### Icon Matrix Special Guidance (assetType=icon)

**Must**:
- Each cell is a complete app icon, **subject must not overflow cell boundaries** (leave safe margins).
- Strict 3x3 spectrum (character strong -> weak), do not confuse with sticker sheets.

### README Banner Special Guidance (assetType=readme_banner)

Banners are **brand-display assets** — must include the repo name text, serving as the visual anchor for the GitHub README hero section.

**Banner must**:
- **Repo name text must be rendered within the image**: Do not leave blank space for later CSS text overlay. The `render the repository name` instruction in the prompt requires the image model to directly render readable repo name text. If the model fails to render text on the first attempt, strengthen the text instruction on retry.
- **Text must be large and clear**: The repo name should serve as a prominent title element in the composition — large font size, strong typographic design, blending with the image but not obscured.
- **Not a sticker sheet**: Do not cram chibi expression 3x3 grids; single horizontal composition + character + title.

### Foundation Sheet Cover Special Guidance (assetType=foundation_sheet)

The Foundation Sheet is an **information-carrier asset** — containing a character Full-body standing pose, chibi, expressions, Color palette, key elements, and icons, with text labels required for each section.

**Foundation Sheet cover must**:
- **Render text labels**: Character name, color names on the Color palette, and key element names should all be rendered as readable text in the image. Do not generate a text-free pure image — the information annotation on the Foundation Sheet is positive value.
- **Balanced composition**: The visual weight of each section (full-body standing pose, chibi, expressions, Color palette, key elements, icons) should be roughly balanced. Do not let a single element (such as the full-body standing pose or a particular callout) occupy excessive space. If a keyMotif is a visually intensive element (such as "call graph" or "data flow"), limit its size in the prompt to a small callout, not taking over the main visual.
- **Avoid handwritten text**: If the persona's `signaturePose` or `signatureAction` involves writing, reading, holding a book, or similar actions, change it in the prompt to an alternative pose that does not display text content (such as "holding a closed book/sketchbook"). AI image models render handwritten text unreliably, easily producing reversed or garbled text that ruins the image.

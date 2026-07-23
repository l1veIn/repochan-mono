# Prompt Assembly: Template Slots

## Source Priority

When sources conflict, handle in this priority order:

1. **User request / explicit execution instruction** — highest priority, as long as it does not violate safety constraints.
2. **Template** — authoritative for creative method and output specs: `prompt_template` provides the composition skeleton, `size`/grid/constraints provide physical output requirements.
3. **Order** — creation brief intent, subject, must-include elements, avoid list, creative freedom, acceptance criteria.

If the order conflicts with the selected template, follow the template. Examples:
- If `prompt_template` requires a title, but `order.brief.avoid` says "no text", keep the template-required title and only avoid extra text.
- If the template `size` is `1024x1024`, but the order or previous notes hint at portrait orientation, still generate square.
- If the template defines grid or technical constraints, they must be preserved even if the order brief is looser or contradictory.

Record substantive conflicts in result notes or `meta` so the user can audit why the template won.


## Template Slot Filling (Default Path)

1. Execute `repochan template get <order.templateId>`, read the complete `prompt_template`.
2. Identify all `{{slot}}` placeholders. Fill them one by one, then scan again after completion — **the final prompt must not contain any remaining `{{...}}`.**
3. Intelligently compose slot values combining persona, analysis, interview, and order brief. Slot names are semantic hints, not fixed schema mappings; when persona has no ready-made field, compose appropriate content based on template description and project context — do not leave slots empty.
4. Append template `constraints` as-is as technical constraints at the end of the full prompt. These constraints serve post-processing like slicing and background removal only; do not rewrite or weaken them.
5. Apply the general prompt methodology below: Reference image simplification, avoid-to-positive transform, action writing, Chinese-English mixing, safety and identity boundaries. Integrate the order's `mustInclude`, positively-transformed brief, and user's explicit instructions into the most relevant slots, or add as short supplementary blocks.
6. Pass the filled exact complete prompt to `repochan image gen --prompt`, and save it verbatim as the result's `generationPrompt`.

Fill sources for common slots (guidance, not mechanical rules):

| slot | Common Source & Handling |
|------|----------------|
| `{{character_visual}}` | `persona.rolePrompt` + hairColor + outfit; simplify to a single identity hint when a character Reference image exists |
| `{{color_palette}}` | persona main color, secondary color, accent color and hex values |
| `{{key_motifs}}` | persona.keyMotifs, filtered to 2-4 symbols relevant to the current asset |
| `{{character_name}}` | persona.name; for anime/manga also include nameJa |
| `{{repo_name}}` | repo name or formal display name from the analysis report |
| `{{signature_scene}}` | persona.signatureScenes; compose based on project temperament and template style when no ready-made value exists |
| `{{pattern_concepts}}` | persona.signaturePatterns, refined with web/brand usage context |
| Other custom slots | Determine based on template description, analysis, interview, and order brief |

Slot filling is not string-field copying. Each value must be grammatically smooth within the template sentence, visually concrete, and together with adjacent content form a complete design description.

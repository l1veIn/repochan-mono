# Extract QA Defect Codes -> Regeneration Fix Quick Reference

When the Page Designer's `repochan starter asset-apply` fails, it loops back a regeneration request by `defects[].code` in a structured envelope. This table only covers the Painter's perspective of "how to adjust prompt / matte / split orders." Slicing and QA itself belong to the Page Designer: the Painter does **not** run `image edit extract*` on order deliverables for delivery pre-check, nor writes derived alpha back to the order — each loop-back only delivers a new original image version.

| defect code | meaning | what to adjust on regeneration |
|------|------|------|
| `edge_touch` / `sheet_edge_touch` | Subject touches cell inner edge or sheet outer edge | Strengthen margin prompt (generous margin on all four sides, subject never touches any cell edge); ~10% cell inset as safe zone, subject including props/effects/outlines must not enter margin band; add padding around sheet outer edge; re-run `resolve-references` and pass the returned composition layout-guide together with foundation as `--reference` (legacy order without a declared guide: render one via `repochan image edit layout-guide --rows R --cols C`) |
| `empty_cell` | A cell has no extractable foreground | Check whether that cell's semantics were omitted, drawn too small, or stuck to adjacent cells; prompt must explicitly state each cell must have one complete, centered subject |
| `frame_count_mismatch` | ML-detected blob count != cell count | Stickers stuck or fragmented: increase spacing, merge cross-cell connected elements, remove scattered decorations/loose small objects, ensure each sticker is a single connected contour |
| `matte_subject_collision` | Matte and subject color distance too close | Change matte hex: choose by subject hue — pink/purple subject -> green matte; green subject -> magenta matte; deep red subject -> green matte. Ensure matte does not appear in character, outfit, props, outlines, or effects, and is non-white/near-white |
| `chroma_residue` | Matte not cleanly keyed out, key color residue at edges | Strengthen flat matte prompt: perfectly flat uniform matte, no gradient/texture/shadow/vignette/ambient light; avoid glow, color bleeding, ambient light pollution, and background color detail |
| `foreground_ratio_low` / `foreground_ratio_high` | Foreground ratio too low/too high | Too low: draw subject larger, fill safe zone, check if swallowed by matte pollution; too high: shrink subject, leave safe margins |
| `ml_unavailable` / `invalid_options` | Environment or parameter issue, not generation issue | No regeneration needed; Page Designer fixes ML environment or starter's extract-grid args |

**Consecutive 2 apply failures**: Split order as decided by Page Designer — split the full-sheet order into per-row or single-cell orders to generate individually, each still observing this table and template constraints.

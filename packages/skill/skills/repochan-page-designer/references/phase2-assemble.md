# Asset Application and Site Acceptance

## Asset Status

- `repochan/starter.json`: declares slots, fallback outputs, partial orders, and postprocess.
- `repochan/assets.json`: records the `src/status/orderId/versionId` actually consumed by the page.
- `.repochan/orders/`: stores Painter's raw deliveries and version history.
- `.repochan/web-starter/public/`: stores derived files from the starter localization and assembly phase.

`source` assets keep the scaffold always buildable, but they still belong to the Starter's original project; `customized` means the current project has completed replacement. When deciding whether an order can be reused, check asset type, templateId, project identity, composition, and foundation reference together; do not skip visual judgment just because the file exists.

## CLI Boundaries

```bash
repochan starter create-order <slot> --intent "..." --foundation <order-id>
repochan starter asset-apply <slot> --order <order-id> [--result-version <version-id>] --overwrite
```

**Dependency ordering**: when a slot declares an `slot:X` inter-asset reference (e.g., scene-night → scene-day), you must complete create-order + asset-apply for X first, then create the order for this slot — so that reference resolution picks up the new image just generated for the downstream project. The CLI will not block when the order is reversed, but the output will carry a `referenceWarning` (reference fell back to the starter's built-in source image); when you see this warning, check the ordering unless intentionally referencing the source image.

`asset-apply` updates `assets.json` only after complete success. When a postprocessing error occurs, preserve existing site output and state; do not manually assemble a half-completed state. Only call `repochan image edit` directly when debugging image-edit itself.

Official Starters currently use the offline, deterministic `chroma-grid` pipeline; normal assembly does not need ML runtime and should not pre-install it. Only when the manifest explicitly selects `bg-remove`, `extract-stickers`, `ml-blobs`, or `hybrid` with ML fallback, may `asset-apply` potentially need optional ML capability.

**Derived archive (audit)**: after a successful apply, each step in the postprocess chain where `keep` ≠ `false` archives its artifact to `.repochan/orders/<order-id>/derived/<timestamp>--<slot>/`, and appends an entry (slot / starter / resultVersion / steps / artifacts) to that order's `derived.json` (`repochan.order-derived.v1`). The index is append-only; repeated applies append without overwriting. When you need to answer "what artifacts has this order derived and where are they," read `derived.json`; do not guess from the current state of `public/`. Archive failure does not block apply (output carries `derivedWarning`).

Repo screenshots or real proofs already in final format go through `starter asset-import <slot> --file <path>`: the CLI atomically copies to the declared scalar output and records local-file SHA-256 provenance in `assets.json`. Bundle/publications must still go through `asset-apply`.

## Extract QA Failure Loop

First distinguish missing dependencies from pixel QA: if the error type is `MissingImageMlCapabilityError` and the error code is `REPOCHAN_IMAGE_ML_MISSING`, do not enter the Painter loop below. Run once:

```bash
repochan image edit ml install
```

After successful installation, retry the failed `repochan starter asset-apply ...` command as-is. If installation fails, stop and report the original error; do not loop installation. Network downloads only occur during explicit install; post-install ML operations read from the capability cache using local runtime and models, with no further network access. Missing dependencies are a Page Designer assembly environment issue, not a source image problem; do not request Painter regeneration to circumvent this.

When `asset-apply` fails due to extract QA, it exits non-zero; running with `--json` outputs a structured envelope to stdout (human-readable mode only prints a summary; when troubleshooting, always rerun with `--json`):

```json
{
  "ok": false,
  "error": "ExtractError",
  "command": "starter asset-apply",
  "slot": "<slot>",
  "orderId": "<order-id>",
  "resultVersion": "<version-id>",
  "defects": [{ "code": "empty_cell", "key": "empty", "index": 3, "detail": "..." }],
  "strategyUsed": "equal-cell",
  "pipeline": "v1",
  "matteColor": "#00ff00",
  "matteColorSource": "auto-sampled",
  "qa": null
}
```

Processing flow: parse the envelope → decide the regeneration action per the table below → request Painter to regenerate a new version (see repochan-painter's `references/extract-qa-retry.md` for prompt adjustment guidance on the Painter side) → rerun `asset-apply` against the new version. Do not hand-slice PNGs, do not manually edit `public/` or `assets.json` to bypass failures.

| defect code | Loop action |
|------|------|
| `edge_touch` / `sheet_edge_touch` / `empty_cell` / `frame_count_mismatch` | Block apply; request Painter to strengthen cell margin / full-sheet padding and include layout-guide as a gen reference (`sheet_edge_touch` follows the same guidance as `edge_touch`); if the same order fails twice consecutively, consider splitting the order (separate orders per row or single-cell) |
| `matte_subject_collision` / `chroma_residue` | Report `matteColor` and `metric` from the envelope; request Painter to change the matte hex or strengthen the flat matte prompt |
| `foreground_ratio_low` / `foreground_ratio_high` | Report metric; request Painter to check for overly sparse content or matte contamination |
| `ml_unavailable` / `invalid_options` | Fix ML runtime/model environment or starter's extract-grid args; do not blindly regenerate. If you also get `REPOCHAN_IMAGE_ML_MISSING`, follow the explicit install flow above and install only once |

Again: only call `repochan image edit` directly when debugging image-edit itself (see "CLI Boundaries" above); the normal loop always goes through Painter regeneration + `asset-apply` rerun.

## Acceptance Sequence

1. `repochan starter validate --output-dir .repochan/web-starter --localized`
2. `pnpm --dir .repochan/web-starter build`
3. Browser check default locale and other locales.
4. Check narrow viewport, wide viewport, keyboard focus, external links, and reduced-motion.
5. Verify character identity, text whitespace, CTA readability, and image clipping.

Do not bypass the validator by downgrading required slots, forging `customized`, or deleting locales.

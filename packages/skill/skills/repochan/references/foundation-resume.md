# Resume Foundation Work

Use this branch when protocol artifacts already exist, before dispatching AD or Painter. Carry forward the user's requested deliverables, execution conditions, and already given authorization from the current session.

## Locate the Existing Work

1. Run `repochan order list --json` and `repochan foundation find --json`. The latter is a **locator**, not evidence of delivery status, human acceptance, or permission to execute downstream orders. Select the Foundation identified by the session or the requested downstream orders' references when available; otherwise the locator proposes a candidate. Resolve an ambiguous selection before proceeding.
2. Read the selected order with `repochan order get <orderId> --json`. Use its exact `currentVersion` to read `repochan protocol read orders/<orderId>/reviews/<versionId>.json --json`, when a review exists. Prefer explicit acceptance or reuse of that exact version in the current session. Otherwise, check whether the review records the user's explicit acceptance of that version; an automatic/AD `pass` or a `reviewerRole` label alone does not establish human confirmation. A missing review or unclear acceptance leaves confirmation unknown; invalid protocol or other read errors must be resolved rather than treated as acceptance.
3. Fetch the selected image with `repochan order get-result <orderId> --result-version <versionId> --json`. Its top-level `files` contains readable absolute paths for display or `--reference`; `version.files` retains portable filenames. Read the actual image when presenting or assessing it.

## Choose the Resume Point

Apply the first matching branch, using the latest order state and the user's session instructions.

| Existing state | Next action |
| --- | --- |
| Order is `cancelled`, protocol is invalid, or the selected order/version is ambiguous | Resolve the state or selection through the CLI and the user's session intent before dispatch; do not silently revive or replace an order. |
| Foundation generation is `in_progress` or publication/recovery remains unresolved | Resume Painter's existing wait/failure-recovery or publication-recovery flow before another paid call or downstream execution. An older materialized version does not prove the active work finished. |
| Foundation order is `needs_revision`, or its current-version review requests `revise` / `reject` | Return the existing order to Painter's [review workflow](../../repochan-painter/references/workflows-review.md), preserving the prior version as the revision base. After delivery, Guided Mode presents the new version at Checkpoint 2. Yolo does not erase pending revision feedback. |
| Materialized Foundation has no unresolved execution/revision state, and either the user's explicit acceptance of that exact version is recorded or the user explicitly accepts/reuses it in this session | Reuse it for requested downstream work. Continue already authorized stages without repeating Foundation confirmation; a reviewer-role label alone is insufficient, and acceptance does not add deliverables or external-write permission. |
| Materialized Foundation has unknown human confirmation in Guided Mode | Show the exact version and its image, then resume Checkpoint 2. Record the user's feedback through the review workflow's exact-version create/replace rule before continuing with authorized downstream orders; an existing AD/automatic Review must not block the user's feedback. A materialized `currentVersion` alone does not resolve this checkpoint. |
| Materialized Foundation has unknown human confirmation and the user explicitly chose yolo | Use defaults within the requested scope and continue requested downstream work, while reporting that the image was selected under yolo rather than human aesthetic approval. |

If the user now requests a different style, selects a historical version, or replaces a pending revision with explicit reuse, carry that instruction back to AD/Painter to resolve the existing order and exact-version review through the CLI. Preserve a specifically selected historical version in downstream references with the existing `versionId` field. Read the resulting state again before selecting downstream work.

## No Image Yet

If `foundation find` returns no image, inspect `order list` for existing `foundation_sheet` / `cover_sheet` orders and read the matching order. Resume an unfinished order in its current authorized stage; AD adds only missing requested orders, with references to that Foundation orderId, instead of recreating the Foundation. A `draft` still needs complete references and execution permission; existing session authorization may satisfy that permission without another question.

For `in_progress`, carry forward existing generated output or remote-job information and follow Painter's wait/failure-recovery rules before another paid call. An interrupted generation is not permission to resubmit. If multiple unfinished Foundation orders exist, use the one identified by the session or existing downstream references; clarify an unresolved selection. Create a new Foundation only when none can be resumed or the user explicitly requests a new direction, after the required Analysis and Persona are ready.

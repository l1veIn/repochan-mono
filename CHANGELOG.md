# Changelog

This changelog records coordinated public package sets.

## Unreleased

### Cutout / slice stability redesign (design doc rev 4, PR1–PR7)

- `@repochan/image-edit`: unified `extractAssets` entry with strategy enum
  (`equal-cell` | `chroma-grid` | `ml-blobs` | `hybrid`), structured
  `ExtractError` with `defects[]`, and `writeLayoutGuide`. New chroma
  pipeline v2 (known-key soft-alpha unmix + trapped-spill despill, ported
  from `aldegad/sprite-gen`, Apache-2.0 — see `packages/image-edit/NOTICE`),
  centroid connected-component grid geometry, subject-aware matte select,
  max-dimension guard, atomic sticker publish. **Defaults flipped (PR7)**:
  `extractMatteGrid`/`extractAssets` default to `chroma-grid`, chroma
  defaults to `v2`; `equal-cell`/`v1` remain explicit escape hatches.
- Production-driven fixes: subject-aware matte select now verifies the
  candidate against the sampled background (falls back to corner sampling);
  CC noise floor is cell-area-relative (small floating decorations survive);
  `debrisPolicy` defaults to `keep-with-owner`.
- `repochan` CLI: new `image edit extract` and `image edit layout-guide`;
  `chroma-key --pipeline`; `--json` failures emit parseable defect envelopes
  (bare `extract`) and slot/orderId envelopes (`starter asset-apply`).
- `@repochan/core`: `validateExtractGridArgs` covers strategy/geometry
  pairing, chroma/qa/hybrid ranges — invalid starter args fail at manifest
  validation time.
- `@repochan/templates`: new `official/web-state-grid-2x2`,
  `official/badge-grid-3x3`, `official/item-prop-grid-3x3`; grid/cutout
  templates enforce non-white matte, safe margins, and matte hue rules.
  `official/icon-single` revised: icon sources are content-focused and
  full-bleed — circular/rounded-square masking is a postprocess decision,
  never baked into source art.
- Starters: regenerated all grid stickers/webstates via the new pipeline
  (layout-guide + non-white matte generation, chroma-grid + v2 extraction);
  sealed-scroll cameos regenerated from a blue-matte sheet after QA rejected
  two matte/subject collisions.

### `@repochan/image-gen` — Codex OAuth + native `/responses` transport

- New endpoint auth mode `auth.kind: codex`: authenticates via `codex login`
  (reads `~/.codex/auth.json`, read-only) and refreshes short-lived access
  tokens automatically. Refreshed tokens are cached at
  `~/.repochan/codex-token-cache.json` (mode `0600`); `~/.codex/` is never
  written.
- Native Codex transport: `codex` endpoints drive `gpt-image-2` through
  `POST https://chatgpt.com/backend-api/codex/responses` with an
  `image_generation` tool, replacing the need for an external reverse-proxy.
  Includes a one-shot 401 → refresh → retry (the global "never auto-retry a
  full generation" invariant still holds).
- `EndpointStatus` gains `authKind` (`bearer` | `codex`); `repochan image status`
  surfaces it. `repochan image probe` on a codex endpoint resolves a valid
  token instead of `GET /models`.
- `repochan image configure --provider codex` (and the interactive "Codex
  (ChatGPT login)" choice) validates `~/.codex/auth.json` is readable before
  writing the endpoint.

## 2026-07-15 release candidate

This candidate publishes the current CLI, libraries, skills, templates, and
starters as one dependency-closed set.

| Package | Candidate | Role in this set |
| --- | --- | --- |
| `@repochan/core` | `0.2.0` | Protocol schemas, deterministic rules, and recoverable order-result transactions. |
| `@repochan/image-edit` | `0.2.0` | Local page-assembly and pixel operations. |
| `@repochan/image-gen` | `0.2.0` | Image endpoint routing and generation. |
| `@repochan/skill` | `0.2.0` | Wizard and specialist workflow contracts. |
| `@repochan/templates` | `0.2.0` | Asset prompt and composition templates. |
| `@repochan/starters` | `0.1.0` | Complete Caddy, MarkText, RepoChan minimal, and Redis Source Starters with concentrated Transfer Kits. |
| `repochan` | `0.3.0` | Sole CLI binding surface for the complete set. |

Release verification uses a fresh-source, registry-aware preflight, explicit
public npm metadata, MIT license payloads, finite command timeouts, and tarball
checks that reject compiled test artifacts. Its isolated smoke installs the
candidate into an empty project.

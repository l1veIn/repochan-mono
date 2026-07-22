# RepoChan v0.4.0 — First public release 🎉

**Your repo, but make it a girl!** RepoChan gives the coding agent you already use (Claude Code, Codex, Pi, Cursor, …) a creative pipeline to run: **analysis → persona → art direction → painting → landing page**. Hard rules live in code; creative judgment lives in skills. There is no embedded runtime — your agent orchestrates, RepoChan tracks.

```bash
npm install -g repochan && repochan setup
```

Then open your agent in any project and type `/repochan`.

## What's in this release

This release publishes the CLI, local protocol browser, libraries, skills, templates, and Starters as one dependency-closed eight-package set.

| Package | Version | Highlights |
| --- | --- | --- |
| `repochan` | `0.4.0` | Sole CLI binding surface: browse, channel-selectable Starter sync, preview, extraction, and derived-archive commands |
| `@repochan/core` | `0.3.0` | Protocol + deterministic rules: derived audit history, `genSize`, inter-asset references, browser reads |
| `@repochan/image-edit` | `0.3.0` | Chroma extraction v2, structured extraction, true-vector iconfont output |
| `@repochan/image-gen` | `0.3.0` | Codex OAuth (`codex login`) + native `/responses` transport for `gpt-image-2` |
| `@repochan/skill` | `0.3.0` | Updated wizard, Painter, Page Designer, Web Designer, browser-assisted workflows |
| `@repochan/templates` | `0.3.0` | Expanded grid/icon templates with revised generation & postprocess contracts |
| `@repochan/starters` | `0.2.0` | 20 official Source Starters — all Astro + centralized i18n + tokenized |
| `@repochan/browse` | `0.1.0` | First release: local read-only protocol viewer + Starter preview service |

## Highlights

- **`repochan browse`** — a local protocol browser (Vite + React SPA on `127.0.0.1`): persona cards with version switching, order grids & detail timelines, derived audit timelines, and a React Flow dependency canvas. Starters tab can sync the catalog and preview real built sites in a new tab.
- **Clarity contract (`genSize`)** — order deliverables declare a generation resolution ≥ final size; downscaling happens in postprocess, so shipped assets stay crisp.
- **Cutout / slice stability redesign** — unified `extractAssets` with strategy enum (`equal-cell` | `chroma-grid` | `ml-blobs` | `hybrid`), chroma pipeline v2 (soft-alpha unmix + trapped-spill despill), structured defect envelopes, and atomic sticker publish. Defaults flipped to `chroma-grid` + `v2`.
- **Iconfont pipeline** — chroma-grid extraction → alpha contour tracing → true-vector, lucide-style SVGs (`fill="currentColor"`, 24 viewBox), plus `sprite.svg` and `index.json`.
- **Codex image endpoints** — `auth.kind: codex` drives `gpt-image-2` through the native Codex transport using your `codex login` session; refreshed tokens cached at `~/.repochan/codex-token-cache.json`, `~/.codex/` never written.
- **Starter ecosystem** — 20 design prototypes graduated to official Source Starters; inter-asset `slot:` references keep multi-asset compositions consistent; postprocess derived artifacts are archived append-only under each order for auditability.
- **Starter package diet** — 282 MB → 111 MB via webp reference masters.

## Verification

Release verification uses a fresh-source, registry-aware preflight, explicit public npm metadata, MIT license payloads, finite command timeouts, and tarball checks that reject compiled test artifacts. An isolated smoke test installs the release into an empty project.

## Links

- 📦 npm: [repochan](https://www.npmjs.com/package/repochan)
- 📖 Docs: [README](https://github.com/l1veIn/repochan-mono#readme) · [Architecture](https://github.com/l1veIn/repochan-mono/blob/main/ARCHITECTURE.md) · [中文文档](https://github.com/l1veIn/repochan-mono/blob/main/README_zh.md)
- 📋 Full changelog: [CHANGELOG.md](https://github.com/l1veIn/repochan-mono/blob/main/CHANGELOG.md)

**Full Changelog**: https://github.com/l1veIn/repochan-mono/commits/v0.4.0

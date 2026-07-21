# Changelog

This changelog records coordinated public package sets.

## Unreleased

### Dogfood 偏移修复（starter 审计）

- cgp crops 资产可复刻化：motif 道具（clip/earring/pendant/headphones）
  改由 `ord-props-001` 道具网格（`official/item-prop-grid-3x3` 首次生产使用，
  蓝底 + chroma-grid + v2）提取；expr/chibi 卡片改从新贴纸表（ord-sticker-001
  细胞）重映射，不再依赖 foundation 手工裁切。

- Cutout 重新设计：两张更有冲击力的新姿态（A = 仰角大对角线跳跃 2:3，
  B = 前倾开放手掌直指镜头 1:1，均绿底 + chroma v2 抠图），分发至
  character-game-page hero-cutout、frutiger cutout、scrolly
  cutout-wave/point；`ord-cutout-001` 登记新版本。
- 移除七个 starter 的非必要 hero-pose 线稿（姿态与页面层无结构关系，
  按姿态线稿教义）；相关 slot brief 改为纯文字留白/构图契约。
- landing-neobrutal-zine assets.json 补齐 orderId 溯源；webstates/sticker/
  cutout 订单的派生产物回填 derived.json（append-only）。

### Starter 资产间引用（`slot:` reference）

- Scalar slot 的 `reference` 接受 `slot:<slot-name>`：迁移参考解析为同一 starter
  内目标 scalar slot 在 assets.json 里的当前产物（composition 角色），用于
  资产间一致性（如 scene-night 参考 scene-day 保持 wipe 构图），取代
  场景线稿。manifest 校验拦截未知 slot / bundle 目标 / 自引用 / 引用环；
  `create-order` 时目标仍为 `source` 状态会带 `referenceWarning` 提示先
  apply 被引用方。character-game-page 的 scene-* 已改造为该模式（线稿删除，
  scene-day 自由构图）。

### Orders — postprocess 派生归档（审计）

- Starter postprocess 步骤新增 `keep` 字段（默认 `true`）。`starter asset-apply`
  成功后将 `keep ≠ false` 步骤的产物归档到 `.repochan/orders/<id>/derived/
  <时间戳>--<slot>/`，并追加订单级索引 `derived.json`
  （`repochan.order-derived.v1`：slot / starter / resultVersion / steps /
  artifacts），append-only，重复 apply 不覆盖历史。
- AGENTS.md 产品不变量 #5 相应修订为受控例外：归档发生在订单级 derived/，
  订单 `versions/` 目录与 meta.json 仍不可变。归档失败不阻断 apply
  （输出带 `derivedWarning`）。

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
  never baked into source art; the background is a designed brand backdrop
  (no chroma matte, no keying — postprocess is shape mask + resize only).
  `official/hero-pose-lineart-extract` narrowed to its one legitimate purpose:
  transmitting character pose when it has a structural relationship with
  H3/H4 page elements — character-only lineart, never for poster-style
  placements. starter-designer skill documents the same doctrine.
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

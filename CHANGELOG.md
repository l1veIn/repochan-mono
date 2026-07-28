# Changelog

This changelog records coordinated public package sets.

## Unreleased

### Direct asset utilities and Windows npm subprocess fixes

Patch set: `@repochan/skill@0.3.2`, `@repochan/browse@0.1.2`, and
`repochan@0.4.2`. The unchanged artifacts are reused at `@repochan/core@0.3.1`,
`@repochan/image-edit@0.3.1`, `@repochan/image-gen@0.3.0`,
`@repochan/templates@0.3.1`, and `@repochan/starters@0.2.1`.

- The `repochan` Wizard now routes direct image processing requests without
  forcing users into the full brand pipeline. Existing project assets still
  require approved orders and Painter delivery; protocol-external scratch
  generation remains explicit.
- New English-language, on-demand image tooling guidance covers generation, local editing,
  multi-size PNG/ICO output, semantic grid extraction, iconfont output,
  optional ML installation, compression, seamless QA, and GIF encoding.
- A complete English-language, on-demand CLI reference covers every public command group,
  including order extraction, Starter sync/preview, and the local protocol
  browser.
- On Windows, `starter sync` now routes npm through `ComSpec`, preserving the
  user's registry and authentication behavior instead of falling back after a
  `.cmd` shim spawn failure.
- Browse Starter preview now routes its npm install and build subprocesses
  through `ComSpec` on Windows while preserving direct execution on POSIX.
- The CLI advances to `0.4.2` for the Windows sync fix and because the packed
  runtime pins both `@repochan/skill` and `@repochan/browse` to exact versions.

## 2026-07-24 — `repochan` v0.4.1 package set

### Lightweight default CLI and explicit image ML capability

Patch set: `@repochan/core@0.3.1`, `@repochan/image-edit@0.3.1`,
`@repochan/skill@0.3.1`, `@repochan/templates@0.3.1`,
`@repochan/starters@0.2.1`, `@repochan/browse@0.1.1`, and `repochan@0.4.1`.
Browse advances because its packed runtime dependency now targets the patched
Core; `@repochan/image-gen@0.3.0` is unchanged and reuses its published artifact.
Templates advance because published `0.3.0` contents no longer match HEAD
(English labels and related template contract edits).

- `@repochan/image-edit` now depends directly on pinned `sharp@0.32.6` for
  deterministic offline pixel work; the large IMG.LY/ONNX runtime is no longer
  part of the default CLI dependency closure.
- `repochan image edit ml status|install` manages the pinned optional runtime
  under `~/.repochan/capabilities/image-ml/`. Installation is explicit,
  progress is visible, publication is atomic, and bundled models are verified
  before the cache becomes current.
- ML commands and `starter asset-apply` return an actionable
  `REPOCHAN_IMAGE_ML_MISSING` envelope with the exact install command. Page and
  Web Designer agents may install once and retry; Painter remains responsible
  only for original images.
- Release smoke rejects `@imgly/background-removal-node` or
  `onnxruntime-node` in a fresh default install and verifies that ML status
  points to the explicit installer.
- `landing-museum` is the sole default Starter. `minimal` remains available as
  an explicitly selected lightweight fixture, but is no longer recommended as
  the first-run product experience.
- Starter release smoke now type-checks every copied site before building it;
  `landing-frutiger-aero` narrows scalar asset states correctly when its catalog
  also contains bundle slots.

## 2026-07-22 — `repochan` v0.4.0 package set

This release publishes the current CLI, local protocol browser, libraries,
skills, templates, and Starters as one dependency-closed eight-package set.
The seven existing npm package names move to unclaimed versions, and
`@repochan/browse` enters the set as a first release. Because this 0.x release
adds public capabilities and changes protocol or workflow contracts across each
existing package, the affected release lines advance by one minor version rather
than reusing immutable npm versions or presenting the changes as patches.

| Package | Version | Role in this set |
| --- | --- | --- |
| `@repochan/core` | `0.3.0` | Protocol and deterministic rules for derived audit history, `genSize`, inter-asset references, and browser reads. |
| `@repochan/image-edit` | `0.3.0` | Chroma extraction v2, structured extraction, iconfont output, and new default behavior. |
| `@repochan/image-gen` | `0.3.0` | Codex authentication and native Responses image transport alongside existing endpoint routing. |
| `@repochan/skill` | `0.3.0` | Updated wizard, Painter, Page Designer, Web Designer, and browser-assisted workflow contracts. |
| `@repochan/templates` | `0.3.0` | Expanded grid/icon templates and revised generation and postprocess contracts. |
| `@repochan/starters` | `0.2.0` | Expanded, localized Source Starter catalog with concentrated Transfer Kits and auditable asset assembly. |
| `@repochan/browse` | `0.1.0` | First release of the local read-only protocol viewer and Starter preview service. |
| `repochan` | `0.4.0` | Sole CLI binding surface, now including browse, channel-selectable Starter sync, preview, extraction, and derived-archive commands. |

Release verification uses a fresh-source, registry-aware preflight, explicit
public npm metadata, MIT license payloads, finite command timeouts, and tarball
checks that reject compiled test artifacts. Its isolated smoke installs the
release into an empty project.

### 清晰度机制（genSize）与 web-designer 微调

- Cutout 资产分类学：通用 cutout 必须完整入画（四边留白、肢体完整）；
  出血裁切版是设计绑定资产（需 H3/H4 层边界配合）——**可进 starter/通用库，
  但必须搭配姿态线稿传递姿态**（姿态线稿的合法场景）。
  `official/character-cutout` 模板与 web-designer skill 已写入该教义；
  ord-cutout-001 v3 重新交付完整入画版 A/B（2048×3072 / 2048×2048），
  替换 4 个 starter 中的出血版；01 swiss-type hero 右侧新增 Fig. 01。
- Order deliverables 新增 `genSize`（生成分辨率 ≥ 成品尺寸，后处理降采样）——
  清晰度契约落在订单层；painter 解析顺序：用户 > genSize > 模板 size >
  deliverable 宽高，生成尺寸永远 ≥ 成品尺寸。5 个 starter 的 33 处
  deliverables 已声明 genSize（网格 2048×2048、cutout 2048×3072、场景
  2304×1536）。
- web-designer skill：默认技术栈（Astro + 集中式 i18n locale，与官方
  starter 同构便于二开）；资产不满足标准时偏向重新生成而非凑合。
- 狗粮资产全部 2K 重生：webstates/stickers 网格（2048²，cell 682px 降采样
  640px tile）与 cutout A/B（2048×3072 / 2048×2048），订单新版本 +
  derived 归档。

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

### Web-designer E2E 与 starter 批量迁移

- `docs/prototypes/` 十个方向设计稿中的 02–10 已由 web-designer 流程全部落地
  （swiss-type 为首个 pilot）；全部 Astro + 集中式 i18n + token 化 + Gate 记录。
- 前两个 batch 的 8 个站点已按 starter-designer 教义批量迁移为官方 source
  starter（landing-memphis / glitch-os / constructivist / solarpunk / toy-city /
  museum / wireframe-morph / anti-design）：补齐 starter.json manifest（slot
  声明、bundle publications、extract-grid postprocess、genSize）、site.json
  收缩至 starter-site.v1 4 桶 theme + brand 三节、assets.json 协议化、
  references 母图回收、canonical 预览；全部通过 `starter validate` 与
  pull smoke（临时目录 validate + build）。wireframe-morph 的 lineart-full
  是 `slot:` 资产间引用的首个生产用例。随后 pilot 站（landing-swiss-type）
  与 Batch 3（landing-cinema-credits）完成同样迁移，10 个设计稿全部成为
  官方 starter。
- starter 包减重（282MB → 111MB）：references 母图统一转 webp q92 ≤2048px
  （starter.json reference 路径同步）；character-game-page 的 PNG tile/crops
  与 landing-museum 的 studies/props 转 webp（deliverables 母图 format 保持 png）。
- `official/chibi-grid-3x3` 补 `grid.cell_keys`（9 个表情语义键）。
- iconfont 专用后处理：`extractIconfont`（chroma-grid 提取 → alpha 轮廓追踪
  → 真矢量 SVG）落地——每图标一个 `fill="currentColor"` + 24 viewBox 的
  lucide 风格 SVG，外加 sprite.svg 与 index.json；CLI `image edit iconfont`、
  starter postprocess op `iconfont`（末步规则）、derived schema 同步。
  轮廓追踪 vendor imagetracerjs（Unlicense，NOTICE 归因）。
  实验表（ord-iconfont-001）已产出 16 个 SVG 并归档 derived/。
- `official/iconfont-grid-4x4` 重写为镂空描边主形态（非白 matte + 16 个 UI
  语义 cell_keys + chroma-grid 提取契约）：实验证明镂空单色描边在新管线
  16/16 零残留且 alpha 可作 CSS mask 换色；品牌色填充变体可用但需注意
  chroma_residue 的 tint 轴误报（sky-blue tint 37 vs 绿 matte fringeDelta 18，
  主填充色应避开 matte tint 轴，如 sky-blue 用洋红底）并将 maxForegroundRatio
  放宽到 0.99。实验双表登记 ord-iconfont-001。
- `scripts/preview-sites.sh` 默认改扫 `packages/starters`（`PREVIEW_SITES_DIR`
  可覆盖）。

### `repochan browse` — 本地协议浏览器（Phase 1+2）

- 新包 `@repochan/browse`（Vite + React SPA + 127.0.0.1 薄服务）+ CLI
  `repochan browse [--port --no-open --json]`：persona 结构化人设卡（版本/
  候选切换）、orders 网格（current 封面 + 状态角标 + 筛选）、order 详情
  （版本时间线 A/B、references、prompt）、derived 审计时间线、React Flow
  依赖画布（foundation-anchor/reference/derived-from 边，选中节点弹出
  Inspector）。全部经 core 只读访问，协议安全文件沙箱。
- Starters 页：未同步时 sync 按钮（复用 CLI sync），同步后 preview 卡片网格；
  点卡片经新命令 `repochan starter preview <id>`（install→build→serve，
  dist 缓存复用）在新标签页打开真实站点。
- Skill 同步：painter 学会用 browse 做交付检查与版本对比；page-designer
  学会先 `starter sync` 再 pull、用 `starter preview` 评估候选；向导在
  检查点推荐用户打开 browse。

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

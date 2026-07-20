# Frutiger Aero Landing (landing-frutiger-aero)

RepoChan 官方落地页，原样保真整理成的创作者 Source Starter——Frutiger Aero / Y2K 设计方向。Astro 4 静态站，`zh`（`/`）+ `en`（`/en/`）双 locale。六屏结构：水下 Hero（生成主视觉 + 玻璃卡）、六步流水线卡、玻璃球资产展示、仓库酱人设 + 网页状态九宫格 + 漂浮抠图、发光 CTA、页脚。气泡三层视差 Canvas、光标气泡 trail、极光 hue-rotate 背景、GSAP/ScrollTrigger + Lenis 平滑滚动。

由 Gate 2 通过的成品站 `web-design/sites/landing-frutiger-aero/` 产品化而来；保留全部原始文案、角色名（仓库酱）、仓库 URL 与原始视觉资产。

## 运行

```bash
npm install
npm run build     # → dist/（/、/en/）
npm run dev       # 本地开发
```

要求 Node ≥ 18（Astro 4）。

## 本地化入口（Page Designer 只动这些）

| 文件 | 内容 |
|---|---|
| `repochan/site.json` | 项目名/描述/仓库 URL + canonical 主题色（primary/base/ink + accents）+ 品牌母题 |
| `repochan/i18n/zh.json` / `en.json` | 页面消费的全部文本（键/类型/数组长度完全一致） |
| `repochan/assets.json` | 当前资产状态（`source` = 原成品） |
| `repochan/starter.json` | manifest：locale、预览、asset slot、订单模板、确定性后处理 |

展示层没有任何硬编码颜色：`src/lib/site.ts` 的 `buildCssVars()` 把 `site.json` 的主题色展开成 `--<name>` / `--<name>-rgb` token（含 hero 主视觉 URL `--asset-hero`），由 `src/layouts/SiteLayout.astro` 内联注入；`global.css` 与气泡 Canvas（`bubbles.ts` 运行时读取同一批变量）都只消费 token。流水线六张卡片的渐变对按步骤序号取自 token（`PipelineCards.astro` 的 `STEP_COLORS`），不再随文案重复。

## Asset slots

- `hero-master`（scalar）：整幅水下主视觉，兼作 og:image。带低信息迁移参考 `public/assets/hero-pose-lineart.webp`（保留构图/气泡层次/留白，降角色身份与渲染风格）；原成品图不被覆盖。
- `cutout` / `foundation` / `banner`（可选）/ `pattern` / `poster` / `stickers` / `icon`（scalar）：订单模板见 `repochan/starter.json`。
- `webstates`（bundle）：3×3 网页状态九宫格，`publications[]` + 唯一 `extract-grid` 后处理。注意源母图是自定义 cell 顺序（见 manifest description），`tile-7` 当前是 maintenance 姿态，下一次 apply 时会落入模板 canonical 的 `cta` 语义。

## 验证

```bash
repochan starter validate --output-dir packages/starters/landing-frutiger-aero
```

## 二次开发要点

- **改文案**：只动 `repochan/i18n/zh.json` / `en.json`（两个 locale 保持同构，`starter validate` 会强制对齐）。
- **改配色**：只动 `repochan/site.json` 的 theme。
- **换资产**：`repochan starter asset-apply`（slot 合同见 `repochan/starter.json`），不要手改 `public/`。
- **动效**：`prefers-reduced-motion` 下气泡画布不渲染、所有 reveal 直接可见；无 JS 时内容完整可见（progressive enhancement）。
- **已知限制**：`og:image` 目前是相对路径（`/assets/hero-frutiger.webp`），部署到正式域名后应改为绝对 URL。

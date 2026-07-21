# 线框羽化 · Wireframe Metamorphosis (RepoChan Starter)

先有协议，才有皮肤：单一 sticky 舞台贯穿全页，滚动把同一构图从 ASCII 线框 / 灰模
逐层渲染成完整品牌世界（WIRE → SCHEMA → LINEART → FLAT → TEXTURE → RENDER → LIVE → WORLD），
顶部 RENDER 0–100% 进度轨 + 图层开关 + reduced-motion 阶段快照。
zh 为默认 locale，`/en/` 为完整英文版。关键视觉均为 RepoChan 流水线真实产物。

- 设计稿（方向基准）：`docs/prototypes/08-wireframe-metamorphosis.md`

## 命令

```bash
npm install
npm run dev      # 本地开发
npm run build    # 静态构建 → dist/
npm run preview  # 预览构建产物
```

## 结构

```
repochan/
  starter.json             # 唯一 manifest：locales / previews / asset slot / 订单模板 / 后处理
  site.json                # 项目元信息 + 4 桶主题 token + brand（颜色唯一出处）
  assets.json              # 当前成品资产（status: source）
  i18n/zh.json  i18n/en.json   # 页面实际消费的全部文本（两 locale 结构一致）
  references/              # 迁移参考：cutout A matte 母版 + 3×3 贴纸母图 + studio 场景原图
  previews/                # desktop.webp / mobile.webp
src/
  pages/
    index.astro            # zh（默认 locale）
    en/index.astro         # en
  layouts/SiteLayout.astro # <head>：meta/OG/theme-color/字体/favicon + 注入主题 CSS 变量 + 动效脚本
  components/
    MorphPage.astro        # 8 阶段舞台编排 + colophon
    MorphSection.astro     # 单阶段骨架（copy + 3:4 视觉槽位，--lp 局部进度）
    visuals/               # Wire / Schema / Lineart / Flat / Texture / Render / Live / World
  lib/
    site.ts                # 读 repochan/{site,assets,i18n}：locale 注册表、素材路径、palette()/buildCssVars()
    i18n/types.ts          # 文案结构契约（类型只读，数据在 repochan/i18n/*.json）
    motion.ts              # 滚动渲染引擎（--lp 写入、RENDER 进度、图层开关；reduced-motion 全跳过）
  styles/global.css        # 线框视觉系统 + 派生 token（color-mix）+ 响应式 + reduced-motion 降级
public/
  assets/                  # 页面实际引用的压缩素材（slot 输出）
  favicon.ico / icon-*.png / apple-touch-icon.png   # 由 icon slot 离线派生
```

## 本地化入口（Page Designer 只动这些）

- **文案**：`repochan/i18n/{zh,en}.json`；两 locale 键、类型、数组长度必须一致
  （`starter validate` 强制）。
- **主题**：`repochan/site.json` 的 `theme` —— 4 桶（primary/base/ink/accents），
  `buildCssVars()` 在构建期映射为 `--wire-bg/--wire-line/--sky/--pink/--purple/--emerald/--yellow`，
  `wire-bg-soft/wire-dim/wire-faint` 由 global.css 用 color-mix 派生；
  展示层（含 global.css、visuals/*）只引用这些变量，无颜色字面量。
  字体栈内联在 global.css 的 `--font-mono/--font-brand`。
- **素材**：`repochan/assets.json` + `repochan/starter.json` 的 slot 合同。
  `lineart-full` 的 reference 是 `slot:cutout-a`（资产间引用）——先 apply `cutout-a`，
  线稿以其产物为姿态参考重绘，crossfade 物化才成立。
  `stickers` 为 bundle slot（3×3 母图 extract-grid 自动切片为 sticker-0…8.webp，
  全 9 键位置契约），本页在 TEXTURE/WORLD 阶段环绕使用 0/3/6 三格。
  favicon 派生：`repochan image edit favicon public/assets/icon.webp --out public/favicon.ico --sizes 16,32,48 --overwrite`，
  再由 `image edit resize --sizes 180,192,512` 派生 apple-touch-icon.png / icon-192.png / icon-512.png。
- **动效**：`src/lib/motion.ts` 统一挂载；`prefers-reduced-motion` 下滚动监听与
  --lp 写入完全跳过，8 阶段退化为静态整页（全部终态），左下角出现阶段快照锚点导航。
- **a11y**：图层开关/复制按钮为原生 `<button>`，阶段导航为锚链接，`:focus-visible` 描边；
  L4 实体按钮是真实 `<a>` 链接。

## 已知限制

- `og:image` 使用相对路径（`/assets/cutout-a.webp`）；部署确定域名后应在
  `astro.config.mjs` 设 `site` 并改为绝对 URL。
- 中段（FLAT/TEXTURE）是同一张 cutout 的 CSS filter 状态模拟（设计稿技术提示明确允许），
  只有线稿与终稿 cutout 是独立真资产；`lineart-full` 必须与 `cutout-a` 同姿态，
  因此两者在 slot 合同里绑定（apply 顺序：cutout-a → lineart-full）。
- 源 sticker 母图的格语义（chibi 表情）与固定 key（welcome…cozy）不完全同位；
  slot 的 key→cell 是位置替换契约，下游按模板重出 3×3 网格后语义自然归位。
- 标题空心描边只对拉丁字形启用（`-webkit-text-stroke`）；zh 的 wire 阶段标题用实心 + 等宽代替。
- `studio-wide` 无独立订单号（原型狗粮资产）；slot 以场景原图作构图参考，可经
  `official/poster-scene` 重绘。

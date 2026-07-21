# 形状乐园 · Memphis Playground (RepoChan Starter)

把 git 仓库丢进 80 年代后现代形状乐园：几何舞台 Hero / 六块积木管线 /
贴纸转盘 + 状态跑马灯 / 玩法规则 / 撒花 CTA，全部视觉均为 RepoChan 流水线真实产物。
zh 为默认 locale，`/en/` 为完整英文版。

- 设计稿（方向基准）：`docs/prototypes/02-memphis-playground.md`

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
  references/              # 迁移参考：两张 cutout matte 母版 + 两张 3×3 母图
  previews/                # desktop.webp / mobile.webp
src/
  pages/
    index.astro            # zh（默认 locale）
    en/index.astro         # en
  layouts/SiteLayout.astro # <head>：meta/OG/theme-color/字体/favicon + 注入主题 CSS 变量 + 动效脚本
  components/
    Shape.astro            # 几何形状元件（SVG，颜色只引用 CSS 变量）
    ShapeNav.astro         # 0. 形状导航（几何图标代替普通链接）
    HeroStage.astro        # 1. 几何舞台 + 骑缘 cutout A + 双 CTA
    PipelineBlocks.astro   # 2. 六块「积木」管线卡（sticker 1–6 骑卡片角）
    AssetCarousel.astro    # 3. 贴纸圆形轨道（中心拱框海报）+ webstates 跑马灯
    PlayRules.astro        # 4. 三列「怎么玩」规则卡
    CtaConfetti.astro      # 5. 大色块收尾 + 复制命令 + 骑缘 cutout B
    SiteFooter.astro       # 6. 锯齿分割线页脚 + locale 切换
  lib/
    site.ts                # 读 repochan/{site,assets,i18n}：locale 注册表、素材路径、buildCssVars()
    i18n/types.ts          # 文案结构契约（类型只读，数据在 repochan/i18n/*.json）
    motion.ts              # 渐进增强动效（弹入/视差/confetti/复制，无 JS 完整可读）
  styles/global.css        # Memphis 视觉系统 + 响应式 + reduced-motion 降级（颜色只引用 CSS 变量）
public/
  assets/                  # 页面实际引用的压缩素材（slot 输出）
  favicon.ico / icon-*.png / apple-touch-icon.png   # 由 icon slot 离线派生
```

## 本地化入口（Page Designer 只动这些）

- **文案**：`repochan/i18n/{zh,en}.json`；两 locale 键、类型、数组长度必须一致
  （`starter validate` 强制）。
- **主题**：`repochan/site.json` 的 `theme` —— 4 桶（primary/base/ink/accents），
  `buildCssVars()` 在构建期映射为 `--bg/--ink/--pink/--cyan/--yellow/--violet/--coral`，
  展示层（含 global.css、motion.ts、Shape.astro）只引用这些变量，无颜色字面量。
- **素材**：`repochan/assets.json` + `repochan/starter.json` 的 slot 合同；
  两张 3×3 网格（stickers / webstates）为 bundle slot，`starter asset-apply`
  按 extract-grid 自动切片为 `sticker-N.webp` / `state-N.webp`（N = 格号）。
  favicon 派生：`repochan image edit favicon public/assets/icon.webp --out public/favicon.ico --sizes 16,32,48 --overwrite`，
  再由 `image edit resize --sizes 180,192,512` 派生 apple-touch-icon.png / icon-192.png / icon-512.png。
- **动效**：`src/lib/motion.ts` 统一挂载；`prefers-reduced-motion` 下全部跳过，
  页面静态完整可读（弹入直接落位、轨道/跑马灯静止、无视差与 confetti）。
- **a11y**：语义 section + `aria-labelledby`、复制按钮键盘可达、全站 `:focus-visible` 描边。

## 已知限制

- `og:image` 使用相对路径（`/assets/memphis-poster.webp`）；部署确定域名后应在
  `astro.config.mjs` 设 `site` 并改为绝对 URL。
- 源 sticker 母图的格语义（chibi 表情）与固定 key（welcome…cozy）不完全同位；
  slot 的 key→cell 是位置替换契约，下游按模板重出网格后语义自然归位。
- 中文 display 字体回退 Noto Sans SC 900（Fredoka 仅拉丁字形）。

# 白盒子美术馆 · Museum White Cube (RepoChan Starter)

把 RepoChan 流水线的真实交付物挂进一间极简白盒子美术馆：序厅开幕肖像 /
设定集全幅主展 / 角色研究双联 / 两面 3×3 版数墙 / 海报与纹样双联 /
流水线笔记 / 博物馆商店 CTA，展签上的藏品号全是真实订单号。
zh 为默认 locale，`/en/` 为完整英文版。

- 设计稿（方向基准）：`docs/prototypes/07-museum-white-cube.md`

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
  layouts/SiteLayout.astro # <head>：meta/OG/theme-color/字体/favicon + 注入主题 CSS 变量 + lightbox + 动效脚本
  components/
    MuseumNav.astro        # 0. 美术馆导航（icon 徽章 + 展厅链接）
    Lobby.astro            # 1. 序厅：manifesto + 开幕肖像（角色只出现一次）+ 展览说明
    GalleryFoundation.astro# 2. Gallery A：设定集单件全幅
    GalleryStudies.astro   # 3. Gallery B：cutout 主研究 + 表情/Q版研究墙 + 器物组
    GalleryEditions.astro  # 4. Gallery C：stickers / webstates 两面九宫格版数墙
    GalleryPosters.astro   # 5. Gallery D：riso 海报单件 + 孟菲斯海报/纹样双联
    StudioNotes.astro      # 6. 流水线笔记（六步，命令即展墙文字）
    MuseumShop.astro       # 7. 博物馆商店 CTA（三张商店卡 + 复制命令）
    Colophon.astro         # 8. Colophon：字体/管线/藏品致谢 + locale 切换
  lib/
    site.ts                # 读 repochan/{site,assets,i18n}：locale 注册表、素材路径、buildCssVars()
    i18n/types.ts          # 文案结构契约（类型只读，数据在 repochan/i18n/*.json）
    motion.ts              # 渐进增强动效（入场 fade / lightbox / 复制，无 JS 完整可读）
  styles/global.css        # 白盒子视觉系统（装裱画框 + 聚光）+ 响应式 + reduced-motion 降级（颜色只引用 CSS 变量）
public/
  assets/                  # 页面实际引用的压缩素材（slot 输出 + 静态研究墙/器物切片）
  favicon.ico / icon-*.png / apple-touch-icon.png   # 由 icon slot 离线派生
```

## 本地化入口（Page Designer 只动这些）

- **文案**：`repochan/i18n/{zh,en}.json`；两 locale 键、类型、数组长度必须一致
  （`starter validate` 强制）。
- **主题**：`repochan/site.json` 的 `theme` —— 4 桶（primary/base/ink/accents），
  `buildCssVars()` 在构建期映射为 `--wall/--floor/--mat/--ink/--muted/--frame/--hairline/--accent`
  （accents 顺序 = [floor, mat, muted, hairline]，frame 复用 ink），
  展示层（含 global.css、组件）只引用这些变量与 color-mix 派生，无颜色字面量。
- **素材**：`repochan/assets.json` + `repochan/starter.json` 的 slot 合同；
  两张 3×3 网格（stickers / webstates）为 bundle slot，`starter asset-apply`
  按 extract-grid 自动切片为 `sticker-N.webp` / `state-N.webp`（N = 格号）。
  两张 cutout（opening-portrait / exhibit-cutout）带 matte 母版 reference，
  重出后走 chroma-key v2 + compress。
  favicon 派生：`repochan image edit favicon public/assets/icon.webp --out public/favicon.ico --sizes 16,32,48 --overwrite`，
  再由 `image edit resize --sizes 180,192,512` 派生 apple-touch-icon.png / icon-192.png / icon-512.png。
- **研究墙 / 器物组（非 slot）**：`public/assets/studies/*`（3 表情 + Q 版，
  来自 ord-sticker-001 同一母图）与 `public/assets/props/*`（4 件器物，
  来自 ord-props-001）是母图的自由组合切片，不单独声明 slot——下游按
  stickers bundle 重出同一母图后语义自然覆盖；需要替换时用新的 640px
  透明 tile 直接覆盖同名文件即可（路径硬编码在 `src/lib/site.ts`，有注释）。
- **动效**：`src/lib/motion.ts` 统一挂载；`prefers-reduced-motion` 下全部跳过，
  页面静态完整可读（本方向的默认态就是克制）。
- **a11y**：语义 section + `aria-labelledby`、lightbox 键盘可关、复制按钮键盘可达、
  全站 `:focus-visible` 描边。

## 已知限制

- `og:image` 使用相对路径（`/assets/exhibits/foundation-sheet.jpg`）；部署确定域名后应在
  `astro.config.mjs` 设 `site` 并改为绝对 URL。
- 源 sticker 母图的格语义（chibi 表情）与固定 key（welcome…cozy）不完全同位；
  slot 的 key→cell 是位置替换契约，下游按模板重出网格后语义自然归位。
- 中文标题字体回退 Noto Serif SC（Newsreader 仅拉丁字形）。

# REPO酱特刊 · Neo-brutalist Rock Zine (RepoChan Starter)

一本把 git 仓库变成品牌资产的摇滚 zine：封面 / 本期委托 / 流水线连环漫画 /
可拖拽贴纸墙 / 剪报拼字 / 印章 CTA，全部视觉均为 RepoChan 流水线真实产物。
zh 为默认 locale，`/en/` 为完整英文版。

- 原型（设计基准，勿改）：`web-design/prototypes/landing-neobrutal-zine/`
- 源站（Gate 2 通过）：`web-design/sites/landing-neobrutal-zine/`

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
  site.json                # 项目元信息 + 主题 token（颜色唯一出处）
  assets.json              # 当前成品资产（status: source）
  i18n/zh.json  i18n/en.json   # 页面实际消费的全部文本（两 locale 结构一致）
  references/              # 迁移参考：封面抠图 matte 母版 + 两张 3×3 母图
  previews/                # desktop.webp / mobile.webp
src/
  pages/
    index.astro            # zh（默认 locale）
    en/index.astro         # en
  layouts/SiteLayout.astro # <head>：meta/OG/theme-color/字体/favicon + 注入主题 CSS 变量 + 动效脚本
  components/
    Marquee.astro          # 跑马灯（top/mid/bottom 三变体）
    Cover.astro            # 1. 封面（标题块 / 抠图主视觉 / 小贴纸条）
    IssueBrief.astro       # 2. 本期委托（拼贴：主卡 + 档案卡 + 海报 + banner）
    PipelineComic.astro    # 3. 流水线五格漫画
    StickerWall.astro      # 4. 可拖拽贴纸墙（GSAP Draggable，触屏可用）
    RansomQuote.astro      # 5. 剪报拼字座右铭
    StampCta.astro         # 6. 印章 + 封底订购券（复制命令）
    Colophon.astro         # 版权页 + locale 切换
  lib/
    site.ts                # 读 repochan/{site,assets,i18n}：locale 注册表、素材路径、buildCssVars()
    i18n/types.ts          # 文案结构契约（类型只读，数据在 repochan/i18n/*.json）
    zine.ts                # GSAP 动效层（npm 依赖，构建期打包）
  styles/global.css        # zine 视觉系统 + 响应式 + reduced-motion 降级（颜色只引用 CSS 变量）
public/
  assets/                  # 页面实际引用的压缩素材（slot 输出）
  favicon.ico / icon-*.png / apple-touch-icon.png   # 由 icon slot 离线派生
```

## 本地化入口（Page Designer 只动这些）

- **文案**：`repochan/i18n/{zh,en}.json`，标注 html 的字段支持 `<code>/<strong>/<br>`，
  组件用 `set:html` 渲染；两 locale 键、类型、数组长度必须一致（`starter validate` 强制）。
- **主题**：`repochan/site.json` 的 `theme` —— `buildCssVars()` 在构建期展开为
  `--paper/--ink/--pink/--blue/--purple/--mint/--yellow/--stamp-red/--note/--card`，
  展示层（含 global.css、zine.ts、tailwind.config）只引用这些变量，无颜色字面量。
- **素材**：`repochan/assets.json` + `repochan/starter.json` 的 slot 合同；
  两张 3×3 网格（stickers / webstates）为 bundle slot，`starter asset-apply`
  按 extract-grid 自动切片为 `sticker-N.webp` / `state-N.webp`（N = 格号）。
  favicon 派生：`repochan image edit favicon <icon.png> --out public/favicon.ico --sizes 16,32,48 --overwrite`。
- **动效**：`src/lib/zine.ts` 统一挂载；`prefers-reduced-motion` 下全部跳过，
  页面静态完整可读（marquee 停滚、印章/贴纸/剪报直接呈现）。
- **a11y**：语义 section + `aria-labelledby`、贴纸拖拽纯装饰不影响阅读、
  复制按钮键盘可达、全站 `:focus-visible` 描边。

## 已知限制

- `og:image` 使用相对路径（`/assets/og.jpg`）；部署确定域名后应在
  `astro.config.mjs` 设 `site` 并改为绝对 URL。
- 剪报拼字依赖 JS 做分词着色；无 JS 时退化为普通文本行（内容完整）。
- 源 webstates 母图的格语义（loading/empty/success/404/error/welcome/searching/
  maintenance/cozy）与 `official/web-state-grid-3x3` 模板固定 key 不完全同位；
  slot 的 key→cell 是位置替换契约，下游按模板重出网格后语义自然归位。
  其中 cell 5（state-5.webp）母图自带 "Sugar Riff" 气泡文字，页面未使用该格。

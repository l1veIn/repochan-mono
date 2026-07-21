# 瑞士字体机 · Swiss Typographic Machine (RepoChan Starter)

一台瑞士国际主义的纯字体机：Masthead 小 icon / 巨字 Hero + Fig. 01 完整入画 cutout B /
横向字轨 / 编号定义（Thesis）/ 六步流水线规格表 / 产物索引 / 真实 dogfood 证据图
（foundation + 工作室海报）/ 等宽命令 CTA / ≤120px 页脚 cutout 点缀。
字 ≥ 70% · 图 ≤ 30%，禁渐变/玻璃/厚投影，全部位图均为 RepoChan 流水线真实订单产物。
zh 为默认 locale，`/en/` 为完整英文版。

- 设计稿（方向基准）：`docs/prototypes/01-swiss-typographic-machine.md`

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
  references/              # 迁移参考：cutout B matte 母版 + foundation 原图
  previews/                # desktop.webp / mobile.webp
src/
  pages/
    index.astro            # zh（默认 locale）
    en/index.astro         # en
  layouts/SiteLayout.astro # <head>：meta/OG/theme-color/字体/favicon + 注入主题 CSS 变量
  components/
    Masthead.astro         # 品牌行：icon + wordmark + 协议行 + DOC 编号
    HeroType.astro         # 1. 巨字标题 + install 命令行 + Fig. 01 cutout B（完整入画）
    TypeTrack.astro        # 横向字轨（纯 CSS marquee，reduced-motion 静止）
    Thesis.astro           # 2. 三段编号定义（WHAT / HOW / OUTPUT）
    PipelineSpec.astro     # 3. 六步流水线规格表
    ArtifactIndex.astro    # 4. 真实订单产物索引表
    Evidence.astro         # 5. Fig. A foundation + Fig. B studio poster（带图注）
    Cta.astro              # 6. 整行等宽命令 + 文档链接
    Colophon.astro         # 字体/网格说明 + ≤120px 页脚 cutout + locale 切换
  lib/
    site.ts                # 读 repochan/{site,assets,i18n}：locale 注册表、素材路径、buildCssVars()
    i18n/types.ts          # 文案结构契约（类型只读，数据在 repochan/i18n/*.json）
    motion.ts              # 渐进增强交互（复制按钮 / 变量字重滚动，无 JS 完整可读）
  styles/global.css        # 瑞士网格 + 规格表 + 响应式 + reduced-motion 降级（颜色只引用 CSS 变量）
public/
  assets/                  # 页面实际引用的压缩素材（slot 输出）
  favicon.ico / icon-*.png / apple-touch-icon.png   # 由 icon slot 离线派生
```

## 本地化入口（Page Designer 只动这些）

- **文案**：`repochan/i18n/{zh,en}.json`；两 locale 键、类型、数组长度必须一致
  （`starter validate` 强制）。表格里的订单 ID / 规格数字是文案的一部分，随 locale 改写。
- **主题**：`repochan/site.json` 的 `theme` —— 4 桶（primary/base/ink/accents），
  `buildCssVars()` 在构建期映射为 `--ink/--paper/--rule/--accent/--muted`
  （accent 顺序即该复原顺序：rule, muted），展示层（含 global.css、组件）
  只引用这些变量，无颜色字面量；表格细分隔线用 `color-mix` 由 `--rule` 派生。
- **素材**：`repochan/assets.json` + `repochan/starter.json` 的 slot 合同；全部为 scalar
  slot（hero-cutout / footer-cutout / icon / foundation / studio-poster）。
  hero 与 footer 两张 cutout 共享同一 cutout-B matte 母版（完整入画教义：无出血裁切，
  故无需姿态线稿）。favicon 派生：
  `repochan image edit favicon public/assets/icon.webp --out public/favicon.ico --sizes 16,32,48 --overwrite`，
  再由 `image edit resize --sizes 180,192,512` 派生 apple-touch-icon.png / icon-192.png / icon-512.png。
- **动效**：`src/lib/motion.ts` 统一挂载；`prefers-reduced-motion` 下字轨 marquee 静止、
  变量字重滚动跳过（matchMedia 守卫），页面静态完整可读。
- **a11y**：section 语义 + 编号 aria 关联、复制按钮为原生 `<button>`、
  全站 `:focus-visible` accent 描边、DOC 编号 aria-hidden。

## 已知限制

- `og:image` 使用相对路径（`/assets/evidence/foundation-sheet.jpg`）；部署确定域名后应在
  `astro.config.mjs` 设 `site` 并改为绝对 URL。
- 「变量字体随滚动变字重」只对拉丁字形插值（Inter Tight variable）；中文（Noto Sans SC
  静态字重）随字体回退忽略该轴。
- hero Fig. 01 与页脚 cameo 均为同一 cutout-B 完整入画母版的派生（不同文件名服务于
  不同语义位）；下游重出 cutout 时两个 slot 可共用一张新母版。
- Evidence 两张图为既有订单结果（1024² / 1536×1024），未按 4K 重生成；展示尺寸下清晰度足够。

# 宣传机器 · Constructivist Propaganda (RepoChan Starter)

把 RepoChan 做成「创意生产的宣传机器」：七屏全幅构成主义海报墙
（总号召 / 分析 / 人设 / 设定集 / 画师 / 产物 / CTA），严格有限的红黑米色板、
斜向色带 / 圆环 / 半调网点、中英双语叠字口号；角色服务几何——完整入画 cutout
经 CSS mask 运行时剪影化，不做新裁切。zh 为默认 locale，`/en/` 为完整英文版。

- 设计稿（方向基准）：`docs/prototypes/04-constructivist-propaganda.md`

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
  references/              # 迁移参考：两张 cutout matte 母版 + 设定集/场景海报原图
  previews/                # desktop.webp / mobile.webp
src/
  pages/
    index.astro            # zh（默认 locale）
    en/index.astro         # en
  layouts/SiteLayout.astro # <head>：meta/OG/theme-color/字体/favicon + 注入主题 CSS 变量 + 动效脚本
  components/
    Masthead.astro         # 0. 页眉：字标 + 协议行 + icon + locale 切换
    Poster.astro           # 海报屏骨架（编号/口号块/拉丁叠字/小字区/命令 chip）
    PosterCall.astro       # 1. 总号召（红色斜带 + cutout A 红色剪影 + 竖排块）
    PosterAnalysis.astro   # 2. 分析（黑底 + 红描边大圆）
    PosterPersona.astro    # 3. 访谈/人设（同心圆环 + cutout B 黑色剪影）
    PosterFoundation.astro # 4. 设定集（红底 + 旋转黑方块）
    PosterPainter.astro    # 5. 画师（黑底 + 红三角）
    PosterProduct.astro    # 6. 产物（唯一蓝色点缀屏 + Fig. A/B 真实订单证据）
    PosterCta.astro        # 7. CTA（红底巨字 + 黑底命令条 + live 复制按钮）
    Progress.astro         # 底部 7 段几何进度条
    Colophon.astro         # 页脚：colophon 行 + cutout B 章印剪影
  lib/
    site.ts                # 读 repochan/{site,assets,i18n}：locale 注册表、素材路径、buildCssVars()
    i18n/types.ts          # 文案结构契约（类型只读，数据在 repochan/i18n/*.json）
    motion.ts              # 渐进增强动效（逐块砸入/斜向擦除/复制，无 JS 完整可读）
  styles/global.css        # 构成主义视觉系统 + 响应式 + reduced-motion 降级（颜色只引用 CSS 变量）
public/
  assets/                  # 页面实际引用的压缩素材（slot 输出）
  assets/evidence/         # 屏 06 证据图（foundation sheet / studio poster，JPEG）
  favicon.ico / icon-*.png / apple-touch-icon.png   # 由 icon slot 离线派生
```

## 本地化入口（Page Designer 只动这些）

- **文案**：`repochan/i18n/{zh,en}.json`；两 locale 键、类型、数组长度必须一致
  （`starter validate` 强制）。
- **主题**：`repochan/site.json` 的 `theme` —— 4 桶（primary/base/ink/accents），
  `buildCssVars()` 在构建期映射为 `--red/--black/--cream/--gray/--blue`
  （primary→red、ink→black、base→cream、accents[0]→gray、accents[1]→blue），
  展示层（含 global.css、motion.ts、各 Poster 组件）只引用这些变量，无颜色字面量。
  蓝色仅屏 06 一处点缀；改色板时保持「严格有限」的构成主义约束。
- **素材**：`repochan/assets.json` + `repochan/starter.json` 的 slot 合同（全部 scalar）。
  `symbol-cutout-a/b` 声明的是**完整入画版** cutout——红/黑剪影 + 半调网点是
  CSS `mask-image` 运行时效果，不是独立资产，下游按 slot 重出完整 cutout 即可，
  剪影化由页面自动完成。
  favicon 派生：`repochan image edit favicon public/assets/icon.webp --out public/favicon.ico --sizes 16,32,48 --overwrite`，
  再由 `image edit resize --sizes 180,192,512` 派生 apple-touch-icon.png / icon-192.png / icon-512.png。
- **动效**：`src/lib/motion.ts` 统一挂载；`prefers-reduced-motion` 下全部停用，
  海报静态叠放纵向翻阅，页面完整可读。
- **a11y**：每屏语义 section、复制按钮为原生 `<button>`、全站 `:focus-visible` 主题感知描边。

## 已知限制

- `og:image` 使用相对路径（`/assets/icon.webp`）；部署确定域名后应在
  `astro.config.mjs` 设 `site` 并改为绝对 URL。
- 屏 06 证据图（Fig. A/B）为既有订单结果的 JPEG 压缩版，未按 4K 重生成；
  展示尺寸 ≤440px，清晰度满足。
- 拉丁口号字体 Anton 仅拉丁字形；中文口号回退 Noto Sans SC 900。
- 全站刻意不设 `scroll-behavior: smooth`（硬切海报语言）。

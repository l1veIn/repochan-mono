# 反设计混乱布告板 · Anti-Design Chaos Board (RepoChan Starter)

RepoChan 的实验性皮肤（experimental skin）：故意犯规的反设计落地页——
警示胶带 / 假错误弹窗 / 五张便利贴 = 全部信息架构 / CSS 伪截图堆 /
卡死 99% 的安装窗口 CTA，真实管线资产以「错误用法」乱贴其上。
zh 为默认 locale，`/en/` 为完整英文版；自带「给我正常版」可读模式开关。

- 设计稿（方向基准）：`docs/prototypes/09-anti-design-chaos.md`

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
  layouts/SiteLayout.astro # <head>：meta/OG/theme-color/favicon + 注入主题 CSS 变量
                           #   + 「正常版」状态恢复脚本（localStorage chaos-readable）
  components/
    ChaosNav.astro         # 0. 警示胶带 marquee + 混乱导航（NEW!! 徽章 / 正常版开关）
    ChaosHero.astro        # 1. 大标题 + 复制命令 + 假 stack trace 窗口 + 旋转 cutout A + 乱飞贴纸
    StickyBoard.astro      # 2. 五张便利贴（信息架构全部）+ CSS 伪截图堆（终端/假 PR/订单 JSON）
    ChaosCta.astro         # 3. setup.exe 安装窗口（进度卡 99%）+ 复制命令 + 斜靠 cutout B
    SiteFooter.astro       # 4. 假 404 页脚 + 怀旧徽章 + locale 切换
    ErrorDialog.astro      # 5. 假系统错误弹窗（可关、可 Esc、不劫持导航）
  lib/
    site.ts                # 读 repochan/{site,assets,i18n}：locale 注册表、素材路径、buildCssVars()
    i18n/types.ts          # 文案结构契约（类型只读，数据在 repochan/i18n/*.json）
    motion.ts              # 渐进增强交互（弹窗/复制/正常版开关，无 JS 完整可读）
  styles/global.css        # 反设计视觉系统 + 可读模式（.readable）+ reduced-motion 降级
                           #   （颜色只引用 CSS 变量）
public/
  assets/                  # 页面实际引用的压缩素材（slot 输出）
  favicon.ico / icon-*.png / apple-touch-icon.png   # 由 icon slot 离线派生
```

## 本地化入口（Page Designer 只动这些）

- **文案**：`repochan/i18n/{zh,en}.json`；两 locale 键、类型、数组长度必须一致
  （`starter validate` 强制）。实验皮肤语义文案必须保留：
  `tape.items` 的 `⚠ EXPERIMENTAL SKIN` 条、`nav.readableOn`/`nav.readableOff`
  （「给我正常版」/「恢复混乱」开关）是全站实验声明与 a11y 底线，不可删。
- **主题**：`repochan/site.json` 的 `theme` —— 4 桶（primary/base/ink/accents），
  `buildCssVars()` 在构建期映射为 `--tape/--paper/--ink/--link/--linkVisited/
  --buttonFace/--win95Teal/--selectBlue/--chaosRed/--chaosGreen/--stickyYellow/
  --stickyPink/--stickyBlue`，展示层（含 global.css、motion.ts）只引用这些变量，
  无颜色字面量。
- **素材**：`repochan/assets.json` + `repochan/starter.json` 的 slot 合同；
  两张 3×3 网格（stickers / webstates）为 bundle slot，`starter asset-apply`
  按 extract-grid 自动切片为 `sticker-N.webp` / `state-N.webp`（N = 格号）。
  favicon 派生：`repochan image edit favicon public/assets/icon.webp --out public/favicon.ico --sizes 16,32,48 --overwrite`，
  再由 `image edit resize --sizes 180,192,512` 派生 apple-touch-icon.png / icon-192.png / icon-512.png。
- **伪截图堆**：StickyBoard 的终端 / 假 PR / 订单 JSON「截图」是纯 CSS/HTML
  伪窗口（需要双语 crisp 文本与键盘可读语义），不是位图资产、不在 slot 合同内；
  文案走 `board.notes[id=proof].shots`。
- **a11y**：「给我正常版」开关切换 `.readable`（去旋转/去叠层/白底黑字）；
  `prefers-reduced-motion` 下 marquee/blink 全部静止；弹窗可 Esc 关闭且焦点返还。

## 已知限制

- `og:image` 使用相对路径（`/assets/stickers/sticker-0.webp`）；部署确定域名后应在
  `astro.config.mjs` 设 `site` 并改为绝对 URL。
- 源 sticker 母图的格语义（chibi 表情）与固定 key（welcome…cozy）不完全同位；
  slot 的 key→cell 是位置替换契约，下游按模板重出网格后语义自然归位。
- 本站为实验皮肤，不应作为下游项目的默认官网脸；页头胶带与页脚均标明
  experimental。

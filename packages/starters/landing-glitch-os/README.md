# 故障桌面 · Glitch OS Desktop (RepoChan Starter)

一台正在把你的仓库渲染成人设的故障电脑：Boot Splash / 图标桌面 + 递笔 cutout /
四扇可叠窗口（伪终端分析 · 人设字段表 · 资产缩略图网格 · Foundation FILE OK）/
伪蓝屏成功弹窗 / pipeline 任务栏，全部位图均为 RepoChan 流水线真实订单产物。
zh 为默认 locale，`/en/` 为完整英文版。

- 设计稿（方向基准）：`docs/prototypes/03-glitch-os-desktop.md`

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
  references/              # 迁移参考：两张 cutout matte 母版 + 两张 3×3 母图 + foundation 原图
  previews/                # desktop.webp / mobile.webp
src/
  pages/
    index.astro            # zh（默认 locale）
    en/index.astro         # en
  layouts/SiteLayout.astro # <head>：meta/OG/theme-color/字体/favicon + 注入主题 CSS 变量
  components/
    BootSplash.astro       # 0. 开机 splash（JS-only 一次性播放，reduced-motion 不出现）
    Desktop.astro          # 1. 桌面：图标列 + 递笔 cutout A + 双标语
    Window.astro           # 窗口 chrome 元件（标题栏 / badge / 装饰按钮）
    WinAnalysis.astro      # 2. 伪终端窗口（真实订单 log）
    WinPersona.astro       # 3. 人设字段表 + cutout B RGB 错位 glitch 头像
    WinPainter.astro       # 4. sticker / webstate 缩略图网格（棋盘格衬底示透明）
    WinFoundation.astro    # 5. foundation 大图 + FILE OK 状态表
    SuccessModal.astro     # 6. 伪蓝屏 FATAL_SUCCESS.EXE（复制命令 + 仓库链接）
    Taskbar.astro          # 7. 任务栏：pipeline chips / 时钟 / 复制安装命令 / locale 切换
  lib/
    site.ts                # 读 repochan/{site,assets,i18n}：locale 注册表、素材路径、buildCssVars()
    i18n/types.ts          # 文案结构契约（类型只读，数据在 repochan/i18n/*.json）
    desktop.ts             # 渐进增强交互（boot 播放 / 图标开窗滚动 / 复制 / 时钟，无 JS 完整可读）
  styles/global.css        # Glitch OS 视觉系统 + 响应式 + reduced-motion 降级（颜色只引用 CSS 变量）
public/
  assets/                  # 页面实际引用的压缩素材（slot 输出）
  favicon.ico / icon-*.png / apple-touch-icon.png   # 由 icon slot 离线派生
```

## 本地化入口（Page Designer 只动这些）

- **文案**：`repochan/i18n/{zh,en}.json`；两 locale 键、类型、数组长度必须一致
  （`starter validate` 强制）。窗口标题里的订单 ID / 版本号是文案的一部分，随 locale 改写。
- **主题**：`repochan/site.json` 的 `theme` —— 4 桶（primary/base/ink/accents），
  `buildCssVars()` 在构建期映射为 `--crt-bg/--window/--titlebar/--window-border/--acid/
  --acid-alt/--hot/--cyan/--text/--muted/--scan`（accent 顺序即该复原顺序；
  `--scan` 为 `color-mix(in srgb, var(--text) 4%, transparent)`，等价原 rgba 白 4%），
  展示层（含 global.css、组件）只引用这些变量，无颜色字面量。
- **素材**：`repochan/assets.json` + `repochan/starter.json` 的 slot 合同；
  两张 3×3 网格（stickers / webstates）为 bundle slot，`starter asset-apply`
  按 extract-grid 自动切片为 `sticker-N.webp` / `state-N.webp`（N = 格号）。
  favicon 派生：`repochan image edit favicon public/assets/icon.webp --out public/favicon.ico --sizes 16,32,48 --overwrite`，
  再由 `image edit resize --sizes 180,192,512` 派生 apple-touch-icon.png / icon-192.png / icon-512.png。
- **动效**：`src/lib/desktop.ts` 统一挂载；`prefers-reduced-motion` 下 glitch 切片与
  文字色差层 display:none、boot splash 不播放、窗口动画跳过，页面静态完整可读。
- **a11y**：窗口即语义 section、复制按钮为原生 `<button>`、图标为锚点链接、
  全站 `:focus-visible` cyan 描边；glitch 装饰层全部 aria-hidden。

## 已知限制

- `og:image` 使用相对路径（`/assets/foundation.jpg`）；部署确定域名后应在
  `astro.config.mjs` 设 `site` 并改为绝对 URL。
- 源 sticker 母图的格语义（chibi 表情）与固定 key（welcome…cozy）不完全同位；
  slot 的 key→cell 是位置替换契约，下游按模板重出网格后语义自然归位。
- 阴影/晕影用 `color-mix` 由 `--crt-bg` 派生（近黑蓝代替纯黑），4% 扫描线由 `--text`
  派生；与原始 rgba 黑/白在暗底上视觉等价，且满足「展示层无颜色字面量」契约。
- 中文 UI 字体回退 Noto Sans SC（IBM Plex Sans/Mono 仅拉丁字形）。

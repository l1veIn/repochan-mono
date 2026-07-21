# 品牌果园 · Solarpunk Orchard (RepoChan Starter)

把 git 仓库养成一座品牌果园：日出果园 Hero（烘焙场景 + live 文本安全区）/
验土 · 育种 · 发芽 · 日照 · 采摘 · 分享六段生长叙事 / 园丁 cutout / 设定集铭牌 /
果实贴纸篮 / 分享长桌 CTA，全部视觉均为 RepoChan 流水线真实产物。
zh 为默认 locale，`/en/` 为完整英文版。

- 设计稿（方向基准）：`docs/prototypes/05-solarpunk-orchard.md`

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
  references/              # 迁移参考：Hero 场景母图 + 两张 cutout matte 母版 + 3×3 贴纸母图
  previews/                # desktop.webp / mobile.webp
src/
  pages/
    index.astro            # zh（默认 locale）
    en/index.astro         # en
  layouts/SiteLayout.astro # <head>：meta/OG/theme-color/字体/favicon + 注入主题 CSS 变量 + 动效脚本
  components/
    Nav.astro              # 0. 果园门牌导航（阶段锚点 + locale 切换）
    Hero.astro             # 1. Horizon Hero：日出果园场景（baked L1+L2）+ live 标题/命令/CTA
    SoilSample.astro       # 2. 验土 → Analysis（指标卡 + verdict）
    SeedJournal.astro      # 3. 育种 → Interview（Q&A 日记卡 + 和纸胶带角）
    Sprout.astro           # 4. 发芽 → Persona（园丁 cutout 独立 L2 + 特质卡）
    Sunframe.astro         # 5. 日照 → Foundation sheet（铭牌化展示 + points）
    Harvest.astro          # 6. 采摘 → 贴纸果实篮（9 枚 tile，圆形果盘 + hover 轻晃）
    ShareTable.astro       # 7. 分享 → Deploy CTA（命令卡 + 挥手 cutout cameo）
    GreenhouseNotes.astro  # 8. 温室页脚 + locale 切换
  lib/
    site.ts                # 读 repochan/{site,assets,i18n}：locale 注册表、素材路径、buildCssVars()
    i18n/types.ts          # 文案结构契约（类型只读，数据在 repochan/i18n/*.json）
    motion.ts              # 渐进增强动效（枝叶展开/视差/果实轻晃/复制，无 JS 完整可读）
  styles/global.css        # 日光生态视觉系统 + 响应式 + reduced-motion 降级（颜色只引用 CSS 变量）
public/
  assets/                  # 页面实际引用的压缩素材（slot 输出）
  favicon.ico / icon-*.png / apple-touch-icon.png   # 由 icon slot 离线派生
```

## 本地化入口（Page Designer 只动这些）

- **文案**：`repochan/i18n/{zh,en}.json`；两 locale 键、类型、数组长度必须一致
  （`starter validate` 强制）。
- **主题**：`repochan/site.json` 的 `theme` —— 4 桶（primary/base/ink/accents），
  `buildCssVars()` 在构建期映射为 `--paper/--ink/--leaf/--sun/--sun-soft/--leaf-deep/--moss/--moss-soft/--clay/--clay-soft/--sky/--sky-soft/--ink-soft/--pink/--violet`
  （accents 顺序即复原顺序），展示层（含 global.css、motion.ts）只引用这些变量，无颜色字面量。
- **素材**：`repochan/assets.json` + `repochan/starter.json` 的 slot 合同；
  贴纸 3×3 网格为 bundle slot，`starter asset-apply` 按 extract-grid 自动切片为
  `sticker-N.webp`（N = 格号）。Hero 场景为 baked L1+L2：重出图时必须保留
  左侧约 40% 与上方约 30% 的连续晨光 safe zone（live 标题叠加区）。
  favicon 派生：`repochan image edit favicon public/assets/icon.webp --out public/favicon.ico --sizes 16,32,48 --overwrite`，
  再由 `image edit resize --sizes 180,192,512` 派生 apple-touch-icon.png / icon-192.png / icon-512.png。
- **动效**：`src/lib/motion.ts` 统一挂载；`prefers-reduced-motion` 下全部跳过，
  页面静态完整可读（枝叶直接全展开、日轨静止、无视差）。
- **a11y**：语义 section + `aria-labelledby`、复制按钮键盘可达、全站 `:focus-visible` 描边、贴纸语义 alt 齐备。

## 已知限制

- `og:image` 使用相对路径（`/assets/hero-orchard.webp`）；部署确定域名后应在
  `astro.config.mjs` 设 `site` 并改为绝对 URL。
- 源 sticker 母图的格语义（chibi 表情）与固定 key（welcome…cozy）不完全同位；
  slot 的 key→cell 是位置替换契约，下游按模板重出网格后语义自然归位。
- Hero 场景的三层景深（远山/中树/近草）烘焙在图内，live 层只有整图缓速视差；
  重出图后无法拆层做独立 DOM 视差。
- 中文标题字体为 Noto Serif SC（Fraunces 仅拉丁字形）。

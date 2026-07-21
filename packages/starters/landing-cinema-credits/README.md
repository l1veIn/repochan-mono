# 影院片头 · Cinema Opening Credits (RepoChan Starter)

把 git 仓库放进一间黑场影院：恒定 letterbox 画框 / 出品卡 / 片名卡 / 侧光主演卡 /
上滚演职员表（multi-agent 剧组）/ 三张真资产剧照 / 灯光亮起 CTA / 片尾彩蛋，
全部视觉均为 RepoChan 流水线真实产物。zh 为默认 locale，`/en/` 为完整英文版。

- 设计稿（方向基准）：`docs/prototypes/10-cinema-opening-credits.md`

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
  references/              # 迁移参考：cutout matte 母版 + 3×3 webstates 母图
  previews/                # desktop.webp / mobile.webp
src/
  pages/
    index.astro            # zh（默认 locale）
    en/index.astro         # en
  layouts/SiteLayout.astro # <head>：meta/OG/theme-color/字体/favicon + 注入主题 CSS 变量 + 动效脚本
  components/
    StudioCard.astro       # 1. 出品卡（SUGAR RIFF PRESENTS）
    TitleCard.astro        # 2. 片名卡（纯 CSS 字标）
    Starring.astro         # 3. 主演卡：star-cutout + CSS 侧光扫过
    CreditsRoll.astro      # 4. 演职员表 46s 线性上滚窗口
    SceneStills.astro      # 5. 三张剧照（foundation / studio / poster）
    TaglineCard.astro      # 6. 一句话产品卡
    EndCard.astro          # 7. 灯光亮起：命令 + 复制 + GitHub + icon
    PostCredits.astro      # 8. 片尾彩蛋 + webstates 贴纸
  lib/
    site.ts                # 读 repochan/{site,assets,i18n}：locale 注册表、素材路径、buildCssVars()
    i18n/types.ts          # 文案结构契约（类型只读，数据在 repochan/i18n/*.json）
    motion.ts              # 渐进增强动效（reveal/上滚/复制，无 JS 完整可读）
  styles/global.css        # 影院视觉系统 + 响应式 + reduced-motion 降级（颜色只引用 CSS 变量）
public/
  assets/                  # 页面实际引用的压缩素材（slot 输出）
  favicon.ico / icon-*.png / apple-touch-icon.png   # 由 icon slot 离线派生
```

## 本地化入口（Page Designer 只动这些）

- **文案**：`repochan/i18n/{zh,en}.json`；两 locale 键、类型、数组长度必须一致
  （`starter validate` 强制）。
- **主题**：`repochan/site.json` 的 `theme` —— 4 桶（primary/base/ink/accents），
  `buildCssVars()` 在构建期映射为 `--void/--credit/--spot/--role/--dim/--end-tint`，
  展示层（含 global.css、motion.ts）只引用这些变量，无颜色字面量。
- **素材**：`repochan/assets.json` + `repochan/starter.json` 的 slot 合同；
  webstates 3×3 网格为 bundle slot，`starter asset-apply` 按 extract-grid 自动切片为
  `state-N.webp`（N = 格号，页面消费格 1 作片尾贴纸）。
  favicon 派生：`repochan image edit favicon public/assets/icon.webp --out public/favicon.ico --sizes 16,32,48 --overwrite`，
  再由 `image edit resize --sizes 180,192,512` 派生 apple-touch-icon.png / icon-192.png / icon-512.png。
- **动效**：`src/lib/motion.ts` 统一挂载；`prefers-reduced-motion` 下全部跳过，
  页面静态完整可读（reveal 直接落位、职员表展开为静态全表、侧光关闭）。
- **a11y**：语义 section + 常驻 Skip intro 锚点、复制按钮键盘可达、hreflang 互链。

## 已知限制

- `og:image` 使用相对路径（`/assets/stills/foundation.jpg`）；部署确定域名后应在
  `astro.config.mjs` 设 `site` 并改为绝对 URL。
- 源 webstates 母图的格语义与固定 key（welcome…cozy）不完全同位；
  slot 的 key→cell 是位置替换契约，下游按模板重出网格后语义自然归位。
- 字体走 Google Fonts CDN（Cinzel / Noto Serif SC / Noto Sans SC / JetBrains Mono），
  离线构建环境回退系统宋体/无衬线。
- 职员表上滚为 CSS 循环（46s），非 scrub；reduced-motion 下为静态全表。

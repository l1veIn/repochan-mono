# 资产城 · Isometric Toy City (RepoChan Starter)

把整条 RepoChan 流水线做成一座可点击的等距微缩城市：扫描塔 / 访谈咖啡 /
人设工坊 / 法典馆 / 画师棚 / 贴纸铺 / 部署码头环绕中央广场，仓库酱 chibi 在
广场巡逻——点一栋建筑，看一个阶段。建筑是纯 SVG 代码，所有缩略图、贴纸与
cutout 均为 RepoChan 流水线真实产物。zh 为默认 locale，`/en/` 为完整英文版。

- 设计稿（方向基准）：`docs/prototypes/06-isometric-toy-city.md`

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
  references/              # 迁移参考：cutout matte 母版 + 贴纸网格母图 + 设定集/两张海报原图
  previews/                # desktop.webp / mobile.webp
src/
  pages/
    index.astro            # zh（默认 locale）
    en/index.astro         # en
  layouts/SiteLayout.astro # <head>：meta/OG/theme-color/字体/favicon + 注入主题 CSS 变量 + 动效脚本
  components/
    Nav.astro              # 顶导（icon + 品牌名 + locale 切换 + GitHub）
    CityExplorer.astro     # 等距城市 SVG（纯代码积木，非资产）+ 建筑详情面板（橱窗缩略图）
    SouvenirStrip.astro    # 贴纸铺橱窗跑马灯（sticker 0–8 全员）
    Footer.astro           # 页脚 + 骑楼 cutout
  lib/
    site.ts                # 读 repochan/{site,assets,i18n}：locale 注册表、素材索引、buildCssVars()
    i18n/types.ts          # 文案结构契约（类型只读，数据在 repochan/i18n/*.json）
    motion.ts              # 渐进增强动效（地图相机/面板切换/复制，无 JS 完整可读）
  styles/global.css        # 玩具城视觉系统 + 响应式 + reduced-motion 降级（颜色只引用 CSS 变量）
public/
  assets/                  # 页面实际引用的压缩素材（slot 输出）
  favicon.ico / icon-*.png / apple-touch-icon.png   # 由 icon slot 离线派生
```

## 本地化入口（Page Designer 只动这些）

- **文案**：`repochan/i18n/{zh,en}.json`；两 locale 键、类型、数组长度必须一致
  （`starter validate` 强制）。
- **主题**：`repochan/site.json` 的 `theme` —— 4 桶（primary/base/ink/accents），
  `buildCssVars()` 在构建期映射为 `--sky/--skyTop/--ground/--road/--roadDash/--ink/--muted/--panel/--accent/--accentSoft/--building*` 共 18 个命名变量
  （sky=base、accent=primary、ink=ink，其余 15 个按 accents 数组顺序复原），
  展示层（含 global.css、CityExplorer.astro）只引用这些变量，无颜色字面量。
- **素材**：`repochan/assets.json` + `repochan/starter.json` 的 slot 合同；
  stickers 为 bundle slot，`starter asset-apply` 按 extract-grid 自动切片为
  `sticker-N.webp`（N = 格号）。`chibi-walker`（广场巡逻 chibi）是贴纸母图
  welcome 格的完整入画裁切：先经 stickers bundle 重出网格，再把 welcome 格
  按无 padding 全幅重新裁切。favicon 派生：
  `repochan image edit favicon public/assets/icon.webp --out public/favicon.ico --sizes 16,32,48 --overwrite`，
  再由 `image edit resize --sizes 180,192,512` 派生 apple-touch-icon.png / icon-192.png / icon-512.png。
- **动效**：`src/lib/motion.ts` 统一挂载；`prefers-reduced-motion` 下全部跳过，
  页面静态完整可读（面板顺序堆叠、地图静止）。
- **a11y**：语义 section + `aria-labelledby`、建筑热点为真实锚点链接、复制按钮键盘可达。

## 已知限制

- `og:image` 使用相对路径（`/assets/icon.webp`）；部署确定域名后应在
  `astro.config.mjs` 设 `site` 并改为绝对 URL。
- 源 sticker 母图的格语义（chibi 表情）与固定 key（welcome…cozy）不完全同位；
  slot 的 key→cell 是位置替换契约，下游按模板重出网格后语义自然归位。
- 等距积木城是 SVG 代码而非图像资产，不参与 slot 替换；下游换皮只改主题 token
  与文案，城市几何保留。
- 中文 display 字体回退 Noto Sans SC（M PLUS Rounded 1c 覆盖常用日文/部分汉字）。

# The Sealed Scroll (sealed-scroll)

RepoChan 自己的项目网站，原样保真整理成的创作者 Source Starter：Astro 5 静态站，`en`（`/`）+ `zh`（`/zh/`）双 locale。整页如一卷从深夜写到清晨的契约——hero 深夜工房、cta 清晨封存，baked 场景合成图 + 共享火漆戳 pattern + 贴纸 cameo 全部由 RepoChan 管线真实交付。

原始设计契约与 Gate 2 验收记录见仓库 `.repochan/web/DESIGN.md`；本目录的整理与验证证据见 `PRODUCTIZATION.md`。

## 运行

```bash
pnpm install --ignore-workspace --ignore-scripts
pnpm build      # → dist/（/、/zh/、/404.html）
pnpm dev        # 本地开发
```

## 本地化入口（Starter Localizer 只动这些）

| 文件 | 内容 |
|---|---|
| `repochan/site.json` | 项目名/描述/仓库 URL + 5 个 canonical 主题色 + 品牌母题 |
| `repochan/i18n/en.json` / `zh.json` | 页面消费的全部文本（结构完全一致） |
| `repochan/assets.json` | 当前资产状态（`source` = 原成品） |
| `repochan/starter.json` | manifest：locale、预览、asset slot、订单模板、确定性后处理 |

展示层没有任何硬编码颜色：`src/lib/site.ts` 的 `buildCssVars()` 把 `site.json` 的 5 个主题色确定性地展开成全站 token（含派生色与 rgb 通道），由 `src/layouts/Base.astro` 内联注入。

## Asset slots

`hero-composite` / `cta-composite`（带 lineart 迁移参考）、`pattern-tile`、`icon`、`sticker-cells`（3×3 bundle，`publications[]` + `extract-grid`）。详见 `repochan/starter.json` 与 `PRODUCTIZATION.md`。

## 示例与本地化验收

Brand Kit 六张卡片均保留 RepoChan 原 Source Starter 产物示例；所列 orderId 属于原项目，不能改写成目标项目的交付证明。Icon 和 pattern 示例使用独立 `gallery-source-*.webp` 原字节副本，不随目标项目槽位替换而改变。若改为目标项目真实成果，必须同步真实图片、说明与订单来源，不能只改标题或署名。四张其他 Starter 预览也继续表示原网站示例。

`starter validate --localized` 机械验收已声明的必需槽位、配置与 locale 结构，不验证全部页面文案或示例的来源真实性。尚未声明的 favicon、Apple/PWA 图标等品牌派生文件不随 icon 槽位自动更新，也不属于该机械验收。交付时说明这些文件的实际状态；不得把校验通过说成所有品牌文件都已更新。Starter Localizer 正式装配通过原子 `starter asset-apply` / `asset-import`；不要用手动 `image edit` 或改 `public/` 来绕过未声明的派生合同。

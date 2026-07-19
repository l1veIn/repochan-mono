# The Sealed Scroll (sealed-scroll)

RepoChan 自己的项目网站，原样保真整理成的创作者 Source Starter：Astro 5 静态站，`en`（`/`）+ `zh`（`/zh/`）双 locale。整页如一卷从深夜写到清晨的契约——hero 深夜工房、cta 清晨封存，baked 场景合成图 + 共享火漆戳 pattern + 贴纸 cameo 全部由 RepoChan 管线真实交付。

原始设计契约与 Gate 2 验收记录见仓库 `.repochan/web/DESIGN.md`；本目录的整理与验证证据见 `PRODUCTIZATION.md`。

## 运行

```bash
pnpm install --ignore-workspace --ignore-scripts
pnpm build      # → dist/（/、/zh/、/404.html）
pnpm dev        # 本地开发
```

## 本地化入口（Page Designer 只动这些）

| 文件 | 内容 |
|---|---|
| `repochan/site.json` | 项目名/描述/仓库 URL + 5 个 canonical 主题色 + 品牌母题 |
| `repochan/i18n/en.json` / `zh.json` | 页面消费的全部文本（结构完全一致） |
| `repochan/assets.json` | 当前资产状态（`source` = 原成品） |
| `repochan/starter.json` | manifest：locale、预览、asset slot、订单模板、确定性后处理 |

展示层没有任何硬编码颜色：`src/lib/site.ts` 的 `buildCssVars()` 把 `site.json` 的 5 个主题色确定性地展开成全站 token（含派生色与 rgb 通道），由 `src/layouts/Base.astro` 内联注入。

## Asset slots

`hero-composite` / `cta-composite`（带 lineart 迁移参考）、`pattern-tile`、`icon`、`sticker-cells`（3×3 bundle，`publications[]` + `extract-grid`）。详见 `repochan/starter.json` 与 `PRODUCTIZATION.md`。

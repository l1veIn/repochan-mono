---
name: repochan-page-designer
description: >
  项目落地页设计师。为 git 仓库组装可二次开发的 Astro/Tailwind 项目主页，
  从 analysis/README 提炼项目内容，用 persona 与已交付角色资产增强视觉，
  并通过 repochan starter 原子命令完成 scaffold、配置投影、迁移订单、图像后处理和验证。
  Use when designing landing pages, running repochan starter commands,
  or when the user asks 落地页/主页/官网/page design.
---

# RepoChan 页面设计师

为项目本身设计主页。以 analysis、README 和实际功能为内容主线；persona 和角色资产负责品牌一致性，不喧宾夺主。

只通过 `repochan` CLI 写 RepoChan 协议和 starter 数据。不要手工拼装 order，不要手工迁移 persona 字段，不要直接执行 manifest 中的 image-edit pipeline，也不要修改 starter 源目录。

## 工作流

### 1. 选择并拉取 starter

```bash
repochan analysis get --json
repochan persona get --json
repochan starter list
repochan starter get <id> --json
repochan starter pull --starter <id>
```

- 用户在场时，让用户基于 starter 的结构和资产需求选择。
- yolo 模式使用标记为 `(default)` 的 starter。
- 默认实例目录是 `.repochan/web-starter/`。已存在时先检查，除非用户明确同意，否则不要传 `--overwrite`。
- 实例自己的 `repochan/starter.json` 是后续命令的唯一 manifest；不要回读或编辑 source starter。

### 2. 投影确定性配置

```bash
repochan starter configure
```

该命令把 analysis/persona 中已有的项目名、仓库地址、配色和品牌字段写入实例的 `repochan/site.json`。不要再手改 `src/lib/site.ts`；它只是稳定读取器。

### 3. 创作 locale 内容

读取实例的 `repochan/starter.json`，按 `content.requiredPaths` 为所有 supported locale 创作文案。Hero headline 必须表达项目价值，不能退化成角色口号。

把一个或多个 locale envelope 写入临时 JSON，然后交给 CLI 校验并落盘：

```bash
repochan starter configure --content-file /tmp/repochan-content.json --overwrite
```

字段来源和文案规则见 [data-mapping.md](references/data-mapping.md) 与 [copy-and-structure.md](references/copy-and-structure.md)。

### 4. 补齐视觉资产

检查 `repochan/assets.json` 和 manifest 的 asset slots。默认资产可作为可运行 fallback；只有项目需要定制且没有可复用 delivered order 时才创建订单。

```bash
repochan order list --json
repochan starter create-order <slot> \
  --intent "<该资产如何表达项目与页面构图>" \
  --foundation <foundation-order-id>
repochan order set-status <order-id> approved
```

`starter create-order` 负责 orderId、partial order 合并、reference 物化和 acceptance criteria。Agent 只提供项目特定 intent、选择 foundation，并审核生成的 order。

让 Painter 按正常流程交付原图。不要要求 Painter 处理网站派生文件。

### 5. 应用交付资产

```bash
repochan starter asset-apply <slot> --order <delivered-order-id> --overwrite
```

该命令读取实例 manifest，执行完整 postprocess，写入站点 `public/`，并同步 `repochan/assets.json` 的 `src/status/orderId/versionId`。不要手工运行其中的 compress/slice/bg-remove 等步骤。

资产规则与失败边界见 [phase2-assemble.md](references/phase2-assemble.md)。

### 6. 验证、构建与视觉检查

```bash
repochan starter validate --output-dir .repochan/web-starter
pnpm --dir .repochan/web-starter install
pnpm --dir .repochan/web-starter build
```

`starter validate` 统一检查 manifest/config/content、资产状态、templateId、文件存在性和展示层硬编码颜色。修复错误后再构建；最后在浏览器检查桌面、移动端、交互、可读性与溢出。

展示层禁止颜色字面量。颜色只允许集中在 `repochan/site.json` 的 `theme` 中；组件只能消费 CSS variables、`currentColor`、`transparent`、`inherit` 和基于 token 的派生颜色。

## 完成标准

- 页面准确解释项目是什么、为谁服务、为何值得使用。
- `repochan/site.json`、`assets.json`、`i18n/` 是所有项目特定数据的集中入口。
- 所有 required slots 和 locale requirements 通过 `starter validate`。
- 项目可独立安装、构建并继续二次开发。
- 派生网站资产只在实例 `public/`，不回灌 `.repochan/orders/`。

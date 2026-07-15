---
name: repochan-page-designer
description: >
  RepoChan Starter 本地化与装配工程师。为 git 项目选择并 pull 已设计好的 starter，
  投影项目配置、创作 locale 文案、创建并应用 slot 资产、执行验证与构建。
  Use when localizing or assembling an existing starter, running repochan starter commands,
  or adapting project content and delivered assets without changing the site design.
---

# RepoChan Starter 本地化与装配工程师

把现有 starter 应用到具体项目，不负责原创网页设计。不得新增 section、改变信息架构、重做艺术方向或改写 starter 的核心 composition；如果没有合适 starter，或用户要求这些变化，转交 `repochan-web-designer`。

只通过 `repochan` CLI 写 RepoChan 协议与 starter 实例数据。不要手工拼 order、迁移 persona 字段、执行 manifest 内部后处理，也不要修改 `packages/starters/`。

## 工作流

### 1. 选择并拉取 starter

```bash
repochan analysis get --json
repochan persona get --json
repochan starter list
repochan starter get <id> --json
repochan starter pull --starter <id>
```

先从 `starter get` 返回的 `capabilities.sections[]` / `transitions[]` 确认 section、内容容量、composition、响应式与动效是否匹配。若显示 `sections: undeclared`，把它视为旧合同并检查 manifest；不得猜测其能力。当前实例没有 section mutation：不得删除任何已声明 section，`required` 只用于匹配提示，不是删除授权。若必须新增/删除 section、改变主要视觉关系或动效叙事才能适配，停止本地化并转 `repochan-web-designer`。

默认实例目录是 `.repochan/web-starter/`。已存在时先检查；未获明确授权不要 `--overwrite`。实例 `repochan/starter.json` 是后续命令的唯一 manifest。

### 2. 投影确定性配置

```bash
repochan starter configure
```

该命令把 analysis/persona 中已有字段写入实例 `repochan/site.json`。不要手改 `src/lib/site.ts`；它只是稳定读取器。

### 3. 创作 locale 内容

按 manifest 的 `content.requiredPaths` 为所有 supported locale 创作文案。只填充既有 section 的内容职责，不借本地化改造信息架构。

```bash
repochan starter configure --content-file /tmp/repochan-content.json --overwrite
```

字段来源和文案规则见 [data-mapping.md](references/data-mapping.md) 与 [copy-and-structure.md](references/copy-and-structure.md)。

### 4. 补齐并应用 slot 资产

先检查 `repochan/assets.json` 与 manifest slots；fallback 仅保证可运行，不等于完成定制。

```bash
repochan order list --json
repochan starter create-order <slot> --intent "<项目特定意图>" --foundation <foundation-order-id>
repochan order set-status <order-id> approved
repochan starter asset-apply <slot> --order <delivered-order-id> --overwrite
```

`create-order` 负责机械字段与引用；Painter 交付原图；`asset-apply` 执行 manifest 声明的后处理并同步资产状态。不要手工运行 compress/slice/bg-remove 来拼出半完成实例。

对于仓库截图、真实产品证明等已经是最终格式的本地文件，使用 `repochan starter asset-import <slot> --file <path> --overwrite`；它只接受普通单输出 slot、要求扩展名与 `output` 一致，并记录 SHA-256 来源。不要把真实 proof 伪造成生成订单。

若 starter 声明 3×3/4×4 uniform-matte 角色网格，cell 语义、`publications[]` 与 fallback 必须来自 manifest，并由 `asset-apply` 的 `extract-grid` 完成确定性切分、chroma、alpha QA、normalize 与原子投影。不得手工切格、逐项改 `assets.json` 或伪造 ready；若旧实例没有该合同，使用其 fallback 或报告 source starter 缺陷。

完整边界见 [phase2-assemble.md](references/phase2-assemble.md)。

### 5. 验证、构建与检查

```bash
repochan starter validate --output-dir .repochan/web-starter
pnpm --dir .repochan/web-starter install --ignore-workspace --ignore-scripts
pnpm --dir .repochan/web-starter build
```

最后检查桌面/移动、locale、键盘、可读性、裁切、overflow 和 reduced-motion。只修复内容、配置、资产映射及明确暴露的本地化参数；设计结构问题转回 Web Designer，source starter 缺陷报告给 Starter Designer。

## 完成标准

- 项目内容和资产完整映射到 starter 既有合同，未偷偷改变设计。
- `repochan/site.json`、`assets.json`、`i18n/` 是项目特定数据入口。
- required slots、locale requirements、validate 与 build 全部通过。
- 派生资产只在实例 `public/`，不回灌 `.repochan/orders/`。
- 不适配问题已转给正确角色，而不是由本地化工程师临场重做页面。

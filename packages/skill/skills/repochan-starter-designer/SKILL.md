---
name: repochan-starter-designer
description: >
  RepoChan Starter 产品化工程师。把已通过 Gate 2 的具体项目网站脱模、参数化并转化为
  可复用、可本地化、可验证的 Astro/Tailwind source starter。
  Use when productizing an approved implemented page into packages/starters,
  standardizing a starter manifest, defining slots and fallbacks, or maintaining source starters.
---

# RepoChan Starter 产品化工程师

把获批网站变成模具，不重新设计网站。输入必须是 Web Designer 交付的 Gate-2-approved implemented page；输出是 `packages/starters/<id>/` 下可复用的 source starter。

你是唯一允许写 `packages/starters/` 的 skill。不要修改具体项目 `.repochan/web-starter/` 来冒充 source starter，也不要手工写 `.repochan/` 协议状态。

## 工作流

### 1. 验证产品化输入

按 [approved-page-contract.md](references/approved-page-contract.md) 检查 Gate 1/2 结论、可运行源码、section provenance、bake masks、资产来源、transition contracts、responsive 证据和已知限制。

缺少 Gate 2、关键 section 仍未实现，或艺术方向仍在变动时，退回 `repochan-web-designer`；不要在产品化阶段补设计。

### 2. 脱模与参数化

保留已批准的结构和视觉关系，移除原项目身份。把以下内容聚合到 starter 稳定入口：

- 文本与 locale requirements → `repochan/i18n/`
- palette/theme → `repochan/site.json`
- 资产路径与状态 → `repochan/assets.json`
- section capabilities、transitions、slots、fallback、postprocess、required paths → `repochan/starter.json`

组件只消费配置、CSS variables 和稳定 asset keys。不得保留项目名、仓库 URL、硬编码颜色、散落文案或原角色身份。

### 3. 固化可迁移合同

在 manifest 的 `capabilities.sections[]` 固化每个 section 的 composition recipe、baked/live layers、canonical viewport、safe zones、responsive behavior、design provenance 类型、asset slots 与 motion；在 `capabilities.transitions[]` 按页面顺序声明每对相邻 section。将具体 order/version 脱敏为 slot 与迁移要求；保留 fallback，确保 pull 后立即可构建。旧 manifest 缺少 `capabilities` 时可以读取，但不得作为新的多 section 产品化交付。

角色网格通过一个 asset slot 声明 rows/columns、uniform matte、cell 语义、`publications[]`、尺寸、fallback 与独占的 `extract-grid` postprocess。`asset-apply` 必须一次完成切格、chroma、alpha QA、normalize、具名 PNG 投影与资产状态更新；不得让 agent 手工切格后拼协议状态。

### 4. 验证 source starter

按 [productization-checklist.md](references/productization-checklist.md) 检查项目身份泄漏、配置集中度、slot/fallback、locale、响应式、可访问性与可复用性，然后运行：

```bash
repochan starter validate <id>
pnpm --dir packages/starters/<id> build
```

CLI 尚未覆盖的确定性检查必须如实记录，不得用人工结论伪装 schema 通过。待产品能力归属见 [capability-gaps.md](references/capability-gaps.md)。

## 完成标准

- 输入有可审计的 Gate 2 批准；未在产品化阶段重做艺术方向或新增 section。
- source starter 不含原项目/角色身份，pull 后有 fallback 且立即可构建。
- 文本、颜色、资产和 manifest 高度聚合，页面代码无项目特定硬编码。
- composition、slot、locale、responsive 与 postprocess 合同清晰可迁移。
- `starter validate` 与 build 通过；未实现的自动化能力被明确标记为 gap。

## References

- [approved-page-contract.md](references/approved-page-contract.md)：Gate 2 输入合同。
- [productization-checklist.md](references/productization-checklist.md)：脱模与验收清单。
- [capability-gaps.md](references/capability-gaps.md)：Core/CLI/模板能力归属。

---
name: repochan-protocol
description: ".repochan 工作区协议详细规范，涵盖分析、人设、任务、任务结果版本及安全更新规则。"
---

# `.repochan/` 协议

## 角色定义

你是协议管家。确保 RepoChan 状态是持久、可检查、可版本化、可安全修订的。每当创建、验证、迁移或解释 `.repochan/` 产物时，都应使用此 skill。

## 执行前检查

1. 检查 `.repochan/` 是否存在。
2. 列出已知产物和 schema 版本。
3. 检测所请求角色缺少的上游产物。
4. 破坏性操作前询问确认。
5. 优先增量、版本化写入。

## 目录布局

```text
.repochan/
  analysis/
    current.json
    versions/
  interview/                〔可选〕
    current.json
    versions/
  persona/
    current.json
    versions/
    reviews/                〔可选〕persona 评审反馈
      current.json
      versions/
    candidates/             〔可选〕并行人设候选草案
      <slug>.json
  orders/
    <order-id>/
      order.json
      versions/
        <version-id>/
          meta.json
          hero.png
      reviews/              〔可选〕该 order 的按版本评审
        <version-id>.json
        versions/
  pages/                    〔可选〕
    current.json
    versions/
    site/                   渲染产物（index.html + assets/）
```

`order.json` 包含完整的任务数据、`status` 和 `currentVersion`。结果文件直接保存在所选任务的 `versions/<version-id>/` 目录中。`interview/` 和 `pages/` 是可选产物——只有用户运行相应角色时才会创建。`reviews/` 在首次评审时自动创建。

**version 的 role 字段**：每个 order result version 在 `meta.json` 和 `order.json > orderAsset.versions[]` 中有一个可选的 `role` 字段：
- `current` — 当前选定的版本（`currentVersion` 指向它），任何时刻只有一个
- `candidate` — 并存的候选草稿，未被 promote，不改变 order 状态
- `snapshot` — 被 promote 取代的前任 current，已退役

旧数据无 `role` 字段时按 `current` 处理。

## 产物依赖

- 分析没有上游 `.repochan/` 依赖。
- 访谈是可选前置环节，需要分析。
- 人设需要分析（可选消费访谈）。
- 任务需要分析和人设。
- Painter 交付需要分析、人设、和一个已批准/进行中的任务。
- 修订应作为新任务，引用先前的任务/结果，并说明请求的差异。
- 页面需要分析，可选引用已交付的 order 结果作为素材。

## 安全写入规则

- 不要在未经用户批准的情况下覆盖。
- 将当前 JSON 文件归档到附近的 `versions/` 路径后再替换。
- 尽可能添加时间戳、`schemaVersion`、和 provenance（来源）字段。
- 尽可能保留用户修订请求的原文。
- 大型二进制输出存储在任务结果版本文件夹中；`meta.json` 引用它们。

## 最小 schema

### 分析

```json
{ "schemaVersion": "repochan.analysis.v1", "repo": {}, "summary": "", "creativeSignals": {} }
```

### 人设

```json
{ "schemaVersion": "repochan.persona.v1", "coreConcept": "", "visualIdentity": {}, "usageGuidelines": {} }
```

### 访谈（可选）

```json
{
  "schemaVersion": "repochan.interview.v1",
  "summary": "用户意图的一段话总结",
  "keyConstraints": ["硬约束——下游必须遵守"],
  "preferences": ["软偏好——尽量满足"],
  "avoidList": ["用户明确不想要的"],
  "questions": [{ "id": "q1", "question": "...", "category": "tone", "rationale": "...", "optional": false }],
  "responses": [{ "questionId": "q1", "kind": "option", "answer": "..." }]
}
```

### 创作任务

重要字段：

- `orderId`
- `requestType`
- `status`
- `currentVersion`
- `assetType`
- `brief.intent`
- `brief.mustInclude`
- `brief.avoid`
- `brief.creativeFreedom`
- `deliverables`
- `acceptanceCriteria`

### 任务结果版本

```json
{
  "versionId": "v2026-06-12-001",
  "createdAt": "ISO-8601",
  "tool": "图像包、原生模型能力、或用户提供的",
  "files": ["hero.png"],
  "promptBrief": "简短的生成摘要",
  "generationPrompt": "发送给图像生成工具的完整精确 prompt",
  "revisedPrompt": "供应商修订后的 prompt（如有返回）",
  "notes": "",
  "provenance": { "tool": "repochan", "action": "order.create_result" }
}
```

### 页面（可选）

```json
{
  "title": "项目名",
  "description": "一句话项目描述",
  "theme": { "primary": "#3B82F6", "secondary": "...", "accent": "...", "background": "...", "style": "modern" },
  "sections": [
    { "type": "navbar", "variant": "simple", "content": { "brand": "..." } },
    { "type": "hero", "variant": "centered", "content": { "headline": "...", "subheadline": "...", "primaryCta": { "label": "...", "href": "..." } } }
  ]
}
```

section 的 `type` × `variant` 组合由 `@repochan/page-renderer` 的模板表定义（navbar/hero/features/stats/gallery/cta/footer，共 7 类 20 个变体）。图片通过 `AssetRef`（`orderId + file + versionId?`）引用已交付的 order 结果，渲染前由 `page.check_assets` 校验是否存在。

### Order 评审（可选）

针对某个 order result version 的事后评审，存放在 `orders/<orderId>/reviews/<versionId>.json`：

```json
{
  "orderId": "ord-foundation-001",
  "versionId": "v1",
  "verdict": "pass",                    // pass | revise | reject
  "criteriaResults": [                  // 可选：逐条对照 acceptanceCriteria
    { "criterion": "角色可识别", "passed": true }
  ],
  "notes": "Looks good.",
  "reviewerRole": "art-director",
  "schemaVersion": "repochan.review.v1"
}
```

评审是**非阻塞的**——在交付之后创建，从不阻塞交付。`verdict=revise/reject` 会把 `delivered` 状态的 order 推回 `needs_revision`（追加一条 revision 记录）；其他状态不受影响。

### Persona 评审（可选）

针对当前 persona 的反馈，存放在 `persona/reviews/current.json`：

```json
{
  "verdict": "revise",                  // pass | revise（无 reject——persona 没有"交付物"概念）
  "notes": "角色再成熟一些",
  "reviewerRole": "user",
  "schemaVersion": "repochan.persona-review.v1"
}
```

persona 没有状态机——`verdict=revise` 不触发状态流转，纯粹是 creative team 读取后主动重做的反馈记录。

### 候选态 version role

order result version 的 `role` 字段（见上方目录布局说明）区分三种角色：

- `order.create_candidate` — 写入 `role=candidate` 的 version，不 promote、不交付
- `order.promote_candidate` — 把 candidate 提升为 current，原 current 降为 snapshot
- `order.create_result` — 正常交付，version 默认无 role（视为 current）

## 示例预检响应

"`.repochan/analysis/current.json` 存在，persona 当前文件也存在。有三个草稿任务和一个已交付的 README 主视觉结果。对于新插画，我可以创建新任务；对于主视觉的修改，我应该创建修订任务。你倾向哪个？"

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
  persona/
    current.json
    versions/
  orders/
    <order-id>/
      order.json
      versions/
        <version-id>/
          meta.json
          hero.png
```

`order.json` 包含完整的任务数据、`status` 和 `currentVersion`。结果文件直接保存在所选任务的 `versions/<version-id>/` 目录中。

## 产物依赖

- 分析没有上游 `.repochan/` 依赖。
- 人设需要分析。
- 任务需要分析和人设。
- Painter 交付需要分析、人设、和一个已批准/进行中的任务。
- 修订应作为新任务，引用先前的任务/结果，并说明请求的差异。

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

## 示例预检响应

"`.repochan/analysis/current.json` 存在，persona 当前文件也存在。有三个草稿任务和一个已交付的 README 主视觉结果。对于新插画，我可以创建新任务；对于主视觉的修改，我应该创建修订任务。你倾向哪个？"

# 任务 JSON 示例

## 设定集任务示例

```json
{
  "orderId": "ord-foundation-001",
  "status": "approved",
  "requestType": "new_asset",
  "assetType": "foundation_sheet",
  "templateId": "official/foundation-sheet",
  "references": [],
  "brief": {
    "intent": "创建项目的视觉锚点：一张角色设定图。",
    "mustInclude": ["全身签名姿势", "Q版形象", "3-4个表情头像", "配色卡色块"],
    "avoid": ["复杂背景", "文字标注"],
    "creativeFreedom": ["选择表情组合", "在设定图上排列元素"]
  },
  "deliverables": [{ "name": "foundation_sheet", "format": "png", "width": 1024, "height": 1024 }]
}
```

> yolo 示例写 `"status": "approved"`。非 yolo 可省略 status（默认 draft）或显式 `"draft"`。


## 带引用的下游任务示例

```json
{
  "orderId": "ord-readme-hero-001",
  "status": "approved",
  "requestType": "new_asset",
  "assetType": "readme_banner",
  "templateId": "official/readme-banner-21x9",
  "references": [{ "orderId": "ord-foundation-001", "role": "character" }],
  "brief": {
    "intent": "将项目人设呈现为一位能干的工作室向导，面向开发者。",
    "mustInclude": ["角色核心剪影", "仓库品牌配色"],
    "avoid": ["字面意义上的代码雨", "复杂的UI截图"]
  }
}
```

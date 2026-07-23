# Order JSON Examples

## Foundation Sheet Order Example

```json
{
  "orderId": "ord-foundation-001",
  "status": "approved",
  "requestType": "new_asset",
  "assetType": "foundation_sheet",
  "templateId": "official/foundation-sheet",
  "references": [],
  "brief": {
    "intent": "Create the project's visual anchor: a character reference sheet.",
    "mustInclude": ["Full-body signature pose", "Chibi", "3-4 expression avatars", "Color palette swatches"],
    "avoid": ["Complex backgrounds", "Text annotations"],
    "creativeFreedom": ["Choosing expression combinations", "Arranging elements on the reference sheet"]
  },
  "deliverables": [{ "name": "foundation_sheet", "format": "png", "width": 1024, "height": 1024 }]
}
```

> The yolo example writes `"status": "approved"`. Non-yolo can omit status (defaults to draft) or explicitly set `"draft"`.


## Downstream Order with References Example

```json
{
  "orderId": "ord-readme-hero-001",
  "status": "approved",
  "requestType": "new_asset",
  "assetType": "readme_banner",
  "templateId": "official/readme-banner-21x9",
  "references": [{ "type": "order", "orderId": "ord-foundation-001", "role": "character" }],
  "brief": {
    "intent": "Present the project persona as a capable studio guide, oriented toward developers.",
    "mustInclude": ["Character's core silhouette", "Repo brand colors"],
    "avoid": ["Literal code rain (Matrix-style)", "Complex UI screenshots"]
  }
}
```

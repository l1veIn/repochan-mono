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
    "mustInclude": ["Full-body signature pose", "Chibi", "3-4 expression avatars", "Color palette swatches", "Readable character, palette, and motif labels required by the template"],
    "avoid": ["Complex backgrounds", "Illegible or excessive text beyond the template's labels"],
    "creativeFreedom": ["Choosing expression combinations", "Arranging elements on the reference sheet"]
  },
  "deliverables": [{ "name": "foundation_sheet", "format": "png", "width": 1024, "height": 1024 }]
}
```

> This example assumes the user's request/checkpoint already authorized execution. Explicit yolo accepts defaults within that scope. Otherwise omit status (defaults to draft); CI alone grants no approval. Required references must be complete before approving.


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

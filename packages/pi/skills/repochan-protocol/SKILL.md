---
name: repochan-protocol
description: Detailed .repochan workspace protocol specification for RepoChan artifacts, including analysis, persona, orders, assets, versions, manifests, and safe update rules.
---

# `.repochan/` Protocol

## Role definition

You are the Protocol Steward. Ensure RepoChan state is durable, inspectable, versioned, and safe to revise. Use this skill whenever creating, validating, migrating, or explaining `.repochan/` artifacts.

## Pre-execution checks

1. Inspect whether `.repochan/` exists.
2. List known artifacts and schema versions.
3. Detect missing upstream artifacts for the requested role.
4. Ask before destructive changes.
5. Prefer additive migration and versioned writes.

## Directory layout

```text
.repochan/
  analysis.json
  analysis.versions/
  persona/
    current.json
    versions/
  orders/
    <order-id>.json
    batches/
  assets/
    <asset-id>/
      manifest.json
      current/
      versions/
        <version-id>/
  notes/
  brand-kit/
    manifest.json
```

`brand-kit/manifest.json` may aggregate selected current assets for external use.

## Artifact dependencies

- Analysis has no upstream `.repochan/` dependency.
- Persona requires analysis.
- Orders require analysis and persona.
- Painter delivery requires analysis, persona, and an order.
- Revisions require a referenced order or asset.

## Safe write rules

- Do not overwrite without user approval.
- Archive current files into `versions/` before replacement.
- Add `generatedAt`, `schemaVersion`, and provenance fields.
- Keep user revision requests verbatim where practical.
- Store large binary assets under asset version folders; JSON manifests reference them.

## Minimal schemas

### Analysis

```json
{ "schemaVersion": "repochan.analysis.v1", "repo": {}, "summary": "", "creativeSignals": {} }
```

### Persona

```json
{ "schemaVersion": "repochan.persona.v1", "coreConcept": "", "visualIdentity": {}, "usageGuidelines": {} }
```

### Asset Order

See `schemas/asset-order.schema.json`. Important fields:

- `orderId`
- `requestType`
- `status`
- `assetType`
- `brief.intent`
- `brief.mustInclude`
- `brief.avoid`
- `brief.creativeFreedom`
- `deliverables`
- `acceptanceCriteria`

### Asset manifest

```json
{
  "schemaVersion": "repochan.asset-manifest.v1",
  "assetId": "asset-readme-hero",
  "currentVersion": "v2026-06-12-001",
  "orderIds": ["ord-readme-hero-001"],
  "versions": [
    {
      "versionId": "v2026-06-12-001",
      "createdAt": "ISO-8601",
      "tool": "image package or API",
      "files": ["versions/v2026-06-12-001/hero.png"],
      "promptBrief": "professional brief used for generation",
      "notes": ""
    }
  ]
}
```

## Example pre-flight response

“`.repochan/analysis.json` exists and persona current exists. There are three draft orders and one delivered README hero. For a new illustration I can create a new order; for changes to the hero I should create a revision order. Which do you prefer?”

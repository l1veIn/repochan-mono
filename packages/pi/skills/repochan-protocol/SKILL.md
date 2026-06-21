---
name: repochan-protocol
description: Detailed .repochan workspace protocol specification for RepoChan artifacts, including analysis, persona, orders, order result versions, and safe update rules.
---

# `.repochan/` Protocol

## Role definition

You are the Protocol Steward. Ensure RepoChan state is durable, inspectable, versioned, and safe to revise. Use this skill whenever creating, validating, migrating, or explaining `.repochan/` artifacts.

## Pre-execution checks

1. Inspect whether `.repochan/` exists.
2. List known artifacts and schema versions.
3. Detect missing upstream artifacts for the requested role.
4. Ask before destructive changes.
5. Prefer additive, versioned writes.

## Directory layout

```text
.repochan/
  analysis.json
  analysis.versions/
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

`order.json` contains the full order data, `status`, and `currentVersion`. Result files live directly inside the selected order's `versions/<version-id>/` directory.

## Artifact dependencies

- Analysis has no upstream `.repochan/` dependency.
- Persona requires analysis.
- Orders require analysis and persona.
- Painter delivery requires analysis, persona, and an approved/in_progress order.
- Revisions should be new orders that reference the prior order/result and explain the requested delta.

## Safe write rules

- Do not overwrite without user approval.
- Archive current JSON files into a nearby `versions/` path before replacement.
- Add timestamps, `schemaVersion`, and provenance fields where practical.
- Keep user revision requests verbatim where practical.
- Store large binary outputs under order result version folders; `meta.json` references them.

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

Important fields:

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

### Order result version

```json
{
  "versionId": "v2026-06-12-001",
  "createdAt": "ISO-8601",
  "tool": "image package, native model capability, or user-provided",
  "files": ["hero.png"],
  "promptBrief": "professional brief used for generation",
  "notes": "",
  "provenance": { "tool": "repochan", "action": "order.create_result" }
}
```

## Example pre-flight response

“`.repochan/analysis.json` exists and persona current exists. There are three draft orders and one delivered README hero result. For a new illustration I can create a new order; for changes to the hero I should create a revision order. Which do you prefer?”

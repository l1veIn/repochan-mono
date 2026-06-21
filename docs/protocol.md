# `.repochan/` Protocol

`.repochan/` is RepoChan's durable workspace contract. CLI, Pi skills, future dashboards, and external tools should read and write through `@repochan/core` or the unified Pi `repochan` tool whenever possible.

## Layout

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
    batches/
```

## Artifacts

- `analysis.json` uses `schemaVersion: "repochan.analysis.v1"` and is the upstream baseline for every creative role.
- `persona/current.json` uses `schemaVersion: "repochan.persona.v1"` and requires analysis.
- `orders/<order-id>/order.json` uses `schemaVersion: "repochan.asset-order.v1"`, contains status and `currentVersion`, and owns its result versions. Order IDs must match `ord-[a-z0-9][a-z0-9-]*`.
- `orders/<order-id>/versions/<version-id>/meta.json` describes a delivered result version. Image/artifact files live directly in that version directory.

## Workflow Rules

- Persona requires analysis.
- Orders require analysis and persona.
- Order result versions require analysis, persona, and an approved or in-progress order unless the user explicitly allows an exception.
- Painter delivery creates an order result version and updates `order.json.currentVersion`.
- Mutating current artifacts should archive previous JSON state where core helpers support it.
- Overwrites, destructive updates, order status changes, and changing current order result versions require explicit user approval in agent workflows.

## Validation

Use:

```bash
repochan validate
repochan validate --json
```

or `validateProtocol(projectRoot)` from `@repochan/core`.

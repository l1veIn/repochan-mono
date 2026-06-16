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
    <order-id>.json
    batches/
    versions/<order-id>/
  assets/
    <asset-id>/
      manifest.json
      versions/<version-id>/meta.json
      manifest.versions/
  notes/
  brand-kit/
```

## Artifacts

- `analysis.json` uses `schemaVersion: "repochan.analysis.v1"` and is the upstream baseline for every creative role.
- `persona/current.json` uses `schemaVersion: "repochan.persona.v1"` and requires analysis.
- `orders/<order-id>.json` uses `schemaVersion: "repochan.asset-order.v1"`. Order IDs must match `ord-[a-z0-9][a-z0-9-]*`.
- `assets/<asset-id>/manifest.json` uses `schemaVersion: "repochan.asset-manifest.v1"`. Asset IDs must match `[a-z0-9][a-z0-9-]*`.

## Workflow Rules

- Persona requires analysis.
- Orders require analysis and persona.
- Asset versions require analysis and persona.
- Painter delivery should reference approved or in-progress orders unless the user explicitly allows an exception.
- Mutating current artifacts should archive previous state where core helpers support it.
- Overwrites, destructive updates, order status changes, and changing current asset versions require explicit user approval in agent workflows.

## Validation

Use:

```bash
repochan validate
repochan validate --json
```

or `validateProtocol(projectRoot)` from `@repochan/core`.

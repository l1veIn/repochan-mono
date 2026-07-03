# @repochan/core

Pure TypeScript primitives for the RepoChan `.repochan/` protocol. The deterministic backbone shared by `pi`, `page-renderer`, and `cli`.

Core has **no Pi runtime dependency**. APIs take `projectRoot: string` or plain JSON data and preserve the existing on-disk format used by the public `repochan` Pi tool. See the monorepo [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for how core fits into the three-layer design.

## Three-layer design

Core implements three orthogonal layers. Each layer is independently testable and has no Pi dependency.

```
┌─────────────────────────────────────────────┐
│  Business Rules  entities.ts                  │  state machine, dependency gates, approval gates
├─────────────────────────────────────────────┤
│  Protocol        protocol/index.ts            │  current.json + versions/, safe paths, require*()
├─────────────────────────────────────────────┤
│  Schema          schemas/index.ts             │  artifact shapes, params gates, WriteOpSchemas
└─────────────────────────────────────────────┘
```

**Principle**: anything that can be formalized as a deterministic constraint lives here, not in a prompt. Schemas are gates (they validate the params core actively reads), not mirrors of entities — business rules run after `validateInput` passes.

## What core owns

### Schema layer — `src/schemas/index.ts`

Artifact shapes (what gets written to `.repochan/`):

- `PersonaArtifactSchema`, `InterviewArtifactSchema`, `OrderResultVersionSchema`, `PageArtifactSchema`, `AnalysisArtifactSchema`
- Each carries `schemaVersion`, `generatedAt`, `provenance`.

Write-operation params gates (what the agent passes in):

- `PersonaCreateParamsSchema` / `PersonaUpdateParamsSchema`
- `InterviewCreateParamsSchema` / `InterviewAppendParamsSchema`
- `OrderCreateParamsSchema` / `OrderUpdateParamsSchema` / `OrderSetStatusParamsSchema` / `OrderAddRevisionParamsSchema` / `OrderCreateResultParamsSchema` / `OrderSetCurrentResultParamsSchema`
- `AnalysisRunParamsSchema` / `AnalysisUpdateParamsSchema`
- `PageCreateParamsSchema`

Registry: `WriteOpSchemas` maps every action name to its params schema. `validate.ts` exposes `validateInput(action, schema, params)` — the single gate called at the top of every write operation.

### Protocol layer — `src/protocol/index.ts`

- `PROTOCOL_DIR` (`.repochan`), `protocolRoot`, `safeProtocolPath` (path-traversal guard), `stripProtocolPrefix`.
- `writeJson(file, data, overwrite)` — refuses to overwrite without `overwrite=true`.
- `readJson` / `readJsonIfExists` / `exists` / `listJsonFiles`.
- `initProtocol(projectRoot)` — creates the standard directory layout.
- `inspectProtocol(projectRoot)` — returns a summary of all artifacts and versions.
- Versioning: `stamp`, `stampForPath`, `protocolVersionPath` (maps `xxx/current.json` → `xxx/versions/<ts>.json`).
- Order-specific path helpers: `orderDir`, `orderJsonPath`, `orderVersionsDir`, `orderVersionDir`.
- **Dependency gates**: `requireAnalysis`, `requirePersona`, `requireInterview`, `requirePage` (plus non-throwing `hasInterview`, `hasPage`).

### Business rules layer — `src/entities.ts`

Entity operations that compose schema + protocol + workflow rules:

- **Persona**: `createPersona`, `updatePersona`.
- **Interview**: `createInterview`, `appendInterview`.
- **Orders**: `createOrder`, `updateOrder`, `setOrderStatus`, `addRevision`, `createOrderResult`, `setCurrentResult`, `listOrders`, `getOrder`, `listOrderResults`, `getOrderResult`.
- **Pages**: `createPage`, `getPage`.
- **State machine**: `OrderStatusSchema` (6 states), `ORDER_STATUSES`, `isValidStatusTransition`, `validNextStatuses`, `requireValidStatus`. `setOrderStatus` rejects illegal transitions (e.g. `delivered → draft`).
- **Approval gate**: `ensureOrderApprovedForExecution` / `areOrdersApprovedForExecution` — `createOrderResult` requires the order to be `approved`/`in_progress` (escape hatch: `allowUnapprovedOrder=true`).
- **Asset resolution**: `collectAssetRefs`, `checkPageAssets` — resolves `AssetRef`s to concrete order/version/file triples for page rendering.
- **Foundation detection**: `FOUNDATION_ASSET_TYPES`, `isFoundationAssetType` — the visual-anchor asset type that downstream orders auto-reference.

### Deterministic analysis — `src/analysis/`

The repository analyzer used by `analysis.run`, runnable without any LLM:

- `schema.ts` — `AnalyzeSchema`, `AnalyzeInput`.
- `assemble.ts` — `performAnalysis(projectRoot, options)` → `AnalysisResult` (deterministic, in-memory).
- `write-artifact.ts` — `writeAnalysisArtifact(projectRoot, params)` / `updateAnalysisArtifact(projectRoot, params)` — initialize protocol, version the previous analysis, run analysis, apply an optional analyst merge patch, write `.repochan/analysis/current.json`.
- Helpers under `src/analysis/`: `walk` (gitignore-aware), `git-profile`, `tech-stack`, `colors`, `desensitize` (scrubs secrets before sampling), `inventory`, `sample`, `abstract`.

### Validation — `src/validation.ts`, `src/validate.ts`

- `validate.ts` — `validateInput(action, schema, params)` + `ValidationError`. The single entry point for params gating.
- `validation.ts` — `validateProtocol(projectRoot)` for integrity checks across the whole `.repochan/` tree (used by `repochan validate`).

### Utils — `src/utils/index.ts`

- `deepMerge`, `isPlainObject`, `stampProvenance`, plus id validators (`validateOrderId`, `validateVersionId`, `validateResultVersionId`).

## Public API surface

Everything is re-exported from the package root:

```ts
export * from "./types.js";
export * from "./protocol/index.js";
export * from "./schemas/index.js";
export * from "./utils/index.js";
export * from "./validate.js";
export * from "./entities.js";
export * from "./analysis.js";
export * from "./validation.js";
```

Consumers (`pi`, `page-renderer`, `cli`) import solely from `@repochan/core` — never reaching into subpaths.

## Purity rules (enforced)

Core must **not**:

- import Pi runtime APIs (`@earendil-works/pi-*`),
- reference `ExtensionContext` or any agent/tool registration,
- contain agent prompts, role guidelines, or creative-agent logic.

When adding reusable protocol/schema/rule code, it belongs here. When adding Pi integration or prompts, it belongs in `packages/pi`. See monorepo `AGENTS.md`.

## Protocol & fixtures

- On-disk protocol spec: [`packages/pi/skills/repochan-protocol/SKILL.md`](../pi/skills/repochan-protocol/SKILL.md).
- Architectural rationale (three layers, known gaps): [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md).
- Minimal fixture (inspectable without running AI): [`examples/minimal`](../../examples/minimal).

## Development

```bash
# From monorepo root
pnpm --filter @repochan/core build      # TS → dist/
pnpm --filter @repochan/core test       # the only test suite — run after any protocol/rule change
```

Per monorepo `AGENTS.md`: **when changing core protocol or business rules, always run `pnpm --filter @repochan/core test` from the monorepo root.**

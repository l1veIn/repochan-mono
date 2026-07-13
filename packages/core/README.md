# @repochan/core

Pure TypeScript primitives for the RepoChan `.repochan/` protocol — the deterministic backbone shared by the CLI and tests.

Core has **no agent runtime**, **no image credentials**, and **no pixel-processing** dependencies. APIs take `projectRoot: string` or plain JSON and preserve the on-disk format used by the public `repochan` CLI. See the monorepo [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for how core fits the layered design.

## Three-layer design (inside core)

```
┌─────────────────────────────────────────────┐
│  Business Rules  entities/*.ts               │  state machine, dependency gates, approval
├─────────────────────────────────────────────┤
│  Protocol        protocol/index.ts           │  current.json + versions/, safe paths, require*()
├─────────────────────────────────────────────┤
│  Schema          schemas/index.ts            │  artifact shapes, params gates, WriteOpSchemas
└─────────────────────────────────────────────┘
```

**Principle**: anything that can be formalized as a deterministic constraint lives here, not in a prompt. Schemas are gates (they validate the params core actively reads), not mirrors of entities — business rules run after `validateInput` passes.

## What core owns

### Schema — `src/schemas/index.ts`

Artifact shapes (written under `.repochan/`):

- `PersonaArtifactSchema`, `InterviewArtifactSchema`, `OrderResultVersionSchema`, `AnalysisArtifactSchema`
- Each carries `schemaVersion`, `generatedAt`, `provenance`.

Write-operation params gates and the `WriteOpSchemas` registry. `validate.ts` exposes `validateInput(action, schema, params)`.

### Protocol — `src/protocol/index.ts`

- `PROTOCOL_DIR` (`.repochan`), `protocolRoot`, `safeProtocolPath`, `writeJson` / `readJson`
- `initProtocol` / `inspectProtocol`
- Versioning helpers and order/review/persona-candidate path helpers
- Dependency gates: `requireAnalysis`, `requirePersona`, `requireInterview`

### Business rules — `src/entities/`

- **Persona**: create/update, candidates, promote
- **Interview**: create/update, append
- **Orders**: CRUD-ish ops, status machine, results, candidates, foundation find, reference resolve
- **Pages**: create/update, asset ref collect/check
- **Reviews**: order review, persona review
- Approval gate: `ensureOrderApprovedForExecution`

### Deterministic analysis — `src/analysis/`

`performAnalysis` / `writeAnalysisArtifact` / `updateAnalysisArtifact` — runnable without any LLM. Helpers: walk, git-profile, tech-stack, colors, desensitize, inventory, sample, abstract.

### Validation — `src/validation.ts`, `src/validate.ts`

- `validateInput` — per-write params gate
- `validateProtocol` — whole-tree integrity (used by `repochan validate`)

## Public API

Everything is re-exported from the package root:

```ts
export * from "./types.js";
export * from "./protocol/index.js";
export * from "./schemas/index.js";
export * from "./utils/index.js";
export * from "./validate.js";
export * from "./entities/index.js";
export * from "./analysis.js";
export * from "./validation.js";
```

Consumers import solely from `@repochan/core`.

## Purity rules (enforced)

Core must **not**:

- import agent runtimes or register tools,
- contain agent prompts or role guidelines,
- hold image-provider API keys,
- perform grid slicing / sticker extraction (that lives in `@repochan/image-edit`).

## Development

```bash
# From monorepo root
pnpm --filter @repochan/core build
pnpm --filter @repochan/core test
```

Per monorepo `AGENTS.md`: **when changing core protocol or business rules, always run the core test suite.**

## Related

- Architecture: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)
- Minimal fixture: [`../../examples/minimal`](../../examples/minimal)
- Skills (how agents use the CLI): [`../skill/README.md`](../skill/README.md)

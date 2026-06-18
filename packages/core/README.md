# @repochan/core

Pure TypeScript primitives for the RepoChan `.repochan/` protocol.

Core has no Pi runtime dependency. APIs take `projectRoot: string` or plain JSON data and preserve the existing on-disk format used by the public `repochan` Pi tool. It also includes the deterministic repository analyzer used by `analysis.run`, so Pi, CLI, Studio, and CI integrations can share the same analysis behavior.

## Owns

- `.repochan/` path layout and safe path helpers.
- Schema/type exports for analysis, persona, orders, assets, and protocol validation.
- Entity operations such as persona writes, order creation/status updates, asset version manifests, and validation.
- Deterministic repository analysis used by the Pi tool and CLI workflows.

Core must not import Pi runtime APIs, agent prompts, or UI code.

## Analysis modules

The analyzer is split under `src/analysis/`:

- `schema.ts` exports `AnalyzeSchema` and `AnalyzeInput`.
- `assemble.ts` exports `performAnalysis(projectRoot, options)`, the deterministic analyzer orchestrator.
- `write-artifact.ts` exports `writeAnalysisArtifact(projectRoot, params)`, which initializes `.repochan/`, versions any previous analysis, runs analysis, applies an optional analyst merge patch, and writes `.repochan/analysis.json`.
- Helper modules cover walking/ignore handling, git profiling, tech-stack detection, color extraction, desensitized sampling, inventory/docs summaries, and heuristic abstracts.

`performAnalysis` returns an in-memory `AnalysisResult`. `writeAnalysisArtifact` persists that result using the existing `.repochan/analysis.json` and `analysis.versions/` protocol. The package root continues to export `performAnalysis`, `AnalyzeSchema`, `AnalyzeInput`, `AnalysisResult`, `AnalysisContext`, `GitProfile`, and `writeAnalysisArtifact`.

## Protocol

See `../../docs/protocol.md` for the public on-disk protocol. `examples/minimal` contains a small fixture that can be inspected without running any AI workflow.

## Development

```bash
cd repochan-mono
pnpm --filter @repochan/core test
pnpm --filter @repochan/core build
```

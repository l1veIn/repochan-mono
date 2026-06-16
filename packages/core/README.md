# @repochan/core

Pure TypeScript primitives for the RepoChan `.repochan/` protocol.

Core has no Pi runtime dependency. APIs take `projectRoot: string` or plain JSON data and preserve the existing on-disk format used by the public `repochan` Pi tool. It also includes the deterministic repository analyzer used by `analysis.run`, so Pi, CLI, Studio, and CI integrations can share the same analysis behavior.

## Owns

- `.repochan/` path layout and safe path helpers.
- Schema/type exports for analysis, persona, orders, assets, and protocol validation.
- Entity operations such as persona writes, order creation/status updates, asset version manifests, and validation.
- Deterministic repository analysis used by the Pi tool and CLI workflows.

Core must not import Pi runtime APIs, agent prompts, or UI code.

## Protocol

See `../../docs/protocol.md` for the public on-disk protocol. `examples/minimal` contains a small fixture that can be inspected without running any AI workflow.

## Development

```bash
cd repochan-mono
pnpm --filter @repochan/core test
pnpm --filter @repochan/core build
```

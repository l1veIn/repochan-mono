# @repochan/core

Pure TypeScript primitives for the RepoChan `.repochan/` protocol.

Core has no Pi runtime dependency. APIs take `projectRoot: string` or plain JSON data and preserve the existing on-disk format used by the public `repochan` Pi tool. It also includes the deterministic repository analyzer used by `analysis.run`, so Pi, CLI, Studio, and CI integrations can share the same analysis behavior.

## Development

```bash
cd repochan
pnpm --filter @repochan/core test
pnpm --filter @repochan/core build
```

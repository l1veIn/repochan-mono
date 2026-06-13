# @repochan/core

Pure TypeScript primitives for the RepoChan `.repochan/` protocol.

Core has no Pi runtime dependency. APIs take `projectRoot: string` or plain JSON data and preserve the existing on-disk format used by the public `repochan` Pi tool.

## Development

```bash
cd repochan
pnpm --filter @repochan/core test
pnpm --filter @repochan/core build
```

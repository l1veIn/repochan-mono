# @repochan/browse

Local viewer and Starter preview server used by the public `repochan` CLI.
It renders versioned `.repochan/` protocol artifacts, order references, derived
asset history, and the synced Starter catalog in a browser bound to
`127.0.0.1`.

Protocol reads go through `@repochan/core`. The viewer is read-only by default;
its two explicit action endpoints delegate Starter sync semantics to the CLI
and build a selected Starter in a temporary preview workspace. It does not
define a second protocol schema or write creative artifacts.

Most users should use the CLI rather than import this package directly:

```bash
repochan browse
repochan starter preview minimal
```

## Development

From the monorepo root:

```bash
pnpm --filter @repochan/browse build
pnpm --filter @repochan/browse test
pnpm --filter @repochan/browse lint
```

See [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) for package boundaries and
[`../../docs/releasing.md`](../../docs/releasing.md) for the coordinated release
contract.

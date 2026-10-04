# @repochan/browse

Local viewer and Starter preview server used by the public `repochan` CLI.
It renders versioned `.repochan/` protocol artifacts, order references, derived
asset history, and the synced Starter catalog in a browser bound to
`127.0.0.1`.

Both viewer and static preview servers require a local Host. Write requests
carrying an Origin must match that Host; HTTP clients without an Origin can
still invoke explicit actions.
Protocol and Starter image responses carry a sandbox CSP and `nosniff`, so SVG
opened directly remains image data. Complete Astro preview HTML and JavaScript
retain their normal execution behavior.

Protocol reads go through `@repochan/core`. The viewer is read-only by default;
its two explicit action endpoints delegate Starter sync semantics to the CLI
and build a selected Starter in a temporary preview workspace. It does not
define a second protocol schema or write creative artifacts.

Use **Refresh** to reload protocol state after CLI writes. Order links may select
a result with `#/order/<id>?v=<version>`. The Review panel follows that displayed
version, including historical results and candidates, and shows its verdict,
feedback, criteria, and reviewer. Missing reviews are shown as unreviewed;
invalid or unsafe review files show an error while the result remains viewable.
Order-level revision requests appear separately with their reason, time, and
status; they do not imply a Review of whichever result version is being viewed.
Starter previews install and build in an
isolated temporary copy, reuse only matching source content, and remove the copy
when closed; a Source Starter's existing `dist/` is never used as the preview cache.

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

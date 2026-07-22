# Contributing to RepoChan

Thanks for helping improve RepoChan. Keep changes focused, explain the user-facing
reason for them, and include tests for behavior changes.

Security vulnerabilities must be reported privately according to
[`SECURITY.md`](./SECURITY.md), not through a public issue or pull request.

## Development setup

RepoChan requires Node.js 20 or newer and uses the pnpm version declared in the
root `package.json` (`pnpm@9.15.4`). From the repository root:

```bash
pnpm install
pnpm build
pnpm test
```

Useful checks while iterating are:

```bash
pnpm lint
pnpm --filter @repochan/core test
pnpm --filter repochan test
```

Run the Core test whenever protocol schemas or business rules change. Before
submitting a change that affects package contents, manifests, dependency wiring,
bundled skills, templates, or Starters, also run:

```bash
pnpm release:pack-smoke
```

The full `pnpm test` command includes the workspace tests, release-contract
tests, and compatibility-debt check. If a check is not relevant or cannot run in
your environment, explain that clearly in the pull request.

## Architecture boundaries

Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) before changing package boundaries.
The required dependency direction is:

```text
cli → core | skill | image-gen | image-edit | templates | browse → core
```

Keep these contracts intact:

- `@repochan/core` owns schemas, the `.repochan/` protocol, business rules, and
  deterministic analysis. It is a pure library with no agent runtime, creative
  prompting, image credentials, or pixel processing.
- `repochan` is the only published command-line binding surface. It delegates
  business rules to Core and must not embed an agent or model loop.
- `@repochan/skill` is Markdown that teaches external agents to use atomic CLI
  commands and make creative decisions. It must not tell agents to hand-edit
  `.repochan/`.
- `@repochan/image-gen` turns prompts into image bytes and owns endpoint
  credentials; it does not write protocol artifacts. `@repochan/image-edit` is
  local-only pixel processing with no network, credentials, or protocol
  awareness.
- `@repochan/templates` is YAML data. `@repochan/starters` is independent
  scaffold data downloaded on demand, not a CLI dependency.
- `@repochan/browse` is the local viewer. Protocol reads go through Core, and
  its limited action endpoints receive Starter behavior from the CLI.

Add reusable deterministic behavior to Core, expose new agent capabilities as
atomic CLI subcommands first, and leave orchestration and creative judgment in
skills. Preserve version history, require explicit overwrite intent for
destructive changes, and never mutate a published order-result version.

## Pull requests

1. Search existing issues and pull requests before starting substantial work.
2. Create a focused branch and avoid unrelated formatting or generated-file
   churn.
3. Add or update tests and documentation with the implementation.
4. In the pull request, describe the problem, the chosen behavior, affected
   packages or protocol files, compatibility impact, and commands you ran.

Never commit credentials, tokens, local image endpoint configuration, npm
authentication, `node_modules`, or build output. In particular, treat
`~/.repochan/image.json`, `.repochan/image.json`, `~/.codex/auth.json`, and
`~/.repochan/codex-token-cache.json` as sensitive.

## Releases

Contributors should not publish packages from a pull request. Maintainers follow
the clean-commit, leaf-first process in [`docs/releasing.md`](./docs/releasing.md).
`pnpm release:preflight` performs registry comparisons but does not publish;
publishing, changing dist-tags, committing, and pushing each require separate
human authorization.

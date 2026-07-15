# Release preflight

RepoChan is released as one dependency-closed package set. The six leaf packages
must be available before the `repochan` CLI because the packed CLI uses exact
versions for every local runtime dependency.

Canonical order:

1. `@repochan/core`
2. `@repochan/image-edit`
3. `@repochan/image-gen`
4. `@repochan/skill`
5. `@repochan/templates`
6. `@repochan/starters`
7. `repochan`

The current candidate versions and their pre-1.0 semver rationale are recorded
in [`CHANGELOG.md`](../CHANGELOG.md). Five previously published leaf packages
move to `0.2.0` because their protocol, API, data, or workflow contracts changed
materially. The unpublished `@repochan/starters@0.1.0` and `repochan@0.3.0`
retain their first available versions. Do not force every package to share one
version; the packed CLI pins the exact coordinated leaf versions.

The executable contract lives in `scripts/release-contract.mjs`. Do not infer
publishability from workspace tests or source `package.json` files: `workspace:*`
is rewritten only in packed manifests, and an old package with the same version
may already exist on npm.

Run the deterministic local artifact check first:

```bash
pnpm release:pack-smoke
```

It copies the current non-ignored worktree into a fresh source directory with no
`node_modules` or `dist`, installs with the frozen lockfile, explicitly builds
the compiled release packages, then packs all seven packages. It checks the
rewritten dependency graph and public workspace inventory. A local scoped
registry exposes the six leaf tarballs while the empty npm project installs only
the CLI tarball as a top-level dependency. The smoke then runs the packed CLI,
pulls and validates `registry-modular`, installs its dependencies, and builds it.

Before a real release, also compare every local artifact with npm:

```bash
pnpm release:preflight
```

The command is read-only with respect to npm. Registry reads are explicitly
bound to each package's `publishConfig.registry`, so a user-level npm mirror
cannot silently change the comparison target. It reports each package as:

- `unpublished`: no immutable version collision was found (registry permission is
  still a separate prerequisite);
- `already-published-identical`: the immutable npm artifact can be reused;
- `version-collision`: npm already owns that version with different contents.

A collision is a hard stop, even when the clean-room tarball smoke passes.
Obtain human authorization for the intended versions, update the affected
package versions and exact CLI dependencies together, then rerun the preflight.
The preflight never bumps versions and never publishes. Unlike the local-only
smoke, it retains every candidate tarball and reports its absolute path and
SHA-256 hash even when a version collision makes the command exit non-zero.
Every public manifest fixes `publishConfig.registry` to npm and
`publishConfig.access` to `public`, including the first scoped Starter release.

Every child process has a finite five-minute timeout. Slow release environments
may raise it explicitly, without disabling the guard:

```bash
REPOCHAN_RELEASE_COMMAND_TIMEOUT_MS=600000 pnpm release:preflight
```

The preflight uses Node for tar extraction and invokes the packed CLI through
the current Node executable, so a POSIX release operator does not need a system
`tar` binary or a package-manager `.bin` shim. The release operator itself is
currently restricted to macOS, Linux, or another POSIX CI runner; Windows exits
early with an actionable error. This restriction applies to the release tool,
not to the published CLI runtime contract.

After the report has no blockers, publish the exact retained `.tgz` paths from
that report—not a fresh pack—in the reported order. Verify each SHA-256 before
use and pass the artifact's reported registry explicitly:

```bash
npm publish /absolute/path/from-report.tgz --registry https://registry.npmjs.org/
```

Keep `repochan` last. Publication, tags, commits, and pushes are separate
authorized operations and are intentionally absent from the script.

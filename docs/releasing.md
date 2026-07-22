# Release preflight

RepoChan is released as one dependency-closed package set. The five runtime
leaf packages must be available before the `repochan` CLI because the packed
CLI uses exact versions for every local runtime dependency. `@repochan/browse`
depends on `@repochan/core` and is itself a CLI runtime dependency, so it is
published after the leaves and before the CLI.
`@repochan/starters` is an independent publishable in the same coordinated
set: the CLI no longer bundles it, and downloads it on demand with
`repochan starter sync` into a user-level cache.

Canonical order:

1. `@repochan/core`
2. `@repochan/image-edit`
3. `@repochan/image-gen`
4. `@repochan/skill`
5. `@repochan/templates`
6. `@repochan/starters` (independent artifact; synced on demand, not a CLI dependency)
7. `@repochan/browse` (depends on `@repochan/core`)
8. `repochan`

The candidate versions and their semver rationale are recorded in
[`CHANGELOG.md`](../CHANGELOG.md). Do not force every package to share one
version; the packed CLI pins the exact coordinated runtime package versions.

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
the compiled release packages, then packs every package twice and requires
byte-identical tarballs. Each raw pnpm pack is normalized by deep-sorting its
packed manifest and rebuilding a portable archive with fixed timestamps and a
sorted entry order before hashing. It checks the
rewritten dependency graph and public workspace inventory. A local scoped
registry exposes all seven non-CLI tarballs while the empty npm project installs only
the CLI tarball as a top-level dependency. The smoke then runs the packed CLI,
verifies the complete project-local Codex skill inventory and representative
skill content, requires the exact canonical 25-template inventory, and exercises
`template get`. It also verifies the fresh install does not bundle
`@repochan/starters`, syncs the Starter catalog on demand from the registry
(`starter sync`), requires the canonical 20-Starter inventory with `minimal`
as the sole default, pulls each Starter from the synced cache, validates its
Transfer Kit and builds the copied site.
This command tests
current worktree changes for development feedback; its artifacts are not
release-eligible.

Before a real release, also compare every local artifact with npm:

```bash
pnpm release:preflight
```

This command requires a completely clean worktree, resolves `HEAD` to one commit,
and builds from `git archive` of that commit. It therefore rejects uncommitted or
untracked drift before producing candidate artifacts. The command is read-only
with respect to npm. Registry reads are explicitly
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

The preflight installs only the retained candidate CLI tarball into an isolated
HOME, initially empty npm user config, cache, install prefix, and empty git
project. It verifies exact installed package versions, project-local Codex setup
and repeated-setup idempotence, status before and after repeated init, validation
before and after deterministic analysis, on-demand Starter sync, discovery,
pull, validation, dependency install, and production build. This is CLI/package
fresh-install evidence only: it does not run a real coding agent or an image
endpoint and must not be reported as evidence for either flow. Setup evidence is specifically for
project-local Codex installation; global setup and all other agent targets remain
outside this preflight's support claim. The JSON report records the resolved
default Starter and every canonical Starter production build.

The same preflight checks that current runtime and Skill surfaces expose only the
current contract. OpenAI-compatible endpoint terminology, Starter runnable
fallbacks, and business asset/template names containing `migrate` remain valid.

The compatibility gate has a closed waiver inventory only for the intentional
image-edit chroma v1, equal-cell, and stable adapter contracts. Every waiver is
bound to one source path, detector rule, exact trimmed source line, occurrence,
rationale, and removal condition. A new finding remains a blocker; a waiver
that matches zero source lines is stale, and one exact line cannot authorize an
additional occurrence. Remove the corresponding waiver when its v1,
equal-cell, or adapter contract is removed in an explicitly versioned breaking
release.

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

## Human release gate

Stop unless all of these are true:

- the retained preflight report has no blockers and its candidate fresh-install smoke passed;
- a human has approved the exact eight versions and retained SHA-256 values;
- `npm whoami --registry https://registry.npmjs.org/` identifies the intended
  publisher, and that human has verified public publish rights for the
  `@repochan` scope as well as the unscoped `repochan` package;
- the human has an npm OTP or other registry-approved interactive authentication
  method available. Never copy a token or OTP into this repository, the report,
  or a shell script.

Publishing, changing dist-tags, commits, pushes, and deployment are separate
authorized operations. The preflight deliberately performs none of them.

## Stage the retained set under `next`

Before the first `npm publish`, save the complete existing `dist-tags` response
for all eight package names in the release record, including packages that return
404 or have no prior `next`/`latest`. `npm publish --tag next` is itself a tag
mutation, so this snapshot must exist before staging begins. Published package
bytes are immutable; the recorded prior tags are the rollback surface.

Publish the exact retained `.tgz` paths from the report—not a fresh pack. Verify
each SHA-256 immediately before use, pass the reported registry explicitly, and
use the `next` tag so `latest` remains unchanged:

```bash
# Repeat in the report's order. Use the SHA-256 and path printed by preflight.
shasum -a 256 /absolute/path/from-report.tgz
npm publish /absolute/path/from-report.tgz \
  --tag next \
  --access public \
  --registry https://registry.npmjs.org/
```

Publish the five runtime leaves first, then the independent Starter artifact,
then `@repochan/browse`, and confirm each exact version is readable from npm
before publishing the CLI tarball last. Do not continue past a failed package:

```bash
# Set these from the retained preflight report.
CORE_VERSION=...
BROWSE_VERSION=...
CLI_VERSION=...
npm view "@repochan/core@${CORE_VERSION}" version --registry https://registry.npmjs.org/
# ...repeat for image-edit, image-gen, skill, templates, and starters...
npm view "@repochan/browse@${BROWSE_VERSION}" version --registry https://registry.npmjs.org/
npm view "repochan@${CLI_VERSION}" version --registry https://registry.npmjs.org/
```

## Smoke the real `next` install

After all eight packages are visible under `next`, verify an install that reads
only from npm. This shell block keeps HOME, npm user config/cache, installation,
and project state in one disposable directory:

```bash
SMOKE_ROOT="$(mktemp -d)"
mkdir -p "$SMOKE_ROOT/home" "$SMOKE_ROOT/cache" "$SMOKE_ROOT/project"
printf 'registry=https://registry.npmjs.org/\n' > "$SMOKE_ROOT/npmrc"

(
  export HOME="$SMOKE_ROOT/home"
  export USERPROFILE="$HOME"
  export XDG_CONFIG_HOME="$HOME/.config"
  export XDG_CACHE_HOME="$HOME/.cache"
  export npm_config_userconfig="$SMOKE_ROOT/npmrc"
  export npm_config_cache="$SMOKE_ROOT/cache"

  npm install --prefix "$SMOKE_ROOT/install" --no-audit --no-fund \
    repochan@next --registry https://registry.npmjs.org/
  CLI="$SMOKE_ROOT/install/node_modules/repochan/dist/index.js"

  cd "$SMOKE_ROOT/project"
  node "$CLI" --version
  node "$CLI" status --json
  node "$CLI" init --json
  node "$CLI" setup --agent codex --project --json
  node "$CLI" starter sync --json
  node "$CLI" starter list --json
  node "$CLI" starter pull --starter minimal --output-dir site --json
  node "$CLI" starter validate --output-dir site --json
  npm --prefix site install --no-audit --no-fund
  npm --prefix site run build
)
```

Confirm the reported CLI identity matches the candidate report and every synced
Starter and bundled skill is present,
setup writes only inside the disposable project/HOME, and the Starter build
succeeds. This still does not validate a real agent session, deployment, image
credentials, or a billed image generation request.

## Promote to `latest`

Only after a human accepts the `next` smoke, move `latest` to the exact staged
versions. Promote the five runtime leaves, the independent Starter artifact,
then `@repochan/browse`, and `repochan` last; verify every tag from the registry
after changing it:

```bash
# Reuse the exact version variables recorded from the retained report.
npm dist-tag add "@repochan/core@${CORE_VERSION}" latest --registry https://registry.npmjs.org/
# ...image-edit, image-gen, skill, templates, starters, browse...
npm dist-tag add "repochan@${CLI_VERSION}" latest --registry https://registry.npmjs.org/
npm view repochan dist-tags --json --registry https://registry.npmjs.org/
```

Remove or retain the `next` tags only as a separate, explicit human decision.

## Stop and rollback boundaries

- Before the first publish: fix the candidate and rerun preflight; no registry
  rollback exists because no registry state changed.
- After some leaves are staged but before the CLI is staged: stop. `latest` is
  still safe. With human approval, restore every changed `next` tag from the
  pre-publish record (or remove it only when the record proves it did not exist);
  if package contents must change, bump the affected versions rather than trying
  to replace immutable bytes.
- If the real `next` install smoke fails: do not move any `latest` tag. Record the
  exact failure and prepare a newly versioned coordinated set.
- If promotion fails partway: restore `repochan`'s previous `latest` first if it
  changed, then restore leaf tags from the saved release record (or remove a
  newly-created `latest` for a first release). Verify registry state after every
  change. Do not use `npm unpublish` as a routine rollback mechanism.

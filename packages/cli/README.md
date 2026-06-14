# RepoChan CLI

RepoChan CLI combines deterministic `.repochan/` protocol helpers with Pi-guided RepoChan sessions.

## Commands

```bash
repochan [--new]
repochan guided [--new]
repochan guide [--new]
repochan chat [--new]
repochan run analysis [--new]
repochan run persona [--new]
repochan run orders --goal <goal> [--new]
repochan run painter --order <order-id> [--new]
repochan inspect [--json]
repochan validate [--json]
repochan install-pi-package [--local]
repochan settings | login | model | panel
repochan order list [--json]
repochan order get <order-id> [--json]
repochan asset list [--json]
repochan asset get <asset-id> [--json]
```

- `guided` / default: opens the custom RepoChan TUI host. Guided starts the constrained guided kickoff; default lands on the Repo Wiki overview.
- `chat`: the only command that starts full Pi `InteractiveMode`.
- `run <phase>`: starts a constrained single-phase agent session for `analysis`, `persona`, `orders`, or `painter` inside the custom status/result screen.
- `inspect`: read-only summary of the current `.repochan/` workspace.
- `validate`: read-only deterministic protocol validation, with `--json` for CI or scripts.
- `install-pi-package`: asks for explicit confirmation, then uses the Pi SDK package manager to install/persist `repochan-pi` so plain `pi` can discover the extension and skills.
- `settings` / `login` / `model`: opens the custom Settings screen with Pi SDK auth/model status.
- `panel`: opens the custom Assets screen.
- `order` / `asset`: deterministic list/get helpers for current protocol artifacts (`--json`) or custom TUI screens (default).

## Install RepoChan resources into normal Pi

The CLI can install the Pi package that contains the RepoChan extension and skills:

```bash
repochan install-pi-package
```

The command prints the source, target Pi agent directory, and settings change, then asks:

```text
Proceed with installation? (y/N)
```

Nothing is installed and no Pi settings are changed unless you answer `y`/`yes`. After confirmation the command creates a Pi SDK `DefaultPackageManager` with the normal `cwd`, `agentDir`, and `SettingsManager`, calls `install`, persists the source with `addSourceToSettings`, flushes settings, and reports success or failure.

For monorepo development, install the workspace `repochan-pi` package path instead of the npm package:

```bash
repochan install-pi-package --local
```

`--local` means “use the local workspace package source”; it still persists to the normal Pi user settings after confirmation so plain `pi` can use it.

## Validation

Validate is safe and read-only:

```bash
repochan validate
repochan validate --json
```

It checks the current protocol state via `@repochan/core`, including:

- whether `.repochan/` exists and expected protocol directories are present;
- whether analysis/persona JSON artifacts are readable;
- whether persona, orders, or assets appear without required upstream analysis/persona artifacts;
- whether order ids, schema versions, and statuses are valid;
- whether asset manifests exist, match their directories, have valid current versions, and reference known orders.

A clean project with no `.repochan/` is reported as OK with a warning that there is nothing to validate yet.

## Development usage

From the monorepo root (for smoke tests inside the workspace):

```bash
pnpm --filter @repochan/core build
pnpm --filter repochan-pi build
pnpm --filter repochan build
pnpm --filter repochan cli inspect --json
# Equivalent direct node form, preferred for smoke tests:
pnpm --filter repochan exec node dist/index.js inspect --json
```

**Important:** `pnpm --filter repochan ...` (and the root `pnpm cli` / `pnpm cli:dev` scripts) execute in the context of the `packages/cli` package. This can cause the CLI to see `packages/cli` (or the pnpm temp dir) as the project root instead of your intended directory. Do **not** use these forms when you want to test against real projects on your Desktop or in `/tmp`.

### Testing the CLI against arbitrary projects (Desktop, temp folders, other repos, etc.)

You want the classic experience:

```bash
cd ~/Desktop/我的项目
repochan
repochan validate --json
repochan run analysis --new
cd ~/Desktop/另一个项目
repochan chat
...
```

Here are the reliable ways (all preserve your shell's `process.cwd()` as the target project):

#### Option 1: Global link (recommended — gives you a real `repochan` command)

**Prerequisite (very common on macOS + Homebrew pnpm):** pnpm must know where to put global bins.

```bash
pnpm setup
```

Follow the instructions (it will usually append to your `~/.zshrc` or similar). Then **restart your terminal** or `source ~/.zshrc` (or `source ~/.zprofile`).

After setup, do:

```bash
pnpm --filter repochan build

# Correct ways to link (do NOT use --filter here):
pnpm link --global -C packages/cli
# or equivalently:
# cd packages/cli && pnpm link --global
```

Now you can run from anywhere:

```bash
cd ~/Desktop/随便一个项目
repochan
repochan validate --json
repochan settings
repochan run analysis --new
```

- After you edit CLI source: `pnpm --filter repochan build` again (the global link points at the package, so the new `dist/` is picked up).
- To unlink later: `pnpm unlink --global repochan`
- Verify: `which repochan` and `repochan --version`

**Note:** The old `pnpm --filter repochan link --global` gives "Unknown option: 'recursive'" because `--filter` puts pnpm in recursive mode, which `link --global` does not support. Use one of the two commands above instead.

If you ever see `ERR_PNPM_NO_GLOBAL_BIN_DIR`, just run `pnpm setup` again.

**Troubleshooting "command not found: repochan" right after pnpm setup + link**

This happens all the time on macOS zsh:

- `pnpm setup` only updates your shell config files. You usually need to **open a completely new terminal window** (or tab) for the new `PATH` to take effect.
- In the new window, re-run the link command.
- Add this line to your `~/.zshrc` (and `~/.zprofile` if you use login shells) if it's not there:

```bash
export PATH="$HOME/bin:$PATH"
```

Then `source ~/.zshrc` or start fresh terminal.

Run these diagnostics in your shell and share the output if still stuck:

```bash
pnpm bin -g
echo $PATH | tr ':' '\n' | grep -i pnpm || echo "no pnpm in PATH"
which repochan || echo "repochan not found"
pnpm list -g --depth=0
ls -l ~/bin/repochan* 2>/dev/null || echo "no ~/bin symlinks"
```

#### Option 2: Direct execution (no global change, great for quick tests)

After a build you can invoke the binary by its full path from any directory:

```bash
cd ~/Desktop/我的测试项目
/Users/a1258/Desktop/reponyan/repochan-mono/packages/cli/dist/index.js --help

# Because the built file has a shebang (#!/usr/bin/env node) and is +x, you can often omit "node":
/Users/a1258/Desktop/reponyan/repochan-mono/packages/cli/dist/index.js validate --json
```

#### Option 3: Live development (no rebuild, uses tsx + src)

```bash
cd ~/Desktop/我的测试项目
/Users/a1258/Desktop/reponyan/repochan-mono/node_modules/.bin/tsx \
  /Users/a1258/Desktop/reponyan/repochan-mono/packages/cli/src/index.ts \
  inspect --json
```

#### Option 4: One-time convenience launcher (shipped in the repo) — often the easiest for development

Global linking requires `pnpm setup` and modifies your global environment. 

For pure development/testing against Desktop projects, we provide `scripts/repochan` at the monorepo root. It:

- Prefers the built `dist/` (after `pnpm --filter repochan build`)
- Falls back to live `tsx + src/` automatically if no build exists (great while editing)
- Never touches your global bins or PATH
- Always respects the directory you `cd` into

One-time setup:

```bash
chmod +x scripts/repochan
mkdir -p ~/bin
ln -s "$(pwd)/scripts/repochan" ~/bin/repochan

# Add to your shell (put in ~/.zshrc):
export PATH="$HOME/bin:$PATH"
```

Usage (this is what most people on the team use for external projects):

```bash
cd ~/Desktop/项目A
repochan                    # works even without a prior build (uses tsx)
repochan validate --json
repochan run orders --goal "hero icon set"

cd ~/Desktop/项目B
repochan chat
```

After source changes in `packages/cli/src` you can immediately test with the launcher (no rebuild needed thanks to the fallback). When you want "production-like" behavior, just build once.

This completely sidesteps the pnpm global / `--filter` / bin-dir problems.

### Root helper scripts (for monorepo smokes only)

These are still useful when you are deliberately running from the monorepo root:

- `pnpm cli` — runs the built CLI (context = monorepo root)
- `pnpm cli:dev` — runs via tsx with no build step (context = monorepo root)

Use the four options above whenever your target project is outside the monorepo.

`repochan chat`, `repochan guided`, and `repochan run ...` require a configured Pi model for LLM turns, but normal Pi setup commands such as `/login` and `/model` remain available inside the TUI.

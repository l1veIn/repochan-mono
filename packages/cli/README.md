# repochan CLI

The command-line tools for [RepoChan](https://github.com/l1veIn/repochan-mono). Your coding agent follows the bundled skills; the CLI exposes deterministic operations and delegates protocol rules to Core.

## Start in your project

Requires Node.js ≥ 20.9 and an existing coding agent.

```bash
npm install -g repochan
cd /path/to/your/project
repochan setup --project
```

Select your agent and image-generation configuration in the setup prompts. If you skip images, configure them before generating:

```bash
repochan image configure
repochan image status
```

Open your agent in the project and ask it to use the RepoChan skill to design a mascot, starting with the character sheet. The agent coordinates the workflow; there is no CLI model loop.

For skills available in all projects, use `repochan setup --global`, followed by `repochan image configure` if needed. Global setup installs skills; the project setup flow also offers image configuration. After upgrading the CLI, rerun setup for the scope and agents you use. `repochan status` reports installed-skill version drift.

## Discover commands

Use `repochan --help` and `<command> --help` for flags. For Agent calls, prefer `--json` and `--data-file` for large structured inputs.

| Area | Commands |
| --- | --- |
| Setup and health | `setup`, `status`, `validate`, `init` |
| Repository evidence | `analysis run`, `analysis get`, `analysis update`, `analysis enrich` |
| Preferences and character | `interview`, `persona`, `persona candidate`, `persona review` |
| Asset production | `order`, `order resolve-references`, `order candidate`, `order review`, `foundation find` |
| Images | `image configure`, `image status`, `image probe`, `image gen`, `image edit` |
| Image briefs | `template list`, `template get` |
| Website assembly | `starter list|get|pull|configure|create-order|asset-apply|asset-import|validate|preview|sync` |
| Local review | `browse` |

The Wizard initializes project protocol as needed. Direct image utilities can produce ordinary files without starting the full brand workflow.

## Image generation

Image configuration belongs in `~/.repochan/image.json`, managed by image-gen. Configure an OpenAI-compatible endpoint or choose Codex login. Provider details and credential boundaries are in the [image-gen guide](../image-gen/README.md).

`image configure` saves global configuration and reports the current project's effective default endpoint. An existing `.repochan/image.json` replaces the global endpoint map; configure reports that source without changing it. With `--json`, `scope`, `effectiveScope`, `effectiveConfigPath`, `effectiveEndpoint`, and `projectOverridesGlobal` describe this distinction.

`image status` reports configuration only. `image probe` checks `GET /models` for an OpenAI-compatible endpoint or resolves a Codex OAuth token, without generating an image or verifying image-generation availability. `image configure --probe --json` includes that result in `probe`; Codex results use `authOk` / `authNote`, while actual `GET /models` responses use `modelsOk` / `modelsStatus`.

`image gen --reference <path>` accepts PNG, JPEG, and WebP based on the file's actual bytes. A different filename extension does not change its upload MIME type; unsupported reference contents are rejected before generation is submitted.

```bash
repochan image gen --prompt "…" --out /tmp/mascot.png
repochan image gen --prompt "…" --reference /tmp/mascot.png --reference /tmp/layout.png
```

Use one `--reference` flag per file. Existing explicit outputs require `--overwrite`; refusal happens before submitting a generation. Paid generations are not automatically resubmitted after a failure. If a remote job was accepted, preserve its job identity and inspect the failure before deciding what to do next.

Image generation returns original files. Website assembly applies local postprocessing. The default install supports offline chroma-grid, chroma-key, resize, compression, and related QA. ML matting is an optional capability:

```bash
repochan image edit ml install
```

Run that only when an operation reports `REPOCHAN_IMAGE_ML_MISSING`. Default official Starter assembly does not need ML. See the [image-edit guide](../image-edit/README.md) for operations.

## Website sources and instances

The CLI downloads the independent Starter package on demand; it does not bundle it as a runtime dependency.

```bash
repochan starter sync
repochan starter list
repochan starter pull --starter landing-museum
```

Pull creates an editable instance, by default in `.repochan/web-starter/`. `--from` selects a trusted local source. Source and output must be separate directories; explicit overwrite permission never authorizes deleting the source.

The Agent uses `starter configure`, `starter create-order`, and `starter asset-apply` to replace project configuration and assets. `starter asset-import` supports explicit local-file inputs. `starter validate --localized --output-dir <site>` checks required customized slots and locale/configuration consistency; build and visual review are separate checks. See the [Starter guide](../starters/README.md).

## Protocol integrity and recovery

Use entity commands to mutate `.repochan/`, including new-project bootstrap. Result publication requires materialized files. Published Order Result versions are immutable; revising an image creates a new version. Locks and compare-and-swap checks prevent stale writes from replacing newer work.

If an interrupted operation retains a recovery transaction, resolve it through the CLI before further mutation:

```bash
repochan order recovery list <order-id>
repochan order recovery recover <order-id> <transaction-id>
repochan order recovery abort <order-id> <transaction-id>
```

`recover` restores the recorded prior state. `abort` accepts the current state only after Core validates it. Both preserve recovery evidence on failure. Never delete or hand-edit transaction directories to bypass a conflict.

Explicit manual `order extract <order-id>` archives derived grid outputs at Order level; it does not alter the original version. The same append-only archive is used by Starter asset application. See [Core](../core/README.md) for the underlying entity contracts.

## More

- [Domain glossary](../skill/skills/repochan/references/terminology.md)
- [Agent roles](../skill/README.md)
- [Local viewer and previews](../browse/README.md)
- [Contributing](../../CONTRIBUTING.md) · [Architecture](../../ARCHITECTURE.md)
- [Release verification](../../docs/releasing.md)

[MIT](../../LICENSE).

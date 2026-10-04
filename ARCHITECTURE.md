# RepoChan architecture

This document defines the current package responsibilities and product invariants. Use the [domain glossary](./packages/skill/skills/repochan/references/terminology.md) for names and the [documentation index](./docs/README.md) for detailed references. Proposals and visual experiments are design records, not current execution contracts.

**Core + Skill at the center. CLI is the sole binding surface. Agent is BYO. No embedded runtime.**

## Product and execution model

RepoChan lets an external coding agent understand a Git repository, design its mascot, generate a Foundation Sheet and consistent assets, and assemble a project website. The Agent makes creative judgments; RepoChan supplies deterministic operations and persists the work.

```text
User → external Agent → Skills → repochan CLI
                                  ├─ Core → project protocol
                                  ├─ image-gen → original image bytes
                                  ├─ image-edit → local derived files
                                  ├─ templates → asset briefs
                                  └─ browse → Core reads + website previews
```

A Skill explains what to do and which atomic commands to run. The CLI routes and binds library operations. Core owns schemas, protocol writes, domain rules, and deterministic repository analysis. A schema-valid document is evidence of shape, not evidence of visual quality or successful delivery.

## Package ownership

| Package | Owns | Contract |
| --- | --- | --- |
| `@repochan/core` | Schemas, protocol, entity rules, deterministic analysis, Starter schemas and rules | Pure library accepting project roots or plain data; no Agent runtime, creative prompts, image credentials, or pixel processing. |
| `@repochan/skill` | Wizard and role instructions | Markdown only; instructs protocol writes through CLI commands. |
| `repochan` | CLI routing, setup, source resolution, library binding | The only published bin; delegates reusable business rules to Core and contains no Agent/model loop. |
| `@repochan/image-gen` | Image transports and endpoint authentication | Prompt/reference → image bytes; owns credential storage and never writes project protocol. |
| `@repochan/image-edit` | Local pixel operations | No network, credentials, or protocol awareness. |
| `@repochan/templates` | Asset Template YAML | Data only, consumed through `template list|get`. |
| `@repochan/starters` | Complete Source Starter directories | Independent scaffold data, with no runtime exports; downloaded on demand. |
| `@repochan/browse` | Local protocol viewer and Starter preview lifecycle | Reads protocol through Core; CLI injects Starter discovery/sync behavior. |

The required internal dependency graph is acyclic:

```text
repochan → core | skill | image-gen | image-edit | templates | browse
browse   → core
```

Other leaves have no internal runtime dependencies. Starters are not a CLI runtime dependency. Development may resolve a bundled Starter package, but published CLI installs use on-demand sync.

CLI adapters may translate flags, choose source directories, invoke image operations, and present results. Schema validation, legal entity transitions, durable history, and reusable domain rules belong in Core.

## Protocol and delivery

Protocol state lives in the target project's `.repochan/` directory:

```text
.repochan/
  analysis/{current.json, versions/}
  interview/{current.json, versions/}
  persona/{current.json, versions/, candidates/, reviews/}
  orders/<order-id>/
    order.json
    versions/<version-id>/{meta.json, original files}
    references/
    reviews/
    derived/<archive-id>/
    derived.json
  templates/                  # optional project Asset Templates
  web-starter/                # default Pulled Instance output
```

- Public writes go through schema-validated Core entity operations, bound by CLI commands. Agents use commands even during new-project bootstrap and recovery.
- Replacing a current Analysis, Interview, or Persona preserves its prior version. An Order Result's published version directory and `meta.json` are immutable; generate a new version to revise an image.
- A Current Version selects an existing result. Candidates and Reviews are separate entities; a Review is not execution approval.
- Delivery requires real, readable, non-empty files. Metadata alone cannot mark an Order delivered.
- CLI publication fully decodes supported bitmap inputs before creating a result or candidate; Core preserves its format-independent file contract and has no pixel dependency.
- Destructive replacement requires explicit overwrite intent. Candidate promotion and result publication obey status gates.
- Locks protect complete read-modify-write operations. Result publication stages output, checks that the Order has not changed, and retains an explicit recovery record when rollback cannot complete.
- Recovery is performed through `order recovery list|recover|abort`. A retained recovery transaction is a condition to resolve, not a directory to delete by hand.
- Protocol paths validate containment and symlink ancestry. Existing workspace write access does not make transaction recovery a security boundary against an actor who can rewrite the workspace itself.

Consult [Core](./packages/core/README.md) for library behavior and [CLI](./packages/cli/README.md) for command syntax.

## Roles and workflows

The default guided workflow is:

```text
Analyst → optional Interviewer → Creative Team → Art Director → Painter → Starter Localizer
                                 Persona       all Orders      Foundation   Pulled Instance
                                 checkpoint                    checkpoint
```

The Wizard coordinates roles and waits for feedback at Persona, Foundation Sheet, and before deployment. It can route a request to one role or to an ordinary image utility without starting the entire workflow.

- **Foundation Sheet first:** downstream character assets use the selected visual reference. Declared references must resolve successfully; a missing reference is a failure to repair, not permission to omit it.
- **Painter:** delivers original generated images, prompts, and provenance. Local pixel derivation belongs to website assembly or the Wizard's explicitly requested image-utility route.
- **Starter Localizer:** localizes an existing Source Starter's Pulled Instance.
- **Web Designer:** creates an original project website through design and implementation acceptance when explicitly requested or when no Starter fits.
- **Starter Designer:** productizes an accepted project website in a creator-owned directory. Official catalog admission requires a reviewed contribution.

Yolo selects default creative choices within the user's authorized scope. Non-interactive execution changes how choices are made, not the permission to deploy, publish, push, or send external messages. Runnable, Customized, Approved, Productized, and Deployed describe different evidence; use the glossary's definitions.

## Starter localization and assembly

A Source Starter is a complete website that retains its original project identity and production assets. Its sole manifest is `repochan/starter.json`; its Transfer Kit contains project configuration, complete locale files, asset state, declared slots, and previews.

`starter pull` copies a source into a separate editable Pulled Instance. Source resolution is:

```text
--from → REPOCHAN_STARTERS_DIR → ~/.repochan/starters cache → bundled package in development
```

The catalog's sole default is declared by the Starter manifest. Discover available sources with `starter list`; avoid hard-coding catalog counts or defaults in callers.

Assembly writes derived assets into the target site's `public/`. Required project-specific imagery must have declared slots. A `source` asset makes the original website runnable; `starter validate --localized` requires required slots to be `customized`, plus complete locale/configuration consistency. This mechanical check does not establish human visual acceptance.

At `starter asset-apply`, postprocess steps with `keep` other than `false` archive audit copies at Order level and append to `derived.json`. This is the controlled protocol archive exception: it never rewrites published result versions or Source Starter files. `order extract` uses the same append-only derived archive for an explicitly requested manual extraction.

Browse binds to `127.0.0.1`. Protocol viewing is read-only; only explicit Starter sync/preview action endpoints invoke injected behavior. Preview build work belongs in a separate working copy, with cache identity tied to the selected source.

## Images and credentials

Image generation and image editing are distinct capabilities. `image-gen` owns provider configuration in `~/.repochan/image.json` and environment variables. It supports OpenAI-compatible image endpoints and Codex-login transport. Codex credentials are read from `~/.codex/auth.json`; refresh state belongs in `~/.repochan/codex-token-cache.json`, never back in `~/.codex/`.

Endpoint mode defaults to `auto`; `openai` and `openai-async` are explicit transport choices. Endpoint model defaults to `gpt-image-2.5-sunburst`; `gpt-image-2.5-flare` and `gpt-image-2` remain supported. `xhigh` and `max` quality require the 2.5 family. Precise request constraints and setup examples live in the [image-gen guide](./packages/image-gen/README.md).

A failure must not silently resubmit a paid generation. Recovery preserves the remote job identity where available. The optional ML image-edit runtime is installed explicitly through CLI capability commands and then executed from local files.

## Verification and releases

[Contributing](./CONTRIBUTING.md) defines development checks. Changes to Core protocol or business rules require the Core tests. CLI, transport, local pixel, viewer, and artifact tests cover their own interfaces; none of these establish an actual external Agent conversation or human aesthetic approval.

Public packages are released as a dependency-closed set: Core and other leaves first, Browse after Core, CLI after its runtime dependencies. Starters are an independent publishable. Packed CLI manifests pin exact coordinated dependency versions. [Release preflight](./docs/releasing.md) verifies clean-room installation and Starter production builds; it never publishes.

## Deliberate limits

- Upstream Persona changes do not automatically invalidate every downstream asset. Reference resolution validates explicit dependencies; users and the Wizard decide which work to revise.
- Schemas validate legal state and output shape; creative quality requires review.
- There is no embedded Agent runtime or parallel MCP truth source.
- Local build and mock transport checks do not prove provider availability, other operating systems, or a deployed website.

For implementation entry points, start from each package's `src/index.ts`, Core's `src/entities/` and `src/protocol/`, and CLI's `src/index.ts`. For the smallest end-to-end protocol example, read [the smoke-flow test](./packages/core/test/smoke-flow.test.ts).

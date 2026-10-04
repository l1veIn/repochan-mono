# Documentation

Start with the root [README](../README.md) or [中文 README](../README_zh.md). For development decisions, use the current references below. Design experiments and proposals record reasoning; they do not establish shipped capabilities.

## Current references

| Need | Reference |
| --- | --- |
| Product terms, roles, and completion claims | [Domain glossary](../packages/skill/skills/repochan/references/terminology.md) |
| Package ownership and protocol invariants | [Architecture](../ARCHITECTURE.md) |
| Development setup, tests, and pull requests | [Contributing](../CONTRIBUTING.md) |
| Installation and commands | [CLI guide](../packages/cli/README.md) |
| Protocol and entity operations | [Core](../packages/core/README.md) |
| Agent workflows | [Skills](../packages/skill/README.md) |
| Image authentication and generation | [Image generation](../packages/image-gen/README.md) |
| Local pixel processing | [Image editing](../packages/image-edit/README.md) |
| Image brief templates | [Asset templates](../packages/templates/README.md) |
| Complete website sources and localization | [Starters](../packages/starters/README.md) |
| Local protocol viewer and website preview | [Browse](../packages/browse/README.md) |
| Package publication and clean-room checks | [Release guide](./releasing.md) |
| Private vulnerability reporting | [Security policy](../SECURITY.md) |
| Official website development | [Official site](../sites/www/README.md) |

If documentation and implementation disagree, reproduce the actual command or library operation and correct the inconsistency. A proposal's desired behavior is not evidence that the behavior exists.

## Design and decision records

- [Maintenance audit, 2026-10-04](./audits/2026-10-04.md): scope, repair ownership, validation evidence, and finite follow-up work.
- [Design records](./design/README.md): rationale and exploration; consult current package references for supported behavior.
- [Proposals](./proposals/README.md): options and decision status.
- [Visual direction briefs](./prototypes/README.md): creative source material, distinct from the runnable Starter catalog.
- [README visual experiments](./readme-variants/README.md): retained assets and past layouts; use the root README for setup.

The [Score Review tool](../score-review/README.md) is a separate local utility for evaluating test archives, not a published RepoChan package or protocol viewer.

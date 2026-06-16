# From RepoNyan To RepoChan

The old Python `reponyan` project is the reference prototype: a full CLI/TUI/Web app with provider integrations and a polished product story.

`repochan-mono` is the open-source direction:

- `@repochan/core` preserves the protocol and deterministic rules as a reusable TypeScript library.
- `repochan-pi` moves creative work into Pi skills and the unified `repochan` tool.
- `repochan` CLI keeps the old one-command onboarding feel, but delegates auth/model setup to Pi and opens the RepoChan app after the first-run path.

Important changes:

- `.repochan/` is the new stable protocol directory.
- Raw LLM and image-provider ownership moves out of RepoChan where possible.
- Image generation is selected from the current Pi session, registered Pi tools, or user-provided files.
- The old Python app remains useful as a reference for product feel, analysis ideas, and migration context.

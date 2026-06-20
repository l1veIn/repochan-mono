# image-gen-pi Contributor Guide

## Rules

- Provider implementations are self-contained modules under `src/providers/`.
- The `ImageGenProvider` interface in `src/types.ts` is the only contract providers must implement.
- Never import provider-specific code into `extensions/index.ts` — go through `src/registry.ts`.
- Tool schema is static. If the active provider changes, the user runs `/reload`.
- All providers return base64 image data in `GenerateResult.image`.
- File saving is handled centrally in `extensions/index.ts`, not in providers.
- Config is JSON (global + project merge). Never use env vars for provider selection.

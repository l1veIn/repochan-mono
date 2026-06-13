# RepoChan Monorepo Guidelines

- `packages/core` must remain a pure library: no Pi imports, no `ExtensionContext`, no creative-agent prompting logic.
- Core APIs take `projectRoot: string` or plain JSON data and preserve the existing `.repochan/` on-disk protocol.
- `packages/pi` owns extension registration, prompt guidelines, skills, and Pi runtime integration. Keep the public tool name `repochan` and action/params shapes stable.
- When changing core protocol or business rules, run `pnpm --filter @repochan/core test` from this directory.
- When changing the Pi package, ensure imports from reusable protocol/schema/rule code come from `@repochan/core`.

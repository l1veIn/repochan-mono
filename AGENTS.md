# RepoChan Monorepo Guidelines

> ⚠️ **架构基线已变（2026-07-09）。** 下方"5 包结构是稳定基线"已不再是基准。
> 当前权威方向见 [`.plans/2026-07-09-repositioning.md`](./.plans/2026-07-09-repositioning.md) ——
> 以 core+skill 为中心、CLI 唯一绑定面、agent 由用户自带、不内嵌 Pi runtime。
> 执行重构前**必读该 ADR**；下方既有条款在 ADR 未完成迁移前仍适用于当前 main 分支代码。

- `packages/core` must remain a pure library: no Pi imports, no `ExtensionContext`, no creative-agent prompting logic. Core may depend on `sharp` (prebuilt image binaries via `@img/sharp-*`) for pixel-level post-processing (sticker extraction / background removal) — this is the only native dependency permitted in core; do not introduce others without an explicit decision. *(Note: per the 2026-07-09 ADR, slicing/stickers are slated to move out of core into a new `imaging` package; until that move happens this rule still holds.)*
- Core APIs take `projectRoot: string` or plain JSON data and preserve the existing `.repochan/` on-disk protocol.
- `packages/pi` owns extension registration, prompt guidelines, skills, and Pi runtime integration. Keep the public tool name `repochan` and action/params shapes stable.
- When changing core protocol or business rules, run `pnpm --filter @repochan/core test` from this directory.
- When changing the Pi package, ensure imports from reusable protocol/schema/rule code come from `@repochan/core`.

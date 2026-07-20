# Character Game Page

RepoChan's mascot character file as a game-style scrollable Astro page: boot sequence, hero cutout, profile with dual-life panels, design index (expressions / states / palette / motifs), pinned day-to-night world, kinetic voice line and fun-facts archive. zh default + en locale, GSAP + ScrollTrigger + Lenis, full `prefers-reduced-motion` fallback.

All project-specific data lives in `repochan/`:

- `repochan/site.json` — project meta and the canonical theme colors. They reach the page as CSS variables injected by `BaseLayout` via `buildCssVars()` in `src/lib/site.ts`; derived shades (`--ink2`, `--ink3`, `--voice-deep`) are deterministic scales of `theme.ink` chosen to reproduce the approved palette within a few channel units. Do not add color literals to `src/`.
- `repochan/i18n/<locale>.json` — every text the page consumes (`repochan.starter-content.v1`; zh and en match in keys, types and array lengths).
- `repochan/assets.json` — current asset state per slot (all `source`).
- `repochan/starter.json` — the only manifest: locales, previews, asset slots, order templates, deterministic postprocess.
- `repochan/references/*.png` — read-only source grid sheets for the two bundle slots.
- `public/assets/scene-*-lineart.webp` — low-information migration references for the three baked scene slots (composition only; character identity, text and rendering style removed). The original scenes ship untouched.

Slot asset URLs are single-sourced from `repochan/assets.json` through `slotSrc` in `src/lib/site.ts`; per-locale image picks stay inside the locale files.

```bash
pnpm install
pnpm dev
pnpm build
```

Run `repochan starter validate --output-dir <site>` from the parent repository to check the complete Starter v1 contract.

# RepoChan Page (Minimal Hero)

Simplified Astro + Tailwind starter — **Hero section only**. Used for testing the
asset migration pipeline without the noise of features/gallery/pipeline/cta sections.

Based on `constructivist` but stripped to a single Hero component. The Hero uses
the same composition language (character on right, left blank zone for text overlay)
and the same `hero-character-migrate` template.

## Color contract

Presentation files must only consume the palette variables emitted by
`src/config/site.ts` (`--c-primary`, `--c-base`, and both accents, including
their RGB variants). Do not add literal hex colors, numeric color functions,
named colors, or fixed Tailwind color utilities to components and styles.
Derived transparency, gradients, highlights, and shadows should use those
variables with `rgb(var(--c-*-rgb) / <alpha>)` or `color-mix()`.

`pnpm check:colors` enforces this boundary and runs automatically before the
production build. The fallback persona in `src/config/site.ts` is the single
allowed source of default palette values.

## Develop

```bash
pnpm install
pnpm dev      # http://localhost:4321
pnpm build    # static output to dist/
```

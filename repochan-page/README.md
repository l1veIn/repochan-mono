# RepoChan Page

Editable Astro + Tailwind homepage generated from RepoChan dogfood artifacts.

This project is intentionally a normal web project, not a rendered HTML blob.
Agents and humans can keep editing components, i18n copy, theme tokens, and
asset mappings after the initial RepoChan generation.

## Content Sources

- `src/i18n/en.json` and `src/i18n/zh.json` — all public page copy.
- `src/config/theme.ts` — persona-derived visual direction and color tokens.
- `src/config/assets.ts` — RepoChan order/version-backed image slots.
- `public/repochan-assets/` — copied images from `.repochan/orders/...`.

## Asset Workflow

When an image order is delivered, copy its result file to:

```text
public/repochan-assets/<orderId>/<versionId>/<file>
```

Then update `src/config/assets.ts`:

```ts
{
  key: "hero",
  orderId: "ord-site-hero-prototype",
  versionId: "v1",
  file: "hero.png",
  src: "/repochan-assets/ord-site-hero-prototype/v1/hero.png",
  status: "ready",
  usage: "section-prototype"
}
```

Until assets are ready, components render structured fallback frames so the page
remains buildable and editable.

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
```

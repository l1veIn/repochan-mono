# `sites/www` — RepoChan official site

Static marketing site for **repochan.com**, based on the museum white-cube page
design. Plan: [`docs/design/sites-www.md`](../../docs/design/sites-www.md).

## Develop

```bash
cd sites/www
pnpm install   # or npm install
pnpm dev
```

## Build

```bash
pnpm build     # → dist/
pnpm preview
```

## Cloudflare Pages

| Setting | Value |
|---------|--------|
| Root directory | `sites/www` |
| Build command | `npm install && npm run build` (or `pnpm install && pnpm build`) |
| Build output | `dist` |
| Node | ≥ 20 |

Optional env:

- `PUBLIC_SITE_URL` — absolute origin for OG/canonical (default `https://repochan.com`)

Custom domain: bind apex/`www` in the Cloudflare dashboard after the first deploy.

## Showcase

Case assets live under `public/showcase/<id>/` and are registered in
`src/data/showcase.ts`. Source material is curated from local `test-repos/`
(gitignored) — never import that path at build time.

## Not part of npm release

This package is **not** in the publish graph (`pnpm-workspace` packages). It
deploys independently via Pages.

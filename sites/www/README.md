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

**Production:** [repochan.com](https://repochan.com) · project `repochan-www` · also `*.repochan-www.pages.dev`

### Continuous deploy (GitHub Actions — preferred)

GitHub is **not** linked to this Cloudflare account (avoids clobbering another CF
account already connected to the same GitHub user). Deploys use **Wrangler
direct upload** from CI:

| Trigger | Workflow |
|---------|----------|
| Push to `main` that touches `sites/www/**` | [`.github/workflows/deploy-www.yml`](../../.github/workflows/deploy-www.yml) |
| Manual | Actions → **Deploy www** → Run workflow |

**One-time secrets** (repo → Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | Create at [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → template **Edit Cloudflare Workers** is enough if it includes Pages, or custom: **Account → Cloudflare Pages → Edit** (+ Account read if prompted) |
| `CLOUDFLARE_ACCOUNT_ID` | Account home → right sidebar **Account ID** (the account that owns `repochan-www` / `repochan.com`) |

Optional GitHub Environment `www` is referenced by the workflow (for deploy URL
badge); create it under Settings → Environments if the first run asks for it.

### Manual local deploy

```bash
cd sites/www
npm ci && npm run build
npx wrangler pages deploy dist --project-name=repochan-www
```

Requires `wrangler login` or the same API token in the environment
(`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`).

### Build settings (if you ever use dashboard Git builds)

| Setting | Value |
|---------|--------|
| Root directory | `sites/www` |
| Build command | `npm ci && npm run build` |
| Build output | `dist` |
| Node | ≥ 20 |

Optional env:

- `PUBLIC_SITE_URL` — absolute origin for OG/canonical (default `https://repochan.com`)

## Showcase

Case assets live under `public/showcase/<id>/` and are registered in
`src/data/showcase.ts`. Source material is curated from local `test-repos/`
(gitignored) — never import that path at build time.

## Not part of npm release

This package is **not** in the publish graph (`pnpm-workspace` packages). It
deploys independently via Pages.

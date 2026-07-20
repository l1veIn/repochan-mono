# Scrollytelling Pipeline Narrative

RepoChan's own 7-act scrollytelling landing page: pinned scrub scenes, terminal typing, kinetic type, a glow-cursor progress rail and a painter asset cascade narrating the pipeline that produced the page itself. zh default with a full en locale (`/` and `/en/`).

All project-specific data lives in `repochan/`:

- `repochan/site.json` — project facts and the five canonical theme colors; `src/lib/site.ts` derives the full CSS token set from them (the presentation layer has no color literals).
- `repochan/i18n/{zh,en}.json` — every string the page consumes, identical key/type/array shape across locales.
- `repochan/assets.json` — current asset state per slot (`source`); `src/lib/site.ts` resolves all asset URLs from it.
- `repochan/starter.json` — the only manifest: locales, previews, asset slots, order templates and deterministic postprocess.

Do not add palette literals to `src/`; run `repochan starter validate --output-dir <site>` from the parent repository to check the complete Starter v1 contract.

```bash
npm install
npm run dev
npm run build
```

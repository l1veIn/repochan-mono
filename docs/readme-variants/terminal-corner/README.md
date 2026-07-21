<div align="center">

<img src="./assets/hero-terminal.webp" alt="A dark terminal window running a real RepoChan session — npm install, repochan setup, analysis run, persona create, image gen, starter pull — with the mascot as a small circular badge overlapping the bottom-right corner" width="100%">

<br/>

**Turn any git repository into a living mascot persona and a consistent visual brand** —

character sheets, icons, stickers, posters, and a landing page — driven by *your* coding agent.

<br/>

[![npm](https://img.shields.io/npm/v/repochan?color=38BDF8&label=npm)](https://www.npmjs.com/package/repochan)
[![license](https://img.shields.io/badge/license-MIT-111827)](../../../LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-34D399)](https://nodejs.org)
[![skills](https://img.shields.io/badge/agent-BYO-F9A8D4)](../../../packages/skill/)

**[English](./README.md) · [中文文档](./README_zh.md) · [Architecture](../../../ARCHITECTURE.md)**

</div>

# RepoChan

> Skin: **terminal-corner** — the CLI-first README variant (terminal hero + corner-badge mascot). The canonical README lives at the [repository root](../../../README.md); engineering content here is equivalent.

You already use a coding agent (Claude Code, Codex, Pi, Cursor, Hermes, …). RepoChan gives that agent a creative pipeline to run: **analysis → persona → art direction → painting → landing page**. Hard rules live in code (schemas, state machine, dependency gates); creative judgment lives in skills. There is **no embedded runtime** — your agent orchestrates, RepoChan tracks.

Everything the pipeline does is a command you can run, read, and diff yourself:

```console
$ repochan analysis run        # ① analyst scans the repo
$ repochan persona create      # ② creative team drafts the mascot    ⏸ confirm persona
$ repochan order create        # ③ art director files every asset order
$ repochan image gen           # ④ painter draws, foundation first    ⏸ confirm foundation
$ repochan starter pull        # ⑤ page designer assembles the site   ⏸ before deploy
```

## Try it

**Prerequisites:** Node.js ≥ 20, a coding agent you already use, and (for image generation) an OpenAI-compatible images endpoint.

```bash
npm install -g repochan && repochan setup          # installs skills into your agent
# repochan image configure       # image endpoint credentials configuration
```

Then open your coding agent in the project and input `/repochan` to run the RepoChan workflow. Try:

> "Give this repo a mascot and full brand assets"  
> "yolo, full pipeline"  
> "Only analyze this repository"

Run `repochan setup` again after upgrading the CLI so the bundled skills are refreshed; `repochan status` reports version drift when a refresh is needed.

| Mode | When | Behavior |
|------|------|----------|
| **Wizard (default)** | "Make me a mascot and site" | Full pipeline, stop at checkpoints |
| **yolo** | You explicitly say `yolo` | Default creative decisions inside the authorized scope; external writes still require explicit authorization |
| **Non-interactive** | CI / no TTY | Auto-select local reversible decisions; stop before unauthorized external writes |
| **Per-team (advanced)** | "Only run analysis" / "redraw this order" | Single team skill |

**Visual consistency** is anchored by a **foundation sheet** (character design cover). Downstream assets reference it, so the brand stays coherent from icon to landing page. Every role produces a schema-validated, versioned artifact under `.repochan/` — you can `cat`, `diff`, and `git blame` the whole creative state.

<details>
<summary><b>Build from source (contributors)</b></summary>

```bash
pnpm install
pnpm -r build                 # builds core, image-gen, image-edit, cli
pnpm --filter repochan exec node dist/index.js setup
pnpm test                     # full monorepo test suite
```

See [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) for the package layout, dependency direction, and release contract.

</details>

---

## Dogfooding: our own brand, made by RepoChan

<table>
  <tr>
    <td>Everything on this page was produced by this pipeline for RepoChan itself — persona, foundation sheet, sticker grids, posters, and landing starters. Grid sheets are generated on a uniform matte with a layout-guide reference, then cut by our own chroma-grid pipeline (soft-alpha unmix, centroid assignment, fail-loud QA) — the same <code>repochan image edit</code> commands ship in the CLI.</td>
    <td align="center" width="120"><img src="./assets/corner-badge.webp" width="96" alt="RepoChan mascot corner badge — silver hair with mint and pink streaks, heterochromia, triangle hair clip, headphones"></td>
  </tr>
</table>

<table>
  <tr>
    <td align="center"><img src="./assets/gallery-foundation.webp" width="360" alt="Foundation sheet — mascot character design cover with color palette, expressions, key motifs and gear"><br/><sub>foundation sheet · <code>ord-foundation-001</code></sub></td>
    <td align="center"><img src="./assets/gallery-stickers.webp" width="360" alt="3×3 sticker grid extracted by the chroma-grid pipeline — wave, search, celebrate, sleep and more"><br/><sub>sticker grid · <code>image edit extract</code></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="./assets/gallery-poster.webp" width="360" alt="Poster — the mascot drawing at her workbench, risograph texture"><br/><sub>poster · <code>ord-poster-001</code></sub></td>
    <td align="center"><img src="./assets/gallery-landing-glitch-os.webp" width="360" alt="landing-glitch-os starter preview — a desktop-OS page where every window runs a real repochan command"><br/><sub>landing · <code>landing-glitch-os</code></sub></td>
  </tr>
</table>

### Starter gallery

Complete, localizable Astro sites — each with slots, locale files, and order-backed assets. `repochan starter pull` any of them:

<table>
  <tr>
    <td align="center"><a href="../../../packages/starters/landing-glitch-os"><img src="./assets/strip-landing-glitch-os.webp" width="220" alt="landing-glitch-os starter — RepoChan OS desktop with terminal windows"></a><br/><sub>glitch-os</sub></td>
    <td align="center"><a href="../../../packages/starters/caddy"><img src="./assets/strip-caddy.webp" width="220" alt="caddy starter — HTTPS server landing page, teal on dark"></a><br/><sub>caddy</sub></td>
    <td align="center"><a href="../../../packages/starters/redis"><img src="./assets/strip-redis.webp" width="220" alt="redis starter — real-time data platform landing page"></a><br/><sub>redis</sub></td>
    <td align="center"><a href="../../../packages/starters/marktext"><img src="./assets/strip-marktext.webp" width="220" alt="marktext starter — markdown editor landing page, ink and serif"></a><br/><sub>marktext</sub></td>
  </tr>
</table>

…plus 16 more — see the [starter catalog](../../../packages/starters/README.md).

---

## Go deeper

| Doc | Contents |
|-----|----------|
| [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) | Layers, packages, binding model, design principles, known gaps |
| [`docs/releasing.md`](../../../docs/releasing.md) | Leaf-first release contract |
| [`packages/skill/`](../../../packages/skill/) | Skill inventory (wizard + team roles) |
| [`packages/core/`](../../../packages/core/) | Protocol, schemas, business rules |
| [`packages/starters/`](../../../packages/starters/) | Landing-page starter catalog |

---

## Acknowledgments

RepoChan's cutout / grid-extraction pipeline (`@repochan/image-edit`) borrows proven techniques from these open-source projects:

- [`aldegad/sprite-gen`](https://github.com/aldegad/sprite-gen) (Apache-2.0) — the chroma v2 pipeline is a TypeScript port of its known-key soft-alpha unmix, trapped-spill despill, and key-depth classification; the centroid grid geometry (component assignment, merged-span split, debris handling) follows its slice-sheet design. See [`packages/image-edit/NOTICE`](../../../packages/image-edit/NOTICE).
- [`0x0funky/agent-sprite-forge`](https://github.com/0x0funky/agent-sprite-forge) — generation-side stabilization ideas: layout-guide images as composition references and fail-loud QC gates that feed regeneration instead of masking defects.

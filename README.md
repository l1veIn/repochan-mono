<div align="center">

<img src="./docs/assets/readme/banner.jpg" alt="RepoChan — the mascot at her workbench" width="100%">

<br/>

**Turn any git repository into a living mascot persona and a consistent visual brand** —

character sheets, icons, stickers, posters, and a landing page — driven by *your* coding agent.

<br/>

[![npm](https://img.shields.io/npm/v/repochan?color=38BDF8&label=npm)](https://www.npmjs.com/package/repochan)
[![license](https://img.shields.io/badge/license-MIT-111827)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-34D399)](https://nodejs.org)
[![skills](https://img.shields.io/badge/agent-BYO-F9A8D4)](./packages/skill/)

**[English](./README.md) · [中文文档](./README_zh.md) · [Architecture](./ARCHITECTURE.md)**

</div>

---

You already use a coding agent (Claude Code, Codex, Pi, Cursor, Hermes, …). RepoChan gives that agent a creative pipeline to run: **analysis → persona → art direction → painting → landing page**. Hard rules live in code (schemas, state machine, dependency gates); creative judgment lives in skills. There is **no embedded runtime** — your agent orchestrates, RepoChan tracks.

## How it works

You talk to **your agent**. The wizard skill schedules the teams:

```mermaid
flowchart LR
  A[① Analyst<br/>analysis] --> B[② Interviewer<br/>interview · optional]
  B --> C[③ Creative team<br/>persona]
  C --> P1{{⏸ confirm persona}}
  P1 --> D[④ Art director<br/>all orders]
  D --> E[⑤ Painter<br/>foundation → downstream]
  E --> P2{{⏸ confirm foundation}}
  P2 --> F[⑥ Page designer<br/>landing page]
  F --> P3{{⏸ before deploy}}
```

| Mode | When | Behavior |
|------|------|----------|
| **Wizard (default)** | "Make me a mascot and site" | Full pipeline, stop at checkpoints |
| **yolo** | You explicitly say `yolo` | Default creative decisions inside the authorized scope; external writes still require explicit authorization |
| **Non-interactive** | CI / no TTY | Auto-select local reversible decisions; stop before unauthorized external writes |
| **Per-team (advanced)** | "Only run analysis" / "redraw this order" | Single team skill |

**Visual consistency** is anchored by a **foundation sheet** (character design cover). Downstream assets reference it, so the brand stays coherent from icon to landing page. Every role produces a schema-validated, versioned artifact under `.repochan/` — you can `cat`, `diff`, and `git blame` the whole creative state.

---

## Dogfooding: our own brand, made by RepoChan

Everything below was produced by this pipeline for RepoChan itself — persona, foundation, grids, cutouts, and landing starters.

<table>
  <tr>
    <td align="center"><img src="./packages/starters/landing-neobrutal-zine/public/assets/stickers/sticker-0.webp" width="96"><br/><sub>welcome</sub></td>
    <td align="center"><img src="./packages/starters/landing-neobrutal-zine/public/assets/stickers/sticker-1.webp" width="96"><br/><sub>searching</sub></td>
    <td align="center"><img src="./packages/starters/landing-neobrutal-zine/public/assets/stickers/sticker-5.webp" width="96"><br/><sub>success</sub></td>
    <td align="center"><img src="./packages/starters/landing-neobrutal-zine/public/assets/webstates/state-4.webp" width="96"><br/><sub>error</sub></td>
    <td align="center"><img src="./packages/starters/landing-neobrutal-zine/public/assets/webstates/state-8.webp" width="96"><br/><sub>cozy</sub></td>
    <td align="center"><img src="./packages/starters/character-game-page/public/assets/hero-cutout.webp" width="96"><br/><sub>cutout</sub></td>
  </tr>
</table>

Grid sheets are generated on a uniform matte with a layout-guide reference, then cut by our own chroma-grid pipeline (soft-alpha unmix, centroid assignment, fail-loud QA) — the same `repochan image edit` commands ship in the CLI.

### Starter gallery

Complete, localizable Astro sites — each with slots, locale files, and order-backed assets. `repochan starter pull` any of them:

<table>
  <tr>
    <td align="center"><a href="./packages/starters/landing-swiss-type"><img src="./packages/starters/landing-swiss-type/repochan/previews/desktop.webp" width="220"><br/><sub>swiss-type</sub></a></td>
    <td align="center"><a href="./packages/starters/landing-memphis"><img src="./packages/starters/landing-memphis/repochan/previews/desktop.webp" width="220"><br/><sub>memphis</sub></a></td>
    <td align="center"><a href="./packages/starters/landing-glitch-os"><img src="./packages/starters/landing-glitch-os/repochan/previews/desktop.webp" width="220"><br/><sub>glitch-os</sub></a></td>
  </tr>
  <tr>
    <td align="center"><a href="./packages/starters/landing-solarpunk"><img src="./packages/starters/landing-solarpunk/repochan/previews/desktop.webp" width="220"><br/><sub>solarpunk</sub></a></td>
    <td align="center"><a href="./packages/starters/landing-museum"><img src="./packages/starters/landing-museum/repochan/previews/desktop.webp" width="220"><br/><sub>museum</sub></a></td>
    <td align="center"><a href="./packages/starters/landing-toy-city"><img src="./packages/starters/landing-toy-city/repochan/previews/desktop.webp" width="220"><br/><sub>toy-city</sub></a></td>
  </tr>
</table>

…plus 14 more — see the [starter catalog](./packages/starters/README.md).

---

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

<details>
<summary><b>Build from source (contributors)</b></summary>

```bash
pnpm install
pnpm -r build                 # builds core, image-gen, image-edit, cli
pnpm --filter repochan exec node dist/index.js setup
pnpm test                     # full monorepo test suite
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the package layout, dependency direction, and release contract.

</details>

---

## Go deeper

| Doc | Contents |
|-----|----------|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Layers, packages, binding model, design principles, known gaps |
| [`docs/releasing.md`](./docs/releasing.md) | Leaf-first release contract |
| [`packages/skill/`](./packages/skill/) | Skill inventory (wizard + team roles) |
| [`packages/core/`](./packages/core/) | Protocol, schemas, business rules |
| [`packages/starters/`](./packages/starters/) | Landing-page starter catalog |

---

## Acknowledgments

RepoChan's cutout / grid-extraction pipeline (`@repochan/image-edit`) borrows proven techniques from these open-source projects:

- [`aldegad/sprite-gen`](https://github.com/aldegad/sprite-gen) (Apache-2.0) — the chroma v2 pipeline is a TypeScript port of its known-key soft-alpha unmix, trapped-spill despill, and key-depth classification; the centroid grid geometry (component assignment, merged-span split, debris handling) follows its slice-sheet design. See [`packages/image-edit/NOTICE`](./packages/image-edit/NOTICE).
- [`0x0funky/agent-sprite-forge`](https://github.com/0x0funky/agent-sprite-forge) — generation-side stabilization ideas: layout-guide images as composition references and fail-loud QC gates that feed regeneration instead of masking defects.

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/hero-comic-dark.webp">
  <img src="./assets/hero-comic-light.webp" alt="Five-panel comic strip of the RepoChan pipeline: 1 Analyze, 2 Persona (checkpoint), 3 Direct, 4 Paint (checkpoint), 5 Page (checkpoint)" width="100%">
</picture>

# RepoChan

**Turn any git repository into a living mascot persona and a consistent visual brand** —

character sheets, icons, stickers, posters, and a landing page — driven by *your* coding agent.

<br/>

[![npm](https://img.shields.io/npm/v/repochan?color=38BDF8&label=npm)](https://www.npmjs.com/package/repochan)
[![license](https://img.shields.io/badge/license-MIT-111827)](../../../LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-34D399)](https://nodejs.org)
[![skills](https://img.shields.io/badge/agent-BYO-F9A8D4)](../../../packages/skill/)

**[English](./README.md) · [中文文档](./README_zh.md) · [Architecture](../../../ARCHITECTURE.md)**

</div>

---

You already use a coding agent (Claude Code, Codex, Pi, Cursor, Hermes, …). RepoChan gives that agent a creative pipeline to run: **analysis → persona → art direction → painting → landing page**. Hard rules live in code (schemas, state machine, dependency gates); creative judgment lives in skills. There is **no embedded runtime** — your agent orchestrates, RepoChan tracks.

This skin tells that pipeline the way it feels from inside the repo: as a five-panel comic.

## The five panels

Every panel of the strip is a real team in the pipeline. The **⏸ chip** marks a checkpoint — the story stops there and waits for your call before the next panel.

<table>
  <tr>
    <td align="center" width="140"><img src="./assets/panel-1.webp" width="120" alt="Panel 1 — Analyze: the mascot scans the repo through a magnifying glass"></td>
    <td>
      <b>1 · ANALYZE</b><br/>
      The analyst reads your repository: deterministic scan (stack, structure, history), then LLM pre-analysis and abstract-dimension profiling.<br/>
      <sub>Artifact: the analysis report under <code>.repochan/</code></sub>
    </td>
  </tr>
  <tr>
    <td align="center"><img src="./assets/panel-2.webp" width="120" alt="Panel 2 — Persona: the mascot thinks, a lightbulb over her head"></td>
    <td>
      <b>2 · PERSONA ⏸</b><br/>
      A three-agent creative team — world architect, character designer, consistency guardian — designs a living mascot persona from the analysis and an optional interview.<br/>
      <sub>Artifact: the persona document · <b>checkpoint: you confirm the persona</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center"><img src="./assets/panel-3.webp" width="120" alt="Panel 3 — Direct: the mascot points ahead, directing the work"></td>
    <td>
      <b>3 · DIRECT</b><br/>
      The art director creates every creative task in one pass — the foundation sheet plus all downstream asset orders — so character consistency is planned, not hoped for.<br/>
      <sub>Artifact: asset orders under <code>.repochan/orders/</code></sub>
    </td>
  </tr>
  <tr>
    <td align="center"><img src="./assets/panel-4.webp" width="120" alt="Panel 4 — Paint: the mascot waits while images generate"></td>
    <td>
      <b>4 · PAINT ⏸</b><br/>
      The painter executes the orders, foundation sheet first; every downstream asset references it, so the brand stays coherent from icon to landing page.<br/>
      <sub>Artifact: versioned order results · <b>checkpoint: you confirm the foundation</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center"><img src="./assets/panel-5.webp" width="120" alt="Panel 5 — Page: the mascot presents the finished site"></td>
    <td>
      <b>5 · PAGE ⏸</b><br/>
      The page designer assembles and localizes a complete landing site, wired with the order-backed assets the painter just drew.<br/>
      <sub>Artifact: the project site · <b>checkpoint: deploy only with your explicit go</b></sub>
    </td>
  </tr>
</table>

How the story is allowed to run:

| Mode | When | Behavior |
|------|------|----------|
| **Wizard (default)** | "Make me a mascot and site" | Full pipeline, stop at checkpoints |
| **yolo** | You explicitly say `yolo` | Default creative decisions inside the authorized scope; external writes still require explicit authorization |
| **Non-interactive** | CI / no TTY | Auto-select local reversible decisions; stop before unauthorized external writes |
| **Per-team (advanced)** | "Only run analysis" / "redraw this order" | Single team skill |

**Visual consistency** is anchored by the **foundation sheet** (character design cover). Every role produces a schema-validated, versioned artifact under `.repochan/` — you can `cat`, `diff`, and `git blame` the whole creative state.

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

See [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) for the package layout, dependency direction, and release contract.

</details>

---

## Props from the set

Everything below was produced by this pipeline for RepoChan itself — the same mascot you just met in the strip.

<table>
  <tr>
    <td align="center" width="50%"><img src="./assets/gallery-foundation.webp" width="360" alt="Foundation sheet — character design cover with palette, motifs, and expressions"><br/><sub><b>foundation sheet</b> · <code>ord-foundation-001</code></sub></td>
    <td align="center" width="50%"><img src="./assets/gallery-stickers.webp" width="360" alt="Sticker and webstate tiles — chibi expressions cut by the chroma-grid pipeline"><br/><sub><b>stickers &amp; webstates</b> · <code>ord-sticker-001</code> / <code>ord-webstates-001</code></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="./assets/gallery-poster.webp" width="360" alt="Memphis-style brand poster featuring the mascot"><br/><sub><b>poster</b> · <code>ord-poster-memphis-001</code></sub></td>
    <td align="center"><img src="./assets/gallery-landing.webp" width="360" alt="Scrollytelling landing starter preview"><br/><sub><b>landing starter</b> · <code>landing-scrollytelling</code></sub></td>
  </tr>
</table>

Grid sheets are generated on a uniform matte with a layout-guide reference, then cut by our own chroma-grid pipeline (soft-alpha unmix, centroid assignment, fail-loud QA) — the same `repochan image edit` commands ship in the CLI. The five hero panels above are stitched from these very tiles by [`assets/build_comic.py`](./assets/build_comic.py) — no extra image generation needed.

## Next issues

Complete, localizable Astro sites — each with slots, locale files, and order-backed assets. `repochan starter pull` any of them:

<table>
  <tr>
    <td align="center"><a href="../../../packages/starters/landing-glitch-os"><img src="./assets/strip-glitch-os.webp" width="220" alt="glitch-os starter preview"><br/><sub>glitch-os</sub></a></td>
    <td align="center"><a href="../../../packages/starters/landing-solarpunk"><img src="./assets/strip-solarpunk.webp" width="220" alt="solarpunk starter preview"><br/><sub>solarpunk</sub></a></td>
    <td align="center"><a href="../../../packages/starters/landing-museum"><img src="./assets/strip-museum.webp" width="220" alt="museum starter preview"><br/><sub>museum</sub></a></td>
  </tr>
</table>

…plus 17 more — see the [starter catalog](../../../packages/starters/README.md).

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

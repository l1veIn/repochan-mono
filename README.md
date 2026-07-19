# RepoChan

[中文文档](./README_zh.md) · [Architecture](./ARCHITECTURE.md)

**Turn any git repository into a living mascot persona and a consistent visual brand** — character sheets, icons, stickers, posters, and a landing page — driven by *your* coding agent.

You already use a coding agent (Claude Code, Codex, Pi, Cursor, Hermes, …). RepoChan gives that agent a creative pipeline to run: analysis → persona → art direction → painting → landing page. Hard rules live in code (schemas, state machine, dependency gates); creative judgment lives in skills. There is **no embedded runtime** — your agent orchestrates, RepoChan tracks.

---

## How it works

You talk to **your agent**. The wizard skill schedules the teams:

```text
① Analyst        → analysis
② Interviewer    → interview (optional)
③ Creative team  → persona
   ⏸ checkpoint: confirm persona
④ Art director   → all orders (foundation + downstream)
⑤ Painter        → foundation first, then downstream with refs
   ⏸ checkpoint: confirm foundation art
⑥ Page designer  → landing page / deploy prep
   ⏸ checkpoint: before deploy
```

| Mode | When | Behavior |
|------|------|----------|
| **Wizard (default)** | "Make me a mascot and site" | Full pipeline, stop at checkpoints |
| **yolo** | You explicitly say `yolo` | Use default creative decisions inside the authorized scope; external writes still require explicit authorization |
| **Non-interactive** | CI / no TTY | Auto-select local reversible decisions; stop before unauthorized external writes |
| **Per-team (advanced)** | "Only run analysis" / "redraw this order" | Single team skill |

**Visual consistency** is anchored by a **foundation sheet** (character design cover). Downstream assets reference it, so the brand stays coherent from icon to landing page.

Every role produces a schema-validated, versioned artifact under `.repochan/`. Nothing is freestyled into the protocol tree — your agent calls CLI subcommands; RepoChan validates and persists. You can `cat`, `diff`, and `git blame` the whole creative state.

---

## Try it

**Prerequisites:** Node.js ≥ 20, a coding agent you already use, and (for image generation) an OpenAI-compatible images endpoint.

```bash
npm install -g repochan
repochan setup                 # installs skills into your agent
repochan image configure       # one-time: image endpoint credentials
```

Then open your coding agent in the project and input `/repochan` to run the RepoChan workflow. Try:

> "Give this repo a mascot and full brand assets"  
> "yolo, full pipeline"  
> "Only analyze this repository"

Run `repochan setup` again after upgrading the CLI so the bundled skills are refreshed; `repochan status` reports version drift when a refresh is needed.

---

## Build from source (contributors)

```bash
pnpm install
pnpm -r build                 # builds core, image-gen, image-edit, cli
pnpm --filter repochan exec node dist/index.js setup
pnpm test                     # full monorepo test suite
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the package layout, dependency direction, and release contract.

---

## Go deeper

| Doc | Contents |
|-----|----------|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Layers, packages, binding model, design principles, known gaps |
| [`docs/releasing.md`](./docs/releasing.md) | Leaf-first release contract |
| [`packages/skill/`](./packages/skill/) | Skill inventory (wizard + team roles) |
| [`packages/core/`](./packages/core/) | Protocol, schemas, business rules |
| [`packages/starters/`](./packages/starters/) | Landing-page starter catalog |

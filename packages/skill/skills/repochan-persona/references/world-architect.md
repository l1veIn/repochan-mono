# World Architect

Starting from repo signals + user intent, build a world within the `projectWeight` **budget**. Budget rules in [project-weight.md](project-weight.md).

## Input

- `projectWeight` (light / medium / heavy)
- Repo soul signals, user constraints / preferences

## Output (Structured Prose, Not JSON Yet)

- **World name**: Poetic, evocative, capturing the repo's essence
- **Core rule** (1–2 sentences): The single law or condition that makes this world distinctive
- **Atmosphere**: Light, rhythm, emotional texture
- **Character role**: The character's stance relative to the world — tension / harmony
- **Visual style recommendations** (2–3 anime/illustration directions + 1-line rationale each) — see below; **not persisted**, only passed to the Character Designer for selecting `artStyle`

## Scale Hints (Not Hard Mismatch)

- **light**: Favor light scale (a room, a workstation, an everyday scene); conceptWeight must not exceed elevated (high forbidden)
- **medium / heavy**: Scale can be large or small — full worlds are valid, **light everyday worlds are equally valid**

By default, the world should be a natural extension of the repo's emotional atmosphere — its rhythm, values, unwritten rules.

## Optional Off-Axis Wildcard

When [preferences.md](preferences.md) pulls toward a creative gamble, add at most one candidate that is genuinely unrelated to the project rather than retrofitting a weak metaphor. Label it `creative bet: off-axis wildcard` and explain the experiential appeal without claiming repo evidence. It remains subject to safety, explicit user constraints, and the `projectWeight` ceiling. If selected, keep the label in downstream handoff so the Guardian and user can judge the leap honestly.

Think: *"If this repo were a place you could walk into, what kind of place would it be?"*
light projects: the place should be small. medium/heavy: can be small or large.

## World Types (Anti-Template = Advisory, Priority Lower Than Fit)

When facing a "data-processing" type repo, the model tends to collapse to "quiet archive/index space" (corridors, bookshelves, floating nodes, warm light). This is a **default collapse** — consciously check for it, but **signal-aligned fit takes priority over forced differentiation**.

**Suggested flow:**

1. List 2–3 candidate world archetypes, each with a 1-line rationale (from repo signals).
2. Choose the one that **best fits the project signals and temperament**.
3. If the archive/index type is ultimately chosen: document the supporting signals in `sourceSignals` — **allowed**, do not reject solely for "resembling an archive."
4. If multiple candidates have similar fit: prefer avoiding pure default templates without signal support.

The optional off-axis wildcard is outside this fit-ranking path. Do not falsely give it a signal rationale; compare it as a deliberate creative leap.

**Do not** discard the best-fitting direction just to "be different from other projects."

### World Archetype Reference Menu (Non-Exhaustive, Originality Encouraged)

| Archetype | Spatial Character | Suitable Repo Types |
|---|---|---|
| Dwelling/Workshop | Cozy everyday space with signs of life | Toolchains, editors, starters |
| Public Space | Marketplace, harbor, theater, station — open, with flow | Gateways, proxies, message queues |
| Natural Ecosystem | Garden, forest, river system — organic, growing | Frameworks, ecosystem projects |
| Transport/Network | Roads, routes, power grids — connection, flow, distribution | Routing, CDN, search |
| Archive/Index | Library, archive, cloister — precise, ordered (common default; use only with signals) | Indexing, documentation systems |
| Otherworld/Conceptual | Crystal hall, data void, liminal space — high concept (**forbidden for light projects**) | Databases, infrastructure (medium/heavy) |
| City/District | Streets, communities, buildings — everyday but layered, may contain supernatural elements | Apps, platforms |
| Theater/Performance | Stage, audience, backstage — performance, display | UI frameworks, visualization |
| Laboratory/Workshop | Experiment bench, prototypes — creation, iteration | Experimental/research projects |
| **Real-World / Contemporary Urban** | **The real world we live in** — no supernatural, no special laws | Everyday, tool-type, projects with strong life atmosphere |

> **Real-World / Contemporary Urban supplementary notes:**
>
> - The real world is too large. Here `world.coreRule` does **not serve the "invent a law" function** — instead, write **location + city type to scope it** (e.g., "an old coffee shop in Tokyo's shitamachi," "an independent studio in Shanghai's Xuhui," "a shared apartment in Seattle's Capitol Hill"). Scoping itself is valid `coreRule` content.
> - May declare "no special rules, follows real-world physics."
> - **Subtle un-ordinariness is an optional atmosphere layer** (e.g., this coffee shop always gets strange weekend orders, a certain drawer always has strange notes) — **not a world law**. Once it escalates to a **law-level** setting like "everyone in this world loses a memory every 7 days," it crosses into high concept and is intercepted by the `light∩high` ceiling.
> - The real world and "City/District" are not the same tier: City/District may contain supernatural/alternate-world settings; real-world may not.

**Atmosphere reminder**: Not every world needs to be "quiet, precise, warm light." Based on project temperament, it can be lively, dynamic, organically growing, even faintly dangerous — choose within budget.

**Anti-default-collapse reminder**: The real world (Real-World / Contemporary Urban) is a legitimate option, not a placeholder for "failed to invent a world" — especially for everyday, tool-type, life-atmosphere-heavy projects. Models tend to default-collapse into alternate worlds (archive rooms, conceptual halls, supernatural districts). In such cases, actively consider whether the real world fits better. Real-world does not equal "lazy" — for a certain class of projects, it is precisely the most compelling choice.

## Visual Style Recommendations (→ Character Designer)

The World Architect has the deepest understanding of atmosphere, light, rhythm, and emotional texture — therefore proposes visual style recommendations for the Character Designer's reference. **Not a persisted field** — only exists in the world description text as upstream input for selecting `artStyle`.

After the world-setting output, append a **visual style recommendations** section:

- Propose **2–3** suitable anime/illustration style directions, each including a style name + 1-line rationale (derived from world/repo signals).
- May combine from orthogonal dimensions (technique + atmosphere + design movement, etc.):
  - **Painting technique**: Thick paint/oil, watercolor, cel-shaded, pixel art
  - **Thematic atmosphere**: Cyberpunk, steampunk, solarpunk, dark gothic
  - **Design movement**: Neo-brutalism, Constructivism, Memphis, Deconstructivism, Glitch art, Art Deco, Minimalism
  - **Cultural/regional**: Ghibli-style, ukiyo-e, ink/sumi-e
- Recommendations must be **project-derived** — e.g., a high-performance cache might suggest "Cyberpunk neon + Glitch art" or "Constructivism + thick paint"; a Markdown editor might suggest "Ghibli watercolor" or "Art Deco + cel-shaded." Cross-dimensional combinations are encouraged.
- **Anti-anchoring**: The 2–3 candidates **must not all be Constructivism variants**. If the project is a dev tool / infrastructure, give at least one **non-Constructivist** direction (Glitch art, Memphis, Solarpunk, Art Deco, Watercolor Minimalism, etc.). "Tool-type" ≠ automatic Constructivism.

# Project Weight Assessment

The World Architect's first step. **Before building a world, assess the project's objective heft: `projectWeight`.**

## Why Assess

**Solely to identify `light` projects and set a ceiling on the dramatic heft (conceptWeight) of the world/character.**

- `medium` / `heavy` do **not mandate** "must pair with heavy concept" — light worldviews and everyday characters are fully valid.
- The assessment is not about pushing every project to high concept.

## Assessment Dimensions

After reading `analysis`, assess across the following dimensions. **Do not equate "not a paradigm-shifting innovation" with "lightweight" — a widely-used mature tool/library starts at medium.**

| Dimension | Light | Medium | Heavy |
|---|---|---|---|
| Code volume | <100 substantive code files, heavy config/templates | 100–1000 substantive code files | >1000 substantive code files |
| Project positioning | starter/template/tutorial demo/single example | utility/library/framework/app (actually used) | infrastructure-level/category-defining/broad impact |
| Adoption breadth | personal/learning use | has real user community | industry standard / ecosystem core |
| Emotional density | README only covers usage | has design philosophy/changelog/community | strong design philosophy + rich history + conceptual articulation |
| Historical depth | new project / few commits | multi-version evolution | long evolution / multiple authors / rich history |

**Judgment rule (dominant dimension, not all must be met):**

- A project meeting **any one row** of "medium" is **at least medium** — do not push it down to light because "it didn't redefine the category."
- A widely-used mature tool (e.g., a high-performance cache framework, web server, CLI search tool), even without an "original philosophy," is **medium at minimum**.
- Only **truly a shell/template/tutorial** is light.

**Typical example calibration:**

- **light**: frontend starter template (shell), single game demo, scaffolding default output
- **medium**: CLI framework, Rust+WASM bundler, Markdown editor, CLI search tool, web server, in-memory database
- **heavy**: Linux kernel, Kubernetes, React framework itself, projects with strong mythic-level design philosophy

## Output

Output `projectWeight`: `light` | `medium` | `heavy`.

Recommended to write into `sourceSignals.supportingSignals` (e.g., `"projectWeight: medium"`) or working memory for the Guardian to re-check.

## conceptWeight (Dramatic Heft)

The design side uses **conceptWeight** to describe the dramatic intensity of the world + character (no need for a separate persisted field; it is expressed through world / occupation / relationship, etc.):

| conceptWeight | Meaning | Example Directions |
|---|---|---|
| **grounded** | Everyday, light | A workstation, an ordinary resident, an apprentice |
| **elevated** | Lightly symbolic | A craftsperson with skill, a guardian with personality, small-scale world rules |
| **high** | High concept / mythic-level | Liminal gatekeeper, mythic messenger, full magic/epic system |

## Mismatch Definition (Single · SSOT)

| Situation | Is It a Mismatch? | Action |
|---|---|---|
| **`projectWeight=light` AND `conceptWeight=high`** | **Yes** | Must lower conceptWeight to grounded or elevated |
| light + grounded / elevated | No | Default correct direction |
| **medium / heavy + grounded (light world / everyday character)** | No | **Allowed**, not a mismatch |
| medium / heavy + elevated / high | No | Allowed |

**In one sentence: only block "small project wearing mythic clothes"; medium/heavy projects may freely pair with light worldviews.**

### Budget Mapping

| projectWeight | conceptWeight Allowed |
|---|---|
| light | grounded, elevated; **high forbidden** |
| medium | grounded, elevated, high |
| heavy | grounded, elevated, high |

### Self-Check (World Architect / Guardian)

> If the project is light: has the world's laws and the character already been mythologized/epic-ized to high? If yes → mismatch, downgrade.

**Do not** judge "medium project uses everyday character" or "heavy project uses light world" as a mismatch.

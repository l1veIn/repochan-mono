# Poster Template Selection & Brand Extension Orders

`poster` has multiple design directions. Treat the character as one element within a graphic design system, rather than defaulting to the character filling the frame.

## Available Poster Templates

| Template ID | Vibe / Keywords (for matching artStyle) |
|-------------|-----------------------------------------|
| `official/poster-constructivist` | Constructivism, industrial, geometric order, functionalism, diagonal composition, red-black-white |
| `official/poster-glitch-art` | Glitch art, digital distortion, neon, cyber, pop-electronic, screen aesthetic |
| `official/poster-risograph-pop` | Retro print, risograph, warm and approachable, community, light creative, paper texture |
| `official/poster-memphis` | Memphis, clashing colors, geometric decoration, youthful and lively, asymmetric, high saturation |
| `official/poster` | Neutral fallback **only** when none of the above four fit (use sparingly) |

> Don't automatically equate "tooling / infrastructure / open-source software" with Constructivism. Developer tools can also be glitch, Memphis, or risograph.

## Curation Algorithm (Forced Order)

When creating a `poster` order, **pick `templateId` using the three steps below** (don't go by preference or default to the first row of the table).

### 1. Read `persona.artStyle` (Primary Signal)

Do keyword matching against the full `artStyle` text (Chinese, English, and near-synonyms all count):

| artStyle contains... | Preferred template |
|----------------------|--------------------|
| construct / constructivist / industrial geometry / functionalism | `poster-constructivist` |
| glitch / cyber / neon / digital pop / electronic distortion | `poster-glitch-art` |
| Memphis / clashing-color geometric decoration / pop lively | `poster-memphis` |
| retro print / risograph / warm paper texture / community approachable / Art Deco warm-leaning | `poster-risograph-pop` |
| Art Deco (no closer dedicated template) | Prefer `poster-risograph-pop`, fallback `poster-memphis` |

**Match found** → Use that template, write a one-line reason in the order `brief` or notes:  
`templateReason: artStyle "..." keyword "..." → ...`

### 2. No Clear Keyword → Project Vibe as Weak Hint Only (Forbidden: Default to Constructivist)

Only when artStyle has **no match at all** against the table above, look at project vibe, and **do not** map "CLI / middleware / system tool" uniformly to Constructivist:

| Vibe | Consider |
|------|----------|
| Strongly digital/AI/graphics/real-time media | glitch-art |
| Docs/editor/content creation, approachable-leaning | risograph-pop |
| Design system, lively brand, Material/lively UI | memphis |
| Genuinely emphasizes industrial order, diagonal composition aesthetic (and artStyle is also neutral) | constructivist |

### 3. Still No Clear Match → Deterministic "Pseudo-Random" (Forbidden: Always Picking the Same One)

Pick from the four **dedicated** templates:  
`poster-constructivist | poster-glitch-art | poster-risograph-pop | poster-memphis`  
(Do **not** prefer `official/poster`.)

Deterministic selection method (reproducible, dispersed across projects):

1. Concatenate `orderId` + project name (or repo name from `analysis`) into a string  
2. Sum the character codes, modulo **4**  
3. 0→constructivist, 1→glitch-art, 2→risograph-pop, 3→memphis  

Write the reason as: `templateReason: artStyle has no clear poster direction; selected ... via orderId hash to maintain diversity`.

### Prohibited

- Defaulting to `poster-constructivist` because it's a "tooling repo"
- Always picking the first row of the table without reason
- Ignoring "Memphis / glitch / constructivist / ..." already stated in `artStyle`

## Brand Extension Orders (signaturePatterns / signatureScenes)

After reading the persona (`repochan persona get`), if brand extension fields are defined, proactively propose:

- **`signaturePatterns`**: For each pattern, generate a **standalone 1x1 4-way seamless texture** order, `assetType: "visual_pattern"` + `templateId: "official/pattern-tile"` (page backgrounds / borders / social card textures). Each image is generated independently and directly usable — no slicing needed. **See hard constraints in that template**: single seamless tile, bleeds to edges, 4-way seamless.
- **`signatureScenes`**: 1–2 `poster` or background-type orders, brief referencing the scene, with poster template selected per the curation algorithm above.

These orders **must still reference the foundation**. Don't create downstream orders without a foundation sheet reference, unless the user explicitly requests anchor-less assets.

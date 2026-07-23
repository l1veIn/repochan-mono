# analysis / persona / README Data Mapping

## CLI Automatic Projection

`repochan starter configure` handles mechanical field mapping:

| Source | `repochan/site.json` |
|---|---|
| analysis project name | `project.name` |
| analysis summary | `project.description` |
| analysis repository URL | `project.repositoryUrl` |
| `persona.mainColor` | `theme.primary` |
| `persona.secondaryColor` | `theme.base` |
| `persona.accentColors[]` | `theme.accents[]` |
| highest-contrast color against `theme.base` in persona palette | `theme.ink` |
| `persona.artStyle` | `brand.artStyle` |
| `persona.keyMotifs` | `brand.motifs` |
| `persona.signaturePatterns` | `brand.patterns` |

`theme.ink` is the human-readable foreground color auto-derived by CLI/Core; the Starter uses it for body text, dark sections, and button text. Do not let the Page Designer manually rearrange the palette. Do not manually copy these fields, nor modify `src/lib/site.ts`.

## Agent-Authored Fields

Locale content — headlines, body, CTAs, selling-point ordering, tags, and translations — requires content judgment:

- The analysis summary is for understanding project positioning; do not use it directly as the final headline.
- The README's features, installation, and usage sections are the primary factual source for project copy.
- The persona provides visual tone; `catchphrase` should only be decorative and must not replace project value.
- `characterFlaws`, `hobbies`, `backstory` do not go into project feature copy.

Every content payload must use the `repochan.starter-content.v1` envelope and maintain complete structural parity with the corresponding source locale: keys, value types, and array lengths must not drift. Write via `starter configure --content-file ... --overwrite`.

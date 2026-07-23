# Copy Principles, Structure Decisions, and Common Pitfalls

## Copywriting Principles

1. **hero headline is project value** — not the character's catchphrase, not technical jargon. e.g., "Turn your repo into a mascot," not "Rael's Phase Observatory."
2. **Write only what the starter actually consumes** — do not generate backup copy for sections that don't exist.
3. **CTA is project-facing** — "Star on GitHub," "View docs," "Get started." Not "Meet Rael."
4. **Follow README language** — Chinese README → Chinese copy, English README → English copy, while providing editable translations for other locales declared in the manifest.


## Page Structure Decisions

A Starter's structure is a chosen design constraint. When populating, only adapt content and adjust responsive parameters that the starter explicitly exposes; do not add undeclared sections on your own. If the user needs a different information architecture, switch starters or hand off to `repochan-web-designer`, rather than inflating a minimal starter into a comprehensive template.


## Common Pitfalls

- ❌ Turn the page into a character showcase — this is a **project landing page**; the character is only brand decoration
- ❌ Put the Foundation Sheet in the hero — the Foundation Sheet is not a hero illustration
- ❌ Write persona content in features/stats — these sections showcase the **project's** features and data
- ❌ Use the character's catchphrase as the hero headline — use the project's value proposition
- ❌ Add vague sections to a hero-only starter to make it look complete
- ❌ Use the Starter's `source` character assets directly as current project customization, or manually forge `customized` — this creates identity mismatch and is not reproducible

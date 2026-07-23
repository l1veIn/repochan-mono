# Examples: Signal-driven Question Design

Suppose the analysis report shows:
- `preAnalysis.project_category`: "dev_tool"
- `abstract.product_philosophy.score`: 0.85, keywords: ["pragmatic", "minimal"]
- README tone: concise, engineering-oriented, occasional humor

**Good questions** (derived from specific signals):

```json
[
  {
    "question": "Analysis shows this project's product philosophy is \"pragmatic + minimal\" (score=0.85). Which direction should the character's personality base lean towards?",
    "header": "Character tone",
    "options": [
      { "label": "Cool & minimal (Recommended)", "description": "Restrained like a terminal interface — few words but precise" },
      { "label": "Warm & reliable", "description": "Like a dependable partner, steady but not cold" },
      { "label": "Quirky genius", "description": "Occasional unexpected humor, but fundamentally serious" }
    ],
    "multiSelect": false
  },
  {
    "question": "The analysis namingSeeds show the repo/product name contains ModelCraft, and core domain terms include model, schema, blueprint. How should the character name inherit this repository identity?",
    "header": "Name origin",
    "options": [
      { "label": "Anthropomorphize repo name (Recommended)", "description": "Derive a short name or nickname from ModelCraft, making the name traceable back to the project" },
      { "label": "Name from domain concepts", "description": "Extract a name from core concepts like model / schema / blueprint / graph" },
      { "label": "Short name + project title", "description": "The character has a short name while keeping ModelCraft as a title or epithet" }
    ],
    "multiSelect": false
  }
]
```

**Bad questions** (generic, not signal-derived):

```json
[
  {
    "question": "What style of character do you want?",
    "header": "Style",
    "options": [
      { "label": "Cute", "description": "Very cute" },
      { "label": "Cool", "description": "Very cool" }
    ]
  }
]
```

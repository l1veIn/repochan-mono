# Interview Report Distillation and Recording Format

## Distilling the Interview Report

After collecting all responses, use your own judgment to distill four fields:

1. **summary**: A paragraph summarizing the user's overall intent. Not a list of responses, but your synthesized judgment after understanding them.
   - Example: "The user wants a grounded, everyday-tier character with a calm librarian temperament, serving as a brand mascot for the developer community, with a minimal Japanese-inspired visual direction and no cutesy exaggerated elements. The user mentioned liking Violet Evergarden's 'doesn't understand emotions but tries hard to learn' earnestness, but this character should be more down-to-earth and everyday."

2. **keyConstraints** (hard constraints): Conditions the user explicitly stated that must be followed.
   - Example: "Character apparent age no younger than 20" / "Must use cool-toned main color" / "No cutesy elements like animal ears" / "Character weight class must be everyday tier"

3. **preferences** (soft constraints): Preferences the user expressed — try to satisfy but not hard requirements.
   - Example: "Prefers gradient hair color" / "If possible, incorporate version-control-related visual motifs" / "User likes Violet Evergarden's earnest and responsible trait — absorb this personality direction but do not copy the character" / "World complexity leans toward weak-rule / atmosphere-only"

4. **avoidList** (forbidden list): Things the user explicitly said they don't want.
   - Example: "No cyberpunk style" / "No code/terminal-related visual symbols" / "No overly revealing clothing" / "No high-concept / savior-type characters"

### Distillation Rules

- Only put content the user **explicitly stated** into keyConstraints and avoidList. Do not infer hard constraints yourself.
- preferences may include soft preferences you reasonably infer from responses.
- summary must cover all key responses; do not omit directions the user explicitly stated.


## Building the Questions and Responses Record

You need to convert ask_user_question questions and answers into the interview report's `questions` and `responses` arrays.

### questions Array

Record each question as:

```json
{
  "id": "q1-tone",
  "question": "Original question text?",
  "header": "Character tone",
  "category": "tone",
  "rationale": "README tone is engineering-oriented; abstract.product_philosophy score=0.8 shows the project values pragmatism",
  "options": [
    { "label": "Calm & professional", "description": "Calm demeanor like a librarian" },
    { "label": "Lively & warm", "description": "..." }
  ],
  "multiSelect": false,
  "optional": true
}
```

### responses Array

Record each response as:

```json
{
  "questionId": "q1-tone",
  "kind": "option",
  "answer": "Calm & professional",
  "selected": null,
  "notes": null
}
```

Mapping rules:
- ask_user_question `kind: "option"` → interview `kind: "option"`, `answer` = option label
- ask_user_question `kind: "custom"` → interview `kind: "custom"`, `answer` = input text
- ask_user_question `kind: "multi"` → interview `kind: "multi"`, `answer: null`, `selected` = tag array
- ask_user_question `kind: "chat"` → interview `kind: "skipped"`, `answer: null`
- ask_user_question `cancelled: true` → all unanswered questions recorded as `kind: "skipped"`


## Saving the Interview Report

### First Creation

```
repochan interview create <<'EOF'
{
  "interview": {
    "questions": [...],
    "responses": [...],
    "summary": "Summary of user intent...",
    "keyConstraints": ["Hard constraint 1", "Hard constraint 2"],
    "preferences": ["Soft preference 1", "Soft preference 2"],
    "avoidList": ["Forbidden item 1", "Forbidden item 2"]
  }
}
EOF
```

### Append (add Q&A rounds)

If the user chooses to supplement an existing interview:

```
repochan interview append <<'EOF'
{
  "questions": [new questions...],
  "responses": [new responses...],
  "summary": "Updated consolidated summary",
  "keyConstraints": ["Updated hard constraint 1"],
  "preferences": ["Updated soft preference 1"],
  "avoidList": ["Updated forbidden item 1"]
}
EOF
```

`interview.append` will:
- Append new questions and responses to existing arrays
- **Replace** summary, keyConstraints, preferences, avoidList (so you must re-distill a consolidated version covering both old and new responses)
- Archive the pre-append state to versions/

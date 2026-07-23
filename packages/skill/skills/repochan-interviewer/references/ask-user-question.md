# Using the ask_user_question Tool

`ask_user_question` comes from the `@juicesharp/rpiv-ask-user-question` extension.

### Schema

```json
{
  "questions": [
    {
      "question": "Full question text, ending with ?",
      "header": "Short label (≤16 chars)",
      "options": [
        { "label": "Option A (1-5 words, ≤60 chars)", "description": "What this option means" },
        { "label": "Option B", "description": "..." }
      ],
      "multiSelect": false
    }
  ]
}
```

### Calling Rules

- **Max 4 questions per call**. If you designed 8 questions, split into two batches.
- Each question **2-4 options**. Users can always type freely (the "Type something." line is auto-appended).
- If you recommend an option, put it first and append "(Recommended)" after the label.
- **Do not fire multiple ask_user_question calls back-to-back**. Ask one batch, wait for responses, then ask the next batch.
- `multiSelect: true` for multi-select scenarios (e.g., "Which visual elements should the character include?"). The free-text line is suppressed in multi-select mode.

### Response Format

The tool returns `details.answers` as an array, each element:

```json
{
  "questionIndex": 0,
  "question": "Original question text",
  "kind": "option",          // "option" | "custom" | "chat" | "multi"
  "answer": "The option label",    // The option label when selected, input text when custom, null when multi
  "selected": ["Tag 1", "Tag 2"],  // multi kind only
  "notes": "User notes"          // Optional
}
```

- `kind: "option"` → User selected a preset option
- `kind: "custom"` → User entered free text
- `kind: "multi"` → User selected multiple options
- `kind: "chat"` → User wants to abandon the questionnaire for free chat — treat as skipped
- `cancelled: true` → User cancelled the entire questionnaire — treat all as skipped

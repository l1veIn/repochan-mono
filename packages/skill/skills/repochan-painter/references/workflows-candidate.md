# Candidate Workflow: Multi-Option Generation

In the normal flow, each `repochan order create-result` directly sets the new version as current and delivers. But sometimes the user wants to see **several alternatives** before deciding — "give me three versions with different expressions to choose from."

For this scenario, use candidate state: each alternative version id is recorded in the order's `candidateVersions`, not promoted, not delivered; after the user/AD chooses, promote one as current.

### When to Use

- **User explicitly requests multiple options** — "give me a few options", "try two different compositions."
- **Image generation needs user control due to cost** — do not default to generating multiple candidates. Each generation has time and API cost; the candidate count is determined by the user.

Do not proactively suggest candidate state. Only use it when the user requests it.

### Flow

1. **Use `order candidate create` for each alternative** (not `order create-result`):
   ```bash
   repochan order candidate create <<'EOF'
   {
     "orderId": "<orderId>",
     "versionId": "c1",
     "files": ["<generated image path>"],
     "generationPrompt": "<prompt>",
     "notes": "Candidate A: warm tones"
   }
   EOF
   ```
   Each candidate uses a different versionId (e.g., c1, c2, c3). They do not change the order's `currentVersion` or `status` — the order stays in its current state, candidates are only recorded as alternatives.

2. **User/AD can first review each candidate** (optional):
   ```bash
   repochan review create <<'EOF'
   { "orderId": "<orderId>", "versionId": "c1", "verdict": "pass", "notes": "..." }
   EOF
   ```
   Reviews work directly on candidates; core strictly reads their `meta.json` and actual delivery files.

3. **After user selects, promote one as current**:
   ```
   repochan order candidate promote <orderId> <versionId>
   ```
   Example: `repochan order candidate promote ord-readme-hero-001 c2`
   Promote only updates the order's `currentVersion`, `candidateVersions`, and delivery status; all version `meta.json` stays unchanged, and the previous current naturally becomes a historical result.

4. **What to do with unselected candidates**: Leave them. They are historical records of "alternatives" — the user may change their mind. No need to proactively delete or archive.

### Candidate State vs Review Loop

These two workflows solve different problems:
- **Candidate state**: Not yet finalized, generate multiple options for the user to **make an initial choice**.
- **Review loop**: Already finalized and delivered, modify based on user feedback (**image-to-image**).

The two can be combined: first use candidate state to pick one, then after promotion the user reviews and gives feedback for revision.

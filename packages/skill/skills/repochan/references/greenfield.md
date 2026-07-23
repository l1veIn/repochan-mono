# Greenfield: new project from scratch

When the user wants to create a brand new project (no existing repo, no code yet), RepoChan runs a modified pipeline that starts with project intent extraction and converges back to the standard pipeline after the persona checkpoint.

**Core principle**: the greenfield pipeline differs only in the *upstream* (analysis source). Once a valid analysis artifact exists and the persona is confirmed, everything downstream (art director → painter → page designer → deploy) is identical to the standard pipeline. The convergence point is the persona checkpoint.

## Greenfield pipeline

```
① Bootstrap repo      → mkdir <temp-name> && cd <temp-name> && git init && repochan init
     ↓                   (temp-name derived from user's description; can be renamed at checkpoint)
② Seed analysis stub  → construct minimal analysis from user's description, write via CLI
     ↓
③ Interviewer         → greenfield mode: extract project intent, enrich signals
     ↓                   repochan interview create (persisted — .repochan/ already exists!)
④ Update analysis     → repochan analysis update with richer interview signals
     ↓
⑤ Creative Team       → repochan-persona → build persona (repochan persona create, persisted)
     ↓
⑥ ⏸ Checkpoint 1: persona + suggested final repo name → user confirms
     ↓                   if name changed: rename directory
⑦ [Everything below is identical to the standard pipeline]
   Art Director → Painter → Page Designer → Deploy
```

**Key design decision — bootstrap before interview, not after**: By creating the directory and running `repochan init` first, the `.repochan/` protocol directory exists from the start. This means the interview report, analysis stub, and persona are all **properly persisted** via standard CLI commands — no floating context-only artifacts. The working directory name is temporary; the user can rename it at the checkpoint.

## Greenfield analysis stub (two-pass)

Since `repochan interview create` and `repochan persona create` both require a valid analysis artifact, you must write one **before** running the interview. Use a two-pass approach:

**Pass 1 — Seed stub (before interview):**
Construct a minimal analysis from the user's initial project description alone. This stub only needs to satisfy the schema validator so the interview can be created.

**Pass 2 — Enrich (after interview):**
Update the stub with richer signals from the interview responses.

### Pass 1 procedure

1. Extract what you can from the user's initial description: project category, key terms, naming hints.
2. Construct and write the seed stub:
   ```bash
   repochan analysis update --data-file /tmp/greenfield-analysis.json
   ```
   If `analysis update` fails because no analysis exists yet (the command may require an existing artifact), write the file directly as a one-time bootstrap exception:
   ```bash
   mkdir -p .repochan/analysis/versions
   cat > .repochan/analysis/current.json << 'ENDOFFILE'
   { ... greenfield analysis stub JSON ... }
   ENDOFFILE
   ```
   This is the **only place** in the entire RepoChan pipeline where an agent directly writes a protocol file. It is justified because the greenfield scenario has no upstream analysis to update — it must be seeded. All subsequent protocol writes use standard CLI commands.

### Pass 2 procedure

1. After the interview completes, read the interview report (`repochan interview get`).
2. Update the analysis stub with richer signals and write via CLI:
   ```bash
   repochan analysis update --data-file /tmp/greenfield-analysis-enriched.json
   ```

### Minimal valid greenfield analysis stub

```json
{
  "schemaVersion": "repochan.analysis.v1",
  "generatedAt": "<ISO timestamp>",
  "context": {
    "basic": {
      "project_name": "<name candidate from interview>",
      "source": "greenfield",
      "readme_exists": false,
      "has_git": false
    },
    "identity": {
      "namingSeeds": {
        "primary": ["<keyword1>", "<keyword2>", "..."],
        "secondary": [],
        "rationale": ["Greenfield project — signals extracted from user interview"]
      }
    },
    "file_structure": {},
    "inventory": {},
    "tech_stack": {},
    "pre_analysis": {},
    "git_profile": { "has_git": false },
    "docs_narrative": {},
    "github_meta": {},
    "color_palette": {},
    "core_samples": {},
    "deterministic_tooling": {}
  },
  "persona": null,
  "error": null,
  "preAnalysis": {
    "source": "greenfield-interview",
    "userIntent": "<1-2 sentence summary of what the user wants to build>",
    "projectCategory": "<category from interview: CLI tool / web app / library / ...>"
  },
  "abstract": {
    "source": "greenfield-interview",
    "tonePreference": "<tone from interview: playful / serious / minimalist / ...>",
    "targetAudience": "<audience from interview>"
  }
}
```

### Field population rules (Pass 1 — seed)

- `basic.project_name`: Derive a working slug from the user's project description.
- `identity.namingSeeds.primary`: Extract 3-5 key terms from the user's initial description.
- `preAnalysis.userIntent`: The user's own words about what they're building.
- `preAnalysis.projectCategory`: Map the user's description to a category label (CLI tool / web app / library / mobile app / desktop app / game / other).
- All other `context.*` fields: leave as empty objects `{}`.

### Field population rules (Pass 2 — enrich)

- `preAnalysis.userIntent`: Refine with interview insights.
- `abstract.tonePreference` / `abstract.targetAudience`: Populate from interview responses.
- `identity.namingSeeds`: Add any new keywords from the interview.
- Other fields: populate as interview signals allow.

## Repo bootstrapping (step ①)

Create the working directory before any artifacts are written:

```bash
# Derive a working name from the user's description
mkdir <working-name>
cd <working-name>
git init
repochan init
```

The working name is provisional. Common derivation: slugify the most distinctive keyword from the user's description. The user renames at Checkpoint 1 if desired.

# Greenfield: new project from scratch

For a new project, use the user's stated intent as creative input while keeping repository facts distinct. After a valid analysis and confirmed persona exist, continue through Art Director → Painter → Starter Localizer, or the explicitly requested Web Designer branch. Deployment still follows the user's authorization.

## Bootstrap and establish analysis

Create the working directory only when the user has asked to start a new project. Derive a provisional name from the description; inspect an existing directory before reusing it.

```bash
mkdir <working-name>
cd <working-name>
git init
repochan init
repochan analysis run
repochan analysis get --full --json
```

`analysis run` creates the schema-valid artifact through CLI/core even for an empty repository. Preserve its measured file inventory, git state, timestamps, and protocol metadata. If analysis already exists, read and reuse it; do not overwrite it merely to restart the greenfield flow.

Then add the user's project intent with `analysis update --overwrite`. The flag is required when updating existing analysis; a payload field alone is not a substitute.

```bash
repochan analysis update --overwrite <<'EOF'
{
  "patch": {
    "preAnalysis": {
      "source": "greenfield-user-intent",
      "summary": "Planned project: <the user's stated project purpose>",
      "project_category": "<category supported by the description>"
    }
  }
}
EOF
```

Use a patch rather than reconstructing the whole artifact. `preAnalysis.summary` and `project_category` match the Analyst's existing enrichment vocabulary; `source` and the planned-project wording distinguish intent from measured repository facts. Starter configuration can consume this summary. Never hand-write `.repochan/` files. If scan or update fails, report the CLI error and resolve it before proceeding to dependent roles.

## Interview and enrich

1. Dispatch Interviewer in greenfield mode with the project description. It reads the seeded analysis and saves the interview through `repochan interview create`.
2. Read the saved report with `repochan interview get --json`.
3. Update only the fields supported by the user's answers:

```bash
repochan analysis update --overwrite <<'EOF'
{
  "patch": {
    "preAnalysis": {
      "source": "greenfield-interview",
      "summary": "Planned project: <purpose refined from the user's answers>",
      "project_category": "<confirmed category>"
    },
    "abstract": {
      "source": "greenfield-interview",
      "tonePreference": "<expressed tone preference>",
      "targetAudience": "<expressed target audience>"
    }
  }
}
EOF
```

Omit unexpressed preferences. Keep repository-derived naming seeds; add interview naming terms only when the user supplies them, with their provenance recorded. If the interview is skipped, use the initial project description and record no fabricated interview.

## Persona checkpoint and continuation

Creative Team consumes the analysis and optional interview, creates the persona through the CLI, and presents it at Checkpoint 1. RepoChan's greenfield naming convention is to suggest the mascot's name as the project name; the user's existing name or naming preference takes precedence. Rename the working directory only after the user chooses that name. If the repository facts need a rescan afterward, use `repochan analysis run --overwrite` and reapply the recorded intent patch; do not fabricate metadata.

After confirmation, use the normal downstream workflow: commission orders, generate the foundation first, show it at Checkpoint 2, then create matching assets and the requested website. Original website design and Starter productization remain explicit branches.

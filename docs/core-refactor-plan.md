# @repochan/core Refactor Plan

> **Executor**: Pi coding agent  
> **Reviewer**: Grok orchestrator (not the implementer)  
> **Scope**: `packages/core` refactor + minimal `packages/pi` wiring updates  
> **Do NOT** change CLI, creative skills, or protocol on-disk layout.

## Goals

1. **Structure**: Split the 744-line `analysis.ts` monolith into focused modules without changing external behavior.
2. **Less wheel-reinvention**: Replace hand-rolled file/git utilities with mature npm libraries where safe.
3. **Clearer API**: Add typed analysis artifacts and move analysis **write/version** logic into core so `analysis.run` semantics live in one place.
4. **Testability**: Add unit tests per analysis submodule; keep all existing tests green.

## Hard Constraints (from `Agents.md`)

- `packages/core` stays a **pure library**: no Pi imports, no `ExtensionContext`, no agent prompts.
- Preserve `.repochan/` on-disk protocol and existing public `repochan` action/params shapes.
- `performAnalysis(projectRoot, options)` must remain exported from `@repochan/core` (backward compatible).
- `AnalyzeSchema` must remain exported and unchanged in shape.
- Run `pnpm --filter @repochan/core test` before finishing; all tests must pass.
- Run `pnpm --filter @repochan/core build` before finishing; must compile cleanly.

## Non-Goals (this pass)

- Do not add external CLI dependencies (`tokei`, `scc`, `gitleaks` binaries).
- Do not tighten `AnalysisArtifactSchema` to strict TypeBox (types in TS only for now).
- Do not refactor `entities.ts` or `validation.ts` beyond import path updates.
- Do not change `repochan.analysis.v1` field names or semantics.

---

## Target Directory Layout

```text
packages/core/src/
  analysis/
    index.ts              # re-export public API: performAnalysis, AnalyzeSchema, types, writeAnalysisArtifact
    schema.ts             # AnalyzeSchema + AnalyzeInput (moved from analysis.ts)
    types.ts              # AnalysisResult, AnalysisContext, GitProfile, etc.
    walk.ts               # project file walk (uses ignore + fast-glob)
    git-profile.ts        # git log parse + computeGitProfile (uses simple-git)
    tech-stack.ts         # detectFrameworks, detectProjectType, buildSystem, packageManager, findEntryPoints, inferProjectCategory
    colors.ts             # extractThemeColors, hex/rgb helpers
    desensitize.ts        # SENSITIVE_PATTERNS + desensitize
    sample.ts             # sampleCoreCode, guessLanguage
    inventory.ts          # collectInventory, docsNarrative, detectDependencies
    abstract.ts           # heuristicAbstract
    assemble.ts           # performAnalysis orchestrator only
    write-artifact.ts     # writeAnalysisArtifact (new)
  analysis.ts             # DEPRECATED thin re-export → ./analysis/index.js (keep for stable deep imports if any)
  ... (protocol, entities, validation, utils, schemas, types unchanged)
```

Delete the old monolithic implementation from root `analysis.ts`; replace with:

```ts
export * from "./analysis/index.js";
```

Update `src/index.ts` if needed (should still `export * from "./analysis.js"`).

---

## Phase 1 — Module split (no new deps)

**Task**: Pure file move + import wiring. Behavior must be identical.

1. Create `packages/core/src/analysis/` and move functions into modules per layout above.
2. Keep all constants (`HARD_IGNORE_DIRS`, `TEXT_EXTS`, etc.) in the module that uses them; export only what tests need.
3. `assemble.ts` contains only `performAnalysis` orchestration — no helper implementations inline.
4. Ensure `packages/pi/extensions/analyze.ts` and `unified.ts` still import from `@repochan/core` without path changes.
5. Run tests after this phase.

**Acceptance**: `pnpm --filter @repochan/core test` passes; output JSON from `performAnalysis` on fixture project is structurally the same as before (same top-level keys).

---

## Phase 2 — Add typed analysis artifacts

**Task**: Add TypeScript types (not strict runtime validation).

Create `packages/core/src/analysis/types.ts`:

```ts
export type GitChangedFile = { file: string; commits: number; lines: number };

export type GitProfile = {
  has_git: boolean;
  branch?: string;
  dirty?: boolean;
  dirty_file_count?: number;
  remotes?: string[];
  total_commits?: number;
  total_authors?: number;
  first_commit_date?: string;
  last_commit_date?: string;
  commits_per_week?: number;
  commits_per_author?: number;
  night_commit_ratio?: number;
  weekend_commit_ratio?: number;
  busiest_hour?: number;
  avg_files_per_commit?: number;
  avg_lines_per_commit?: number;
  merge_commit_ratio?: number;
  top_changed_files?: GitChangedFile[];
  commit_message_themes?: Record<string, number>;
  recent_commits?: Array<{ hash: string; date: string; message_summary: string }>;
};

export type AnalysisContext = {
  basic: Record<string, unknown>; // keep loose for now except document known keys in JSDoc
  file_structure: Record<string, unknown>;
  inventory: Record<string, unknown>;
  tech_stack: Record<string, unknown>;
  pre_analysis: Record<string, unknown>;
  git_profile: GitProfile;
  docs_narrative: Record<string, unknown>;
  github_meta: Record<string, unknown>;
  color_palette: Record<string, unknown>;
  core_samples: Record<string, unknown>;
  deterministic_tooling: Record<string, unknown>;
  abstract?: Record<string, unknown>;
};

export type AnalysisResult = {
  schemaVersion: "repochan.analysis.v1";
  generatedAt: string;
  context: AnalysisContext;
  persona: null;
  error: null;
};
```

- Type `performAnalysis` return as `Promise<AnalysisResult>`.
- Type internal functions where easy (`parseGitLog`, `computeGitProfile`, etc.).
- Export types from `analysis/index.ts` and root `analysis.ts` re-export.

**Acceptance**: `tsc --noEmit` clean; no `any` added to new type definitions.

---

## Phase 3 — Replace hand-rolled utilities with npm libs

Add to `packages/core/package.json` dependencies:

| Package | Purpose | Replace |
|---------|---------|---------|
| `ignore` | `.gitignore` parsing | `readGitignore`, `globToRegExp`, `matchesAny` |
| `fast-glob` | file walking with ignore | `walkProject` recursive readdir |
| `simple-git` | git commands | `gitExec`, `analyzeGit` shell calls |

### walk.ts

- Use `ignore` package to load `.gitignore` + apply `HARD_IGNORE_DIRS` as additional ignore patterns.
- Use `fast-glob` with `cwd: projectRoot`, `absolute: true`, `onlyFiles: false` or separate file/dir passes.
- Preserve existing ignore semantics:
  - Always skip `.git`, `node_modules`, `dist`, `build`, `.repochan` (except protocol dir name constant), dotfiles (except allow protocol if needed — current code skips dotfiles except PROTOCOL_DIR; keep that behavior).
  - Return `{ dirs: string[], files: string[] }` with same relative-path usage downstream (absolute paths internally OK if `rel()` still works).

### git-profile.ts

- Use `simple-git` instead of `execFile('git', ...)`.
- Keep the same `git log` format or equivalent output so `parseGitLog` / `computeGitProfile` metrics unchanged.
- Preserve `maxBuffer` behavior for large repos (simple-git has log options).

**Acceptance**: Existing `analysis.test.ts` passes without modification (or with only import path updates). Add focused unit tests:

- `walk.test.ts` — respects `.gitignore`, skips `node_modules`, skips `.repochan` content
- `git-profile.test.ts` — `parseGitLog` with fixture string; `computeGitProfile` night/weekend ratios
- `desensitize.test.ts` — API key and JWT redaction

Run `pnpm --filter @repochan/core test`.

---

## Phase 4 — `writeAnalysisArtifact` in core

**Task**: Move analysis persistence from Pi into core.

Create `packages/core/src/analysis/write-artifact.ts`:

```ts
export type WriteAnalysisInput = AnalyzeInput & {
  analysis?: Record<string, unknown>; // analyst merge patch
};

export async function writeAnalysisArtifact(
  projectRoot: string,
  params: WriteAnalysisInput,
): Promise<{ path: string; data: AnalysisResult }>;
```

Behavior (must match current `packages/pi/extensions/unified.ts` `runAnalysis`):

1. `initProtocol(projectRoot)`
2. Target: `.repochan/analysis.json`
3. If exists and `!params.overwrite` → throw same style error message
4. If exists and `params.versionPrevious !== false` → archive prior to `analysis.versions/<stamp>.json`
5. Call `performAnalysis(projectRoot, params)`
6. Merge `params.analysis` object if plain object
7. Set `schemaVersion: "repochan.analysis.v1"`, `generatedAt: stamp()`
8. `writeJson(target, data, overwrite)`
9. Return `{ path: relative protocol path, data }`

Update `packages/pi/extensions/unified.ts`:

- Import `writeAnalysisArtifact` from `@repochan/core`
- Replace `runAnalysis` body with thin wrapper calling core helper
- Keep same user-facing error strings and return shape (`ok("Analyzed repository...", data)`)

**Acceptance**:

- `pnpm --filter @repochan/core test` passes
- Add `write-artifact.test.ts` covering overwrite guard + version archive
- Pi package still builds: `pnpm --filter @repochan/pi build` if that script exists, else `tsc` for pi package

---

## Phase 5 — Documentation & cleanup

1. Update `packages/core/README.md` — document:
   - `analysis/` module layout
   - `performAnalysis` vs `writeAnalysisArtifact`
   - New exported types
2. Remove dead code / duplicate helpers after lib migration.
3. Ensure no circular imports in `analysis/`.
4. Final verification:

```bash
cd repochan-mono
pnpm --filter @repochan/core test
pnpm --filter @repochan/core build
```

---

## Review Checklist (for Grok reviewer)

- [ ] `analysis.ts` at src root is only re-export
- [ ] No Pi imports inside `packages/core`
- [ ] `performAnalysis` + `AnalyzeSchema` still exported from package root
- [ ] `writeAnalysisArtifact` exported and used by pi `unified.ts`
- [ ] New deps: `ignore`, `fast-glob`, `simple-git` only in core
- [ ] Tests added for walk, git-profile, desensitize, write-artifact
- [ ] All core tests pass
- [ ] No changes to `repochan` action names or param shapes
- [ ] `repochan.analysis.v1` output shape unchanged (field names preserved)

---

## Implementation Notes for Pi

- Work on a feature branch: `refactor/core-analysis-structure`
- Make small commits per phase if possible.
- When splitting files, copy code first, then delete originals — avoid behavior drift.
- Prefer `import` from `../protocol/index.js` patterns consistent with existing core code.
- Use `.js` extensions in TypeScript imports (existing convention).
- If `fast-glob` dir listing differs from old walker, add adapter in `walk.ts` until tests pass — do not change downstream consumers.

## If Blocked

- If `simple-git` log output format differs, keep `execFile` for log only but still use simple-git for branch/remote/status — document in commit message.
- If glob migration changes file counts, fix ignore rules before proceeding; do not weaken `.repochan` exclusion.
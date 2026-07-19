import type { StoredAnalysisArtifact } from "../schemas/index.js";

/**
 * Output-side projection of {@link StoredAnalysisArtifact} for
 * `repochan analysis get`.
 *
 * The on-disk artifact (`.repochan/analysis/current.json`) is the complete,
 * authoritative record and is never modified by this module — it still holds
 * every file path and every full code snippet. This function only trims the
 * view that gets printed to stdout / returned to the agent, so a large repo
 * does not flood the agent's context with hundreds of file paths or multi-KB
 * source snippets.
 *
 * Rules (see {@link SUMMARIZE_LIMITS}):
 * - `context.file_structure.files` / `directories`: arrays longer than the
 *   threshold are replaced with `{ omitted, count, sample, truncated }`. If
 *   they are already in `{ omitted: true, count }` form (written with
 *   `includeFileLists:false`), they are left untouched.
 * - `context.core_samples.sampled_files[].content_snippet`: snippets longer
 *   than the per-snippet cap are truncated and get a `--full` hint appended.
 *   The `path`/`language`/`size` metadata on each sample is preserved.
 *
 * Every other field is passed through verbatim — those are already bounded at
 * write time (inventory caps, git-profile caps, color caps, etc.). The return
 * value is structurally still a `StoredAnalysisArtifact`; we only shrink,
 * never add top-level keys, so schema validation is unaffected.
 *
 * Why the signature uses `StoredAnalysisArtifact` (the TypeBox-derived type)
 * and not the hand-written `AnalysisResult`: `readAnalysisArtifact` returns
 * the former, and the two types are structurally identical but not
 * type-assignable to each other (TypeBox widens e.g. `git_profile` to
 * `Record<string, JsonValue>`). Accepting the stored type lets the CLI pass
 * the result of `readAnalysisArtifact` straight through.
 */
export const SUMMARIZE_LIMITS = {
  /** Replace a file/dir list with a sample once it exceeds this many entries. */
  fileListThreshold: 60,
  /** How many leading entries to keep when a list is collapsed. */
  fileListSample: 30,
  /** Max chars of each `content_snippet` retained in the summary view. */
  snippetChars: 500,
} as const;

const SNIPPET_TRUNCATION_HINT =
  "... (truncated in summary; pass --full to `repochan analysis get` for the complete snippet)";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Collapse a long file/dir list into `{ omitted, count, sample, truncated }`.
 * Already-omitted lists (written with `includeFileLists:false`) and short
 * lists are returned unchanged.
 */
function collapseFileList(list: unknown): unknown {
  if (!Array.isArray(list)) return list;
  if (list.length <= SUMMARIZE_LIMITS.fileListThreshold) return list;
  return {
    omitted: true,
    count: list.length,
    sample: list.slice(0, SUMMARIZE_LIMITS.fileListSample),
    truncated: true,
  };
}

function truncateSnippet(snippet: unknown): unknown {
  if (typeof snippet !== "string") return snippet;
  if (snippet.length <= SUMMARIZE_LIMITS.snippetChars) return snippet;
  return snippet.slice(0, SUMMARIZE_LIMITS.snippetChars) + "\n" + SNIPPET_TRUNCATION_HINT;
}

/**
 * Project a complete analysis artifact into a context-friendly summary view.
 * Pure and non-mutating: returns a new object, leaves the input untouched.
 *
 * `context` is intentionally NOT narrowed to a plain-object type: keeping its
 * `AnalysisContext` annotation (via the `...context` spread below) preserves
 * the precise field shapes (e.g. `git_profile: GitProfile`) so the returned
 * object stays assignable to `AnalysisResult`. Only the two list-bearing
 * fields get runtime-checked, because their declared type is the loose
 * `Record<string, unknown>` and we need to safely index into them.
 */
export function summarizeAnalysisArtifact(data: StoredAnalysisArtifact): StoredAnalysisArtifact {
  const { context } = data;

  // file_structure: only the two list-bearing fields are candidates for
  // collapse; everything else on it passes through unchanged.
  const rawFileStructure = isPlainObject(context.file_structure) ? context.file_structure : {};
  const nextFileStructure = {
    ...rawFileStructure,
    files: collapseFileList(rawFileStructure.files),
    directories: collapseFileList(rawFileStructure.directories),
  };

  // core_samples: only sampled_files[].content_snippet is truncated; the
  // metadata (path/language/size) and all other core_samples fields survive.
  const rawCoreSamples = isPlainObject(context.core_samples) ? context.core_samples : {};
  const rawSampledFiles = Array.isArray(rawCoreSamples.sampled_files) ? rawCoreSamples.sampled_files : [];
  const nextCoreSamples = {
    ...rawCoreSamples,
    sampled_files: rawSampledFiles.map((entry) => {
      if (!isPlainObject(entry)) return entry;
      return { ...entry, content_snippet: truncateSnippet(entry.content_snippet) };
    }),
  };

  return {
    ...data,
    context: {
      ...context,
      file_structure: nextFileStructure,
      core_samples: nextCoreSamples,
    },
  };
}

import { promises as fs } from "node:fs";
import path from "node:path";
import type { AnalyzeInput } from "./schema.js";
import { desensitize } from "./desensitize.js";
import { findEntryPoints } from "./tech-stack.js";
import { rel } from "./walk.js";

/**
 * Code-language map. Single source of truth for which extensions are
 * considered "real code" worth sampling into `core_samples`.
 *
 * Deliberately excludes text-but-not-code extensions (.json/.yaml/.toml/.md/
 * .txt/.sh/.lock): manifests are already captured by tech_stack.manifests,
 * docs by docs_narrative, and configs are noise as a code sample. This is
 * also what keeps binary image/audio/archive files out — instead of an
 * ever-incomplete denylist, we only ever sample extensions explicitly
 * listed here.
 */
export const CODE_LANGUAGE_MAP: Record<string, string> = {
  ".py": "python",
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c-header",
  ".hpp": "c-header",
  ".css": "css",
  ".scss": "scss",
  ".html": "html",
  ".vue": "vue",
  ".svelte": "svelte",
  ".rb": "ruby",
  ".php": "php",
  ".sh": "shell",
  ".sql": "sql",
};

/** Extensions eligible for core-code sampling. Derived from CODE_LANGUAGE_MAP. */
export const CODE_EXTS = new Set(Object.keys(CODE_LANGUAGE_MAP));

export function guessLanguage(file: string) {
  return CODE_LANGUAGE_MAP[path.extname(file).toLowerCase()] ?? "text";
}

export async function sampleCoreCode(projectRoot: string, files: string[], projectType: string, options: AnalyzeInput) {
  const maxFiles = Math.max(1, Math.min(30, options.maxSampleFiles ?? 8));
  const maxTotalChars = Math.max(1000, Math.min(100000, options.maxSampleChars ?? 10000));
  const perFileChars = Math.max(500, Math.min(20000, options.perFileSampleChars ?? 3000));
  let targets = (options.corePaths ?? [])
    .map((p) => path.resolve(projectRoot, p))
    .filter((p) => p.startsWith(path.resolve(projectRoot) + path.sep) && files.includes(p))
    .slice(0, maxFiles);
  if (!targets.length) {
    const preferred = findEntryPoints(projectRoot, files, projectType).map((p) => path.join(projectRoot, p));
    const bySize: Array<[number, string]> = [];
    for (const f of files) {
      // Allowlist filter: only sample extensions explicitly recognized as
      // code. This excludes binary images (.webp/.png/.jpg/...), archives,
      // fonts, manifests, docs — everything not in CODE_LANGUAGE_MAP.
      if (preferred.includes(f) || !CODE_EXTS.has(path.extname(f).toLowerCase())) continue;
      try {
        const st = await fs.stat(f);
        if (st.size > 0 && st.size <= 50000) bySize.push([st.size, f]);
      } catch {
        // ignore
      }
    }
    bySize.sort((a, b) => b[0] - a[0]);
    targets = [...preferred, ...bySize.map(([, f]) => f)].slice(0, maxFiles);
  }
  const sampled_files: Array<Record<string, unknown>> = [];
  let totalChars = 0;
  let totalRedactions = 0;
  for (const file of targets) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const sanitized = desensitize(raw.slice(0, perFileChars));
      let snippet = sanitized.text;
      totalRedactions += sanitized.redactions;
      let extra = raw.length > perFileChars ? `\n... (file ${raw.length} chars, truncated to ${perFileChars})` : "";
      const remaining = maxTotalChars - totalChars;
      if (snippet.length + extra.length > remaining) {
        snippet = snippet.slice(0, Math.max(200, remaining - extra.length - 50));
        extra += "\n... (overall sample truncated)";
      }
      totalChars += snippet.length + extra.length;
      sampled_files.push({ path: rel(projectRoot, file), language: guessLanguage(file), size: raw.length, content_snippet: snippet + extra });
      if (totalChars >= maxTotalChars) break;
    } catch {
      // ignore
    }
  }
  return {
    sampled_files,
    total_sampled_lines: sampled_files.reduce((a, s) => a + String(s.content_snippet).split(/\r?\n/).length, 0),
    redactions_applied: totalRedactions,
    deterministic_limits: { max_files: maxFiles, max_total_chars: maxTotalChars, per_file_chars: perFileChars },
  };
}

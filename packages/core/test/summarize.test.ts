import { describe, expect, it } from "vitest";
import { SUMMARIZE_LIMITS, summarizeAnalysisArtifact } from "../src/analysis/summarize.js";
import type { StoredAnalysisArtifact } from "../src/schemas/index.js";

function makeArtifact(overrides: {
  files?: unknown;
  directories?: unknown;
  sampledFiles?: Array<Record<string, unknown>>;
  extraContext?: Record<string, unknown>;
}): StoredAnalysisArtifact {
  return {
    schemaVersion: "repochan.analysis.v1",
    generatedAt: "2026-07-19T00:00:00.000Z",
    context: {
      basic: { project_name: "demo" },
      identity: { namingSeeds: { primary: ["demo"], secondary: [], rationale: [] } },
      file_structure: {
        files: overrides.files ?? ["src/index.ts"],
        directories: overrides.directories ?? ["src"],
        top_level_dirs: ["src"],
        entry_points: ["src/index.ts"],
        config_files: [],
      },
      inventory: { dependencies: [] },
      tech_stack: { project_type: "typescript" },
      pre_analysis: {},
      git_profile: { has_git: false },
      docs_narrative: {},
      github_meta: {},
      color_palette: {},
      core_samples: {
        sampled_files: overrides.sampledFiles ?? [],
        total_sampled_lines: 0,
        redactions_applied: 0,
        deterministic_limits: {},
      },
      deterministic_tooling: {},
      ...(overrides.extraContext ?? {}),
    },
    persona: null,
    error: null,
  } as unknown as StoredAnalysisArtifact;
}

describe("summarizeAnalysisArtifact", () => {
  describe("file lists", () => {
    it("collapses a files array longer than the threshold into a sample marker", () => {
      const many = Array.from({ length: SUMMARIZE_LIMITS.fileListThreshold + 50 }, (_, i) => `f${i}.ts`);
      const artifact = makeArtifact({ files: many });
      const out = summarizeAnalysisArtifact(artifact);
      const files = (out.context.file_structure as Record<string, unknown>).files as Record<string, unknown>;

      expect(files.omitted).toBe(true);
      expect(files.truncated).toBe(true);
      expect(files.count).toBe(many.length);
      expect(Array.isArray(files.sample)).toBe(true);
      expect((files.sample as unknown[]).length).toBe(SUMMARIZE_LIMITS.fileListSample);
      expect((files.sample as unknown[])[0]).toBe("f0.ts");
    });

    it("leaves a files array at or below the threshold untouched", () => {
      const few = ["a.ts", "b.ts"];
      const artifact = makeArtifact({ files: few });
      const out = summarizeAnalysisArtifact(artifact);
      expect((out.context.file_structure as Record<string, unknown>).files).toBe(few);
    });

    it("leaves an already-omitted list ({omitted,count}) untouched", () => {
      const omitted = { omitted: true, count: 9999 };
      const artifact = makeArtifact({ files: omitted, directories: omitted });
      const out = summarizeAnalysisArtifact(artifact);
      const fs = out.context.file_structure as Record<string, unknown>;
      expect(fs.files).toEqual(omitted);
      expect(fs.directories).toEqual(omitted);
    });

    it("applies the same collapse rule to directories", () => {
      const dirs = Array.from({ length: SUMMARIZE_LIMITS.fileListThreshold + 10 }, (_, i) => `d${i}`);
      const out = summarizeAnalysisArtifact(makeArtifact({ directories: dirs }));
      const directories = (out.context.file_structure as Record<string, unknown>).directories as Record<string, unknown>;
      expect(directories.omitted).toBe(true);
      expect(directories.count).toBe(dirs.length);
    });
  });

  describe("content snippets", () => {
    it("truncates a long content_snippet to the cap and appends the --full hint", () => {
      const long = "x".repeat(SUMMARIZE_LIMITS.snippetChars + 800);
      const out = summarizeAnalysisArtifact(
        makeArtifact({
          sampledFiles: [
            { path: "src/big.ts", language: "typescript", size: long.length, content_snippet: long },
          ],
        }),
      );
      const sampled = (out.context.core_samples as Record<string, unknown>).sampled_files as Array<Record<string, unknown>>;
      const snippet = sampled[0].content_snippet as string;

      // Metadata preserved.
      expect(sampled[0].path).toBe("src/big.ts");
      expect(sampled[0].language).toBe("typescript");
      expect(sampled[0].size).toBe(long.length);
      // Snippet shrunk and carries the hint.
      expect(snippet.length).toBeLessThan(long.length);
      expect(snippet).toContain("--full");
      expect(snippet.startsWith("x".repeat(SUMMARIZE_LIMITS.snippetChars))).toBe(true);
    });

    it("leaves short snippets untouched", () => {
      const short = "export const x = 1;";
      const out = summarizeAnalysisArtifact(
        makeArtifact({
          sampledFiles: [{ path: "a.ts", language: "typescript", size: short.length, content_snippet: short }],
        }),
      );
      const sampled = (out.context.core_samples as Record<string, unknown>).sampled_files as Array<Record<string, unknown>>;
      expect(sampled[0].content_snippet).toBe(short);
    });
  });

  describe("invariants", () => {
    it("does not mutate the input artifact", () => {
      const many = Array.from({ length: SUMMARIZE_LIMITS.fileListThreshold + 5 }, (_, i) => `f${i}.ts`);
      const long = "y".repeat(SUMMARIZE_LIMITS.snippetChars + 100);
      const artifact = makeArtifact({
        files: many,
        sampledFiles: [{ path: "a.ts", language: "typescript", size: 1, content_snippet: long }],
      });
      const filesBefore = (artifact.context.file_structure as Record<string, unknown>).files;
      const snippetBefore = ((artifact.context.core_samples as Record<string, unknown>).sampled_files as Array<Record<string, unknown>>)[0]
        .content_snippet;

      summarizeAnalysisArtifact(artifact);

      // Input is unchanged.
      expect((artifact.context.file_structure as Record<string, unknown>).files).toBe(filesBefore);
      expect(
        ((artifact.context.core_samples as Record<string, unknown>).sampled_files as Array<Record<string, unknown>>)[0].content_snippet,
      ).toBe(snippetBefore);
    });

    it("preserves unrelated context fields verbatim (tech_stack, git_profile, identity)", () => {
      const artifact = makeArtifact({
        extraContext: {
          tech_stack: { project_type: "typescript", languages: { TypeScript: 100 } },
          git_profile: { has_git: true, total_commits: 42 },
        },
      });
      const out = summarizeAnalysisArtifact(artifact);
      expect(out.context.tech_stack).toEqual({ project_type: "typescript", languages: { TypeScript: 100 } });
      expect(out.context.git_profile).toEqual({ has_git: true, total_commits: 42 });
      expect(out.context.identity).toEqual(artifact.context.identity);
    });

    it("preserves top-level metadata (schemaVersion, generatedAt, persona, error)", () => {
      const artifact = makeArtifact({});
      const out = summarizeAnalysisArtifact(artifact);
      expect(out.schemaVersion).toBe("repochan.analysis.v1");
      expect(out.generatedAt).toBe(artifact.generatedAt);
      expect(out.persona).toBeNull();
      expect(out.error).toBeNull();
    });

    it("preserves preAnalysis / abstract enrichment blocks when present", () => {
      const artifact = makeArtifact({});
      const enriched = { ...artifact, preAnalysis: { theme: "x" }, abstract: { tone: "playful" }, enrichedAt: "2026-07-19T01:00:00.000Z" };
      const out = summarizeAnalysisArtifact(enriched);
      expect(out.preAnalysis).toEqual({ theme: "x" });
      expect(out.abstract).toEqual({ tone: "playful" });
      expect(out.enrichedAt).toBe("2026-07-19T01:00:00.000Z");
    });
  });
});

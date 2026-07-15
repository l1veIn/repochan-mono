import { Type, type Static } from "typebox";

export const AnalyzeSchema = Type.Object({
  overwrite: Type.Optional(Type.Boolean({ default: false })),
  versionPrevious: Type.Optional(Type.Boolean({ default: true })),
  corePaths: Type.Optional(Type.Array(Type.String(), { description: "Optional Analyst-selected core files to sample." })),
  focusAreas: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Optional deterministic analysis focus labels, e.g. architecture, visual, git, docs, tests, security, frontend.",
    }),
  ),
  includeSections: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Optional requested analysis sections to emphasize in tool details. The tool still writes a complete repochan.analysis.v1 artifact.",
    }),
  ),
  maxSampleFiles: Type.Optional(Type.Number({ description: "Maximum desensitized source files to sample (default 8)." })),
  maxSampleChars: Type.Optional(Type.Number({ description: "Maximum total sample characters (default 10000)." })),
  perFileSampleChars: Type.Optional(Type.Number({ description: "Maximum characters per sampled file (default 3000)." })),
  colorScanLimit: Type.Optional(Type.Number({ description: "Maximum visual/theme files to scan for colors (default 120)." })),
  includeFileLists: Type.Optional(Type.Boolean({ default: true, description: "Include full relative file and directory lists in analysis.json." })),
}, { additionalProperties: false });

export type AnalyzeInput = Static<typeof AnalyzeSchema>;

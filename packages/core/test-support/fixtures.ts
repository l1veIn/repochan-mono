import path from "node:path";
import { protocolRoot, writeJson } from "../src/protocol/index.js";

export function canonicalAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "repochan.analysis.v1" as const,
    generatedAt: "2026-01-01T00:00:00.000Z",
    context: {
      basic: { project_name: "fixture" },
      identity: { namingSeeds: { primary: ["fixture"], secondary: [], rationale: ["test fixture"] } },
      file_structure: {},
      inventory: {},
      tech_stack: {},
      pre_analysis: {},
      git_profile: {},
      docs_narrative: {},
      github_meta: {},
      color_palette: {},
      core_samples: {},
      deterministic_tooling: {},
    },
    persona: null,
    error: null,
    ...overrides,
  };
}

export function canonicalPersona(overrides: Record<string, unknown> = {}) {
  return {
    name: "Fixture",
    rolePrompt: "fixture character visual tags",
    artStyle: "cel-shaded anime",
    schemaVersion: "repochan.persona.v2" as const,
    generatedAt: "2026-01-01T00:00:00.000Z",
    provenance: { tool: "test", action: "fixture" },
    ...overrides,
  };
}

export async function seedAnalysis(projectRoot: string, overrides: Record<string, unknown> = {}) {
  await writeJson(path.join(protocolRoot(projectRoot), "analysis", "current.json"), canonicalAnalysis(overrides));
}

export async function seedUpstream(projectRoot: string) {
  await seedAnalysis(projectRoot);
  await writeJson(path.join(protocolRoot(projectRoot), "persona", "current.json"), canonicalPersona());
}

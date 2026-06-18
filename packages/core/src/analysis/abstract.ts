export function heuristicAbstract(context: Record<string, any>) {
  const frameworks = context.tech_stack.frameworks as string[];
  const langs = Object.keys(context.tech_stack.languages ?? {}).slice(0, 5);
  const hasTests = context.inventory.counts.tests > 0;
  const hasLint = (context.file_structure.config_files as string[]).some((f) => /ruff|eslint|prettier|biome|clippy|fmt|tsconfig/.test(f));
  return {
    dimensions: [
      { dimension: "code_style", summary: hasLint ? "Repository shows explicit formatting/linting conventions and machine-checkable style intent." : "Style signals are inferred from file organization; explicit lint/format configuration is limited.", keywords: [hasLint ? "linted" : "implicit style", ...langs], score: hasLint ? 0.75 : 0.55 },
      { dimension: "architecture", summary: `Project is organized as a ${context.pre_analysis.project_category} with ${context.basic.total_files} analyzed source/artifact files and ${context.inventory.top_level_dirs.length} top-level directories.`, keywords: context.inventory.top_level_dirs.slice(0, 4), score: Math.min(0.85, 0.45 + context.inventory.top_level_dirs.length / 20) },
      { dimension: "product_philosophy", summary: context.pre_analysis.summary, keywords: [context.pre_analysis.project_category, context.tech_stack.project_type], score: 0.62 },
      { dimension: "tech_choices", summary: frameworks.length ? `Detected stack: ${frameworks.join(", ")}.` : "No dominant framework markers detected; technology choices appear minimal or custom.", keywords: frameworks.slice(0, 5), score: frameworks.length ? 0.7 : 0.5 },
      { dimension: "team_culture", summary: hasTests ? "Tests or specs indicate a verification-oriented engineering culture." : "Collaboration culture is inferred mainly from structure, history, and docs rather than tests.", keywords: [hasTests ? "testing" : "docs/structure", context.git_profile.has_git ? "git history" : "no git"], score: hasTests ? 0.72 : 0.52 },
    ],
    overall_impression: `${context.basic.project_name} presents as a ${context.pre_analysis.project_category} with ${context.tech_stack.project_type} foundations and ${context.git_profile.total_commits ?? 0} analyzed commits.`,
  };
}

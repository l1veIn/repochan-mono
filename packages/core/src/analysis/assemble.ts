import path from "node:path";
import { exists, PROTOCOL_DIR, stamp } from "../protocol/index.js";
import type { AnalyzeInput } from "./schema.js";
import type { AnalysisContext, AnalysisResult } from "./types.js";
import { heuristicAbstract } from "./abstract.js";
import { extractThemeColors } from "./colors.js";
import { analyzeGit } from "./git-profile.js";
import { collectInventory, detectDependencies, docsNarrative } from "./inventory.js";
import { sampleCoreCode } from "./sample.js";
import { buildSystem, detectFrameworks, detectProjectType, findEntryPoints, inferProjectCategory, packageManager } from "./tech-stack.js";
import { collectLanguages, countLines, HARD_IGNORE_DIRS, rel, walkProject } from "./walk.js";

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))];
}

function splitNameTerms(value: string): string[] {
  return value
    .replace(/^@[^/]+\//, "")
    .split(/[^\p{L}\p{N}]+|(?<=[a-z])(?=[A-Z])/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && !/^(the|and|for|with|repo|src|lib)$/i.test(part));
}

function deriveIdentitySignals(projectName: string, manifests: Record<string, unknown>, docsNarrative: Record<string, unknown>) {
  const packageJson = manifests.package_json as { name?: unknown } | undefined;
  const pyproject = manifests.pyproject as { project_name?: unknown } | undefined;
  const packageName = typeof packageJson?.name === "string" ? packageJson.name : undefined;
  const pythonProjectName = typeof pyproject?.project_name === "string" ? pyproject.project_name : undefined;
  const headings = Array.isArray(docsNarrative.headings) ? docsNarrative.headings.filter((v): v is string => typeof v === "string") : [];
  const opening = typeof docsNarrative.opening_excerpt === "string" ? docsNarrative.opening_excerpt : "";
  const primary = uniqueStrings([projectName, packageName, pythonProjectName]);
  const secondary = uniqueStrings([
    ...primary.flatMap(splitNameTerms),
    ...headings.slice(0, 5),
    ...headings.slice(0, 5).flatMap(splitNameTerms),
    ...opening
      .split(/\s+/)
      .map((word) => word.replace(/^[^A-Za-z]+|[^A-Za-z-]+$/g, ""))
      .filter((word) => /^[A-Za-z][A-Za-z-]{2,}$/.test(word))
      .slice(0, 20),
  ]).slice(0, 40);

  return {
    namingSeeds: {
      primary,
      secondary,
      rationale: [
        "Repository/product names are the primary naming source for the mascot.",
        "README headings and domain terms may provide secondary inspiration.",
        "Documentation or commit-message language is localization metadata only; it must not imply a cultural name or visual era.",
      ],
    },
  };
}

export async function performAnalysis(projectRoot: string, options: AnalyzeInput): Promise<AnalysisResult> {
  const { dirs, files } = await walkProject(projectRoot);
  const languages = collectLanguages(files);
  const frameworks = detectFrameworks(files);
  const projectType = detectProjectType(files);
  const relFiles = files.map((f) => rel(projectRoot, f)).sort();
  const inventory = collectInventory(projectRoot, relFiles, dirs);
  const configFiles = relFiles.filter((f) => /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|tsconfig\.json|vite\.config\.|next\.config\.|Dockerfile|Makefile|ruff\.toml|eslint|prettier|biome)/.test(f));
  const git_profile = await analyzeGit(projectRoot);
  const manifests = await detectDependencies(projectRoot);
  const narrative = await docsNarrative(projectRoot, relFiles);
  const basic = {
    project_name: path.basename(projectRoot),
    root_path: projectRoot,
    total_files: files.length,
    total_dirs: dirs.length,
    total_lines: await countLines(files),
    readme_exists: relFiles.some((f) => path.basename(f).toLowerCase().startsWith("readme")),
    license_exists: relFiles.some((f) => path.basename(f).toLowerCase().startsWith("license")),
    has_git: await exists(path.join(projectRoot, ".git")),
    first_commit_date: git_profile.first_commit_date ?? "",
  };
  const focus = options.focusAreas?.length
    ? options.focusAreas
    : ["code_style", "architecture", "product_philosophy", "tech_choices", "team_culture"];
  const pre_analysis = {
    project_category: inferProjectCategory(projectRoot, projectType, files, frameworks),
    summary: `${basic.project_name} is a ${projectType} ${frameworks[0] ? `project using ${frameworks[0]}` : "repository"} with ${basic.total_files} files.`,
    language_focus: Object.keys(languages)[0] ?? "",
    core_paths: options.corePaths ?? findEntryPoints(projectRoot, files, projectType),
    exclude_hints: [...HARD_IGNORE_DIRS].filter((d) => d !== PROTOCOL_DIR),
    needs_ui_assets: frameworks.some((f) => ["Next.js", "Vite", "Svelte", "Vue", "Tailwind CSS"].includes(f)) || relFiles.some((f) => /\.(css|scss|svg|svelte|vue|tsx)$/.test(f)),
    asset_recommendations: [] as Array<Record<string, unknown>>,
    analysis_focus: focus,
    requested_sections: options.includeSections ?? [],
  };
  if (pre_analysis.needs_ui_assets) pre_analysis.asset_recommendations.push({ category: "brand_assets", reason: "UI/frontend or visual source files detected", quantity: 3 });
  const fileStructure: Record<string, unknown> = {
    directories: options.includeFileLists === false ? { omitted: true, count: dirs.length } : dirs.map((d) => rel(projectRoot, d)).sort(),
    files: options.includeFileLists === false ? { omitted: true, count: relFiles.length } : relFiles,
    top_level_dirs: inventory.top_level_dirs,
    entry_points: findEntryPoints(projectRoot, files, projectType),
    config_files: configFiles,
  };
  const context: AnalysisContext = {
    basic,
    identity: deriveIdentitySignals(basic.project_name, manifests, narrative),
    file_structure: fileStructure,
    inventory,
    tech_stack: {
      project_type: projectType,
      languages,
      frameworks,
      build_system: buildSystem(files),
      package_manager: packageManager(files),
      manifests,
    },
    pre_analysis,
    git_profile,
    docs_narrative: narrative,
    github_meta: {},
    color_palette: await extractThemeColors(projectRoot, files, options.colorScanLimit),
    core_samples: await sampleCoreCode(projectRoot, files, projectType, options),
    deterministic_tooling: {
      note: "Generated by repochan action analysis.run; use this artifact instead of ad-hoc scripts for git stats, color extraction, file sampling, desensitization, and tech-stack detection.",
      capabilities: ["file_walk", "git_profile", "color_extraction", "tech_stack_detection", "desensitized_core_sampling", "docs_summary", "inventory_counts"],
    },
  };
  context.abstract = heuristicAbstract(context as Record<string, any>);
  return { schemaVersion: "repochan.analysis.v1", generatedAt: stamp(), context, persona: null, error: null };
}

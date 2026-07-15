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
  /** Basic repository facts: project_name, root_path, total_files, total_dirs, total_lines, readme/license/git flags. */
  basic: Record<string, unknown>;
  /** Repo-derived creative identity signals. These may influence mascot naming and motifs. */
  identity: {
    namingSeeds: {
      /** Strongest name sources: repository/product/package names. */
      primary: string[];
      /** Supporting name sources: README title terms and domain vocabulary. */
      secondary: string[];
      /** Why these seeds are present and how downstream roles should use them. */
      rationale: string[];
    };
  };
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
  updatedAt?: string;
  revisionReason?: string;
  context: AnalysisContext;
  persona: null;
  error: null;
  preAnalysis?: Record<string, unknown>;
  abstract?: Record<string, unknown>;
  enrichedAt?: string;
};

export type WalkResult = { dirs: string[]; files: string[] };

export type ParsedGitCommit = {
  hash: string;
  author: string;
  date: string;
  message_summary: string;
  files_changed: number;
  insertions: number;
  deletions: number;
  changed_files: string[];
};

export type GitMeta = { branch: string; remote: string; status: string };

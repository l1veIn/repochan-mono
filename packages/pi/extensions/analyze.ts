import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { exists, PROTOCOL_DIR, stamp } from "@repochan/core";

const execFileAsync = promisify(execFile);

type WalkResult = { dirs: string[]; files: string[] };
type Gitignore = { ignores: string[]; negations: string[] };

export const AnalyzeSchema = Type.Object({
  analysis: Type.Optional(Type.Any({ description: "Optional Analyst-authored additions/overrides to merge into generated analysis." })),
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
});

export type AnalyzeInput = Static<typeof AnalyzeSchema>;

const HARD_IGNORE_DIRS = new Set([
  ".git",
  "__pycache__",
  "node_modules",
  ".venv",
  "venv",
  PROTOCOL_DIR,
  ".DS_Store",
  "dist",
  "build",
  ".egg-info",
  "target",
  ".next",
  ".nuxt",
  "coverage",
]);

const TEXT_EXTS = new Set([
  ".py",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".css",
  ".scss",
  ".html",
  ".vue",
  ".svelte",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".md",
  ".txt",
  ".sh",
  ".bash",
  ".zig",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".scala",
]);

const IMAGE_EXTS = new Set([".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico"]);
const STYLE_EXTS = new Set([".css", ".scss", ".less", ".sass"]);

async function readGitignore(projectRoot: string): Promise<Gitignore> {
  const ignores: string[] = [];
  const negations: string[] = [];
  try {
    const raw = await fs.readFile(path.join(projectRoot, ".gitignore"), "utf8");
    for (const original of raw.split(/\r?\n/)) {
      const line = original.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.startsWith("!")) negations.push(line.slice(1).replace(/\/$/, ""));
      else ignores.push(line.replace(/\/$/, ""));
    }
  } catch {
    // no .gitignore
  }
  return { ignores, negations };
}

function globToRegExp(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
  return new RegExp(`(^|/)${escaped}($|/)`);
}

function matchesAny(relPath: string, patterns: string[]) {
  return patterns.some((p) => globToRegExp(p).test(relPath) || globToRegExp(`${p}/**`).test(relPath));
}

async function shouldIgnore(projectRoot: string, entry: string, gitignore: Gitignore) {
  const relPath = path.relative(projectRoot, entry).split(path.sep).join("/");
  const parts = relPath.split("/");
  if (parts.some((part) => HARD_IGNORE_DIRS.has(part))) return true;
  if (parts.some((part) => part.startsWith(".") && part !== PROTOCOL_DIR)) return true;
  if (matchesAny(relPath, gitignore.negations)) return false;
  return matchesAny(relPath, gitignore.ignores);
}

async function walkProject(projectRoot: string): Promise<WalkResult> {
  const gitignore = await readGitignore(projectRoot);
  const dirs: string[] = [];
  const files: string[] = [];
  async function walk(dir: string) {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      if (await shouldIgnore(projectRoot, full, gitignore)) continue;
      let st;
      try {
        st = await fs.stat(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        dirs.push(full);
        await walk(full);
      } else if (st.isFile()) {
        files.push(full);
      }
    }
  }
  await walk(projectRoot);
  return { dirs, files };
}

function rel(projectRoot: string, file: string) {
  return path.relative(projectRoot, file).split(path.sep).join("/");
}

function collectLanguages(files: string[]) {
  const counts: Record<string, number> = {};
  for (const file of files) {
    const ext = path.extname(file).toLowerCase() || "(no ext)";
    counts[ext] = (counts[ext] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

async function countLines(files: string[]) {
  let total = 0;
  for (const file of files) {
    if (!TEXT_EXTS.has(path.extname(file).toLowerCase())) continue;
    try {
      total += (await fs.readFile(file, "utf8")).split(/\r?\n/).length;
    } catch {
      // ignore binary/unreadable
    }
  }
  return total;
}

function detectFrameworks(files: string[]) {
  const names = new Set(files.map((f) => path.basename(f)));
  const rels = new Set(files.map((f) => f.split(path.sep).join("/")));
  const exts = new Set(files.map((f) => path.extname(f).toLowerCase()));
  const frameworks: string[] = [];
  if (exts.has(".py")) frameworks.push("Python");
  if (names.has("requirements.txt") || names.has("Pipfile")) frameworks.push("pip");
  if (names.has("pyproject.toml")) frameworks.push("pyproject.toml (uv/poetry/hatch)");
  if (names.has("setup.py") || names.has("setup.cfg")) frameworks.push("setuptools");
  if (names.has("package.json")) frameworks.push("Node.js");
  if (names.has("tsconfig.json")) frameworks.push("TypeScript");
  if (["next.config.js", "next.config.ts", "next.config.mjs"].some((n) => names.has(n))) frameworks.push("Next.js");
  if (["vite.config.ts", "vite.config.js", "vite.config.mjs"].some((n) => names.has(n))) frameworks.push("Vite");
  if (files.some((f) => path.extname(f).toLowerCase() === ".svelte") || rels.has("svelte.config.js")) frameworks.push("Svelte");
  if (files.some((f) => path.extname(f).toLowerCase() === ".vue")) frameworks.push("Vue");
  if (names.has("tailwind.config.js") || names.has("tailwind.config.ts") || names.has("tailwind.config.mjs")) frameworks.push("Tailwind CSS");
  if (names.has("Cargo.toml")) frameworks.push("Rust/Cargo");
  if (names.has("go.mod")) frameworks.push("Go");
  if (names.has("Dockerfile")) frameworks.push("Docker");
  return frameworks;
}

function detectProjectType(files: string[]) {
  const names = new Set(files.map((f) => path.basename(f)));
  const exts = new Set(files.map((f) => path.extname(f).toLowerCase()));
  if (names.has("Cargo.toml")) return "rust";
  if (names.has("go.mod")) return "go";
  if (names.has("package.json")) return names.has("tsconfig.json") ? "typescript" : "javascript";
  if (exts.has(".py")) return "python";
  if (exts.has(".java") || exts.has(".kt") || exts.has(".kts")) return "jvm";
  return "other";
}

function buildSystem(files: string[]) {
  const names = new Set(files.map((f) => path.basename(f)));
  if (names.has("pyproject.toml")) return "pyproject.toml";
  if (names.has("package.json")) return "package.json";
  if (names.has("Cargo.toml")) return "Cargo";
  if (names.has("go.mod")) return "go modules";
  if (names.has("Makefile")) return "Makefile";
  return "";
}

function packageManager(files: string[]) {
  const names = new Set(files.map((f) => path.basename(f)));
  if (names.has("uv.lock")) return "uv";
  if (names.has("pnpm-lock.yaml")) return "pnpm";
  if (names.has("yarn.lock")) return "yarn";
  if (names.has("package-lock.json")) return "npm";
  if (names.has("poetry.lock")) return "poetry";
  if (names.has("Cargo.lock")) return "cargo";
  return "";
}

function findEntryPoints(projectRoot: string, files: string[], projectType: string) {
  const existing = new Set(files.map((f) => rel(projectRoot, f)));
  const candidates: Record<string, string[]> = {
    python: ["main.py", "app.py", "cli.py", "__init__.py", "src/main.py", "src/app.py"],
    typescript: ["src/index.ts", "src/app.ts", "index.ts", "app.ts", "src/main.ts", "main.ts"],
    javascript: ["src/index.js", "src/app.js", "index.js", "app.js", "src/main.js", "main.js"],
    rust: ["src/main.rs", "src/lib.rs"],
    go: ["main.go", "cmd/main.go"],
  };
  return (candidates[projectType] ?? []).filter((p) => existing.has(p));
}

function inferProjectCategory(projectRoot: string, projectType: string, files: string[], frameworks: string[]) {
  const relFiles = files.map((f) => rel(projectRoot, f));
  const names = new Set(files.map((f) => path.basename(f).toLowerCase()));
  if (frameworks.some((f) => ["Next.js", "Vite", "Svelte", "Vue"].includes(f))) return "web_app";
  if (names.has("dockerfile") || names.has("openapi.json")) return "backend_service";
  if (names.has("manifest.json")) return "browser_extension";
  if (projectType === "python" && relFiles.some((f) => /(^|\/)cli(\/|\.py$)/.test(f))) return "cli_tool";
  if (["rust", "go"].includes(projectType)) return "dev_tool";
  if (["typescript", "javascript"].includes(projectType)) return "web_or_node_tool";
  return projectType === "other" ? "repository" : projectType;
}

async function gitExec(projectRoot: string, args: string[], maxBuffer = 20 * 1024 * 1024) {
  const { stdout } = await execFileAsync("git", args, { cwd: projectRoot, maxBuffer });
  return stdout.trim();
}

async function analyzeGit(projectRoot: string) {
  if (!(await exists(path.join(projectRoot, ".git")))) return { has_git: false };
  try {
    const [branch, remote, status, raw] = await Promise.all([
      gitExec(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => ""),
      gitExec(projectRoot, ["remote", "-v"]).catch(() => ""),
      gitExec(projectRoot, ["status", "--short"]).catch(() => ""),
      gitExec(projectRoot, ["log", "--all", "--numstat", "--format=%H|%an|%ai|%s", "--no-merges"]),
    ]);
    const commits = parseGitLog(raw);
    return computeGitProfile(commits, { branch, remote, status });
  } catch {
    return { has_git: true, total_commits: 0 };
  }
}

function parseGitLog(raw: string) {
  const commits: Array<Record<string, any>> = [];
  let current: Record<string, any> | undefined;
  for (const original of raw.trim().split(/\r?\n/)) {
    const line = original.trim();
    if (!line) continue;
    if (/^[0-9a-f]{40}\|/.test(line)) {
      if (current) commits.push(current);
      const parts = line.split("|");
      current = {
        hash: parts[0].slice(0, 8),
        author: parts[1] ?? "",
        date: parts[2] ?? "",
        message_summary: parts.slice(3).join("|").trim(),
        files_changed: 0,
        insertions: 0,
        deletions: 0,
        changed_files: [] as string[],
      };
    } else if (current && line.includes("\t")) {
      const [ins, del, file] = line.split("\t");
      current.files_changed += 1;
      current.insertions += ins === "-" ? 0 : Number.parseInt(ins, 10) || 0;
      current.deletions += del === "-" ? 0 : Number.parseInt(del, 10) || 0;
      if (file) current.changed_files.push(file);
    }
  }
  if (current) commits.push(current);
  return commits;
}

function computeGitProfile(commits: Array<Record<string, any>>, meta: { branch: string; remote: string; status: string }) {
  const n = commits.length;
  if (!n) return { has_git: true, total_commits: 0, branch: meta.branch, dirty: Boolean(meta.status), remotes: meta.remote };
  const authors = new Set(commits.map((c) => c.author).filter(Boolean));
  const dates = commits.map((c) => c.date).filter(Boolean).sort();
  const first = dates[0] ?? "";
  const last = dates[dates.length - 1] ?? "";
  const firstMs = Date.parse(first);
  const lastMs = Date.parse(last);
  const spanWeeks = Number.isFinite(firstMs) && Number.isFinite(lastMs) ? Math.max((lastMs - firstMs) / 86400000 / 7, 1) : 1;
  const hours = Array.from({ length: 24 }, () => 0);
  let night = 0;
  let weekend = 0;
  const fileChurn = new Map<string, { commits: number; lines: number }>();
  const messageThemes = new Map<string, number>();
  for (const c of commits) {
    const d = new Date(c.date);
    if (!Number.isNaN(d.getTime())) {
      const h = d.getHours();
      if (h >= 22 || h < 6) night += 1;
      if (d.getDay() === 0 || d.getDay() === 6) weekend += 1;
      hours[h] += 1;
    }
    const summary = String(c.message_summary ?? "").trim().toLowerCase();
    const theme = summary.includes(":") ? summary.split(":", 1)[0] : summary.split(/\s+/, 1)[0];
    if (theme) messageThemes.set(theme, (messageThemes.get(theme) ?? 0) + 1);
    for (const file of c.changed_files ?? []) {
      const current = fileChurn.get(file) ?? { commits: 0, lines: 0 };
      current.commits += 1;
      current.lines += (c.insertions ?? 0) + (c.deletions ?? 0);
      fileChurn.set(file, current);
    }
  }
  const totalFiles = commits.reduce((a, c) => a + c.files_changed, 0);
  const totalLines = commits.reduce((a, c) => a + c.insertions + c.deletions, 0);
  const mergeCount = commits.filter((c) => String(c.message_summary).includes("Merge")).length;
  return {
    has_git: true,
    branch: meta.branch,
    dirty: Boolean(meta.status),
    dirty_file_count: meta.status ? meta.status.split(/\r?\n/).filter(Boolean).length : 0,
    remotes: meta.remote.split(/\r?\n/).filter(Boolean),
    total_commits: n,
    total_authors: authors.size,
    first_commit_date: first,
    last_commit_date: last,
    commits_per_week: Number((n / spanWeeks).toFixed(1)),
    commits_per_author: Number((n / Math.max(authors.size, 1)).toFixed(1)),
    night_commit_ratio: Number((night / n).toFixed(2)),
    weekend_commit_ratio: Number((weekend / n).toFixed(2)),
    busiest_hour: hours.indexOf(Math.max(...hours)),
    avg_files_per_commit: Number((totalFiles / n).toFixed(1)),
    avg_lines_per_commit: Number((totalLines / n).toFixed(1)),
    merge_commit_ratio: Number((mergeCount / n).toFixed(2)),
    top_changed_files: [...fileChurn.entries()]
      .sort((a, b) => b[1].commits - a[1].commits || b[1].lines - a[1].lines)
      .slice(0, 15)
      .map(([file, value]) => ({ file, ...value })),
    commit_message_themes: Object.fromEntries([...messageThemes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)),
    recent_commits: commits.slice(0, 12).map((c) => ({ hash: c.hash, date: c.date, message_summary: c.message_summary })),
  };
}

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const RGB_RE = /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi;

function normalizeHex(color: string) {
  const c = color.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return c;
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}

function isLightNeutral(c: string) {
  return /^#(?:f{6}|e{6}|d{6}|c{6}|b{6}|a{6}|9{6}|8{6}|7{6}|6{6})$/i.test(normalizeHex(c));
}

function isDarkNeutral(c: string) {
  return /^#(?:0{6}|1{6}|2{6}|3{6})$/i.test(normalizeHex(c));
}

function extractColorsFromText(content: string) {
  const colors = [...content.matchAll(HEX_RE)].map((m) => normalizeHex(m[0]));
  for (const m of content.matchAll(RGB_RE)) colors.push(rgbToHex(Number(m[1]), Number(m[2]), Number(m[3])));
  return colors;
}

async function extractThemeColors(projectRoot: string, files: string[], colorScanLimit = 120) {
  const all: string[] = [];
  const source = new Set<string>();
  const sourcesByColor = new Map<string, Set<string>>();
  const candidates = new Set([
    "tailwind.config.js",
    "tailwind.config.ts",
    "tailwind.config.mjs",
    "uno.config.ts",
    "uno.config.js",
    "unocss.config.ts",
    "theme.ts",
    "theme.js",
    "colors.ts",
    "palette.ts",
    "variables.css",
    "tokens.css",
    "design-tokens.json",
  ]);
  const visualFiles = files
    .filter((f) => STYLE_EXTS.has(path.extname(f).toLowerCase()) || IMAGE_EXTS.has(path.extname(f).toLowerCase()) || candidates.has(path.basename(f)))
    .sort((a, b) => rel(projectRoot, a).localeCompare(rel(projectRoot, b)))
    .slice(0, Math.max(1, colorScanLimit));
  for (const file of visualFiles) {
    try {
      const text = await fs.readFile(file, "utf8");
      const colors = extractColorsFromText(text);
      if (!colors.length) continue;
      const relFile = rel(projectRoot, file);
      source.add(relFile);
      for (const color of colors) {
        all.push(color);
        const set = sourcesByColor.get(color) ?? new Set<string>();
        set.add(relFile);
        sourcesByColor.set(color, set);
      }
    } catch {
      // binary/unreadable
    }
  }
  for (const envFile of [".env", ".env.example", ".env.local"]) {
    const file = path.join(projectRoot, envFile);
    if (!(await exists(file))) continue;
    try {
      for (const line of (await fs.readFile(file, "utf8")).split(/\r?\n/)) {
        const [key, value] = line.split("=", 2);
        if (key && value && /COLOR|COLOUR|THEME|PRIMARY|ACCENT/i.test(key)) {
          const match = value.trim().replace(/["']/g, "").match(/^#[0-9a-fA-F]{3,6}$/);
          if (match) all.push(normalizeHex(match[0]));
        }
      }
      source.add(envFile);
    } catch {
      // ignore
    }
  }
  if (!all.length) return { source_files: [], colors: [], primary_candidates: [], secondary_candidates: [], accent_candidates: [], total_extracted: 0, total_unique: 0 };
  const counts = new Map<string, number>();
  for (const c of all) counts.set(c, (counts.get(c) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const unique = ranked.map(([c]) => c);
  const visible = unique.filter((c) => !isLightNeutral(c) && !isDarkNeutral(c));
  const lights = unique.filter(isLightNeutral);
  const darks = unique.filter(isDarkNeutral);
  const primary = visible.length ? visible.slice(0, 3) : lights.slice(0, 1);
  const accent = visible.length > 3 ? visible.slice(3, 6) : visible.length > 1 ? visible.slice(1, 3) : darks.slice(0, 1);
  return {
    source_files: [...source].sort(),
    colors: unique,
    color_counts: Object.fromEntries(ranked.slice(0, 30)),
    top_colors: ranked.slice(0, 12).map(([color, count]) => ({ color, count, sources: [...(sourcesByColor.get(color) ?? [])].slice(0, 5) })),
    primary_candidates: primary,
    secondary_candidates: primary.length > 1 ? primary.slice(1, 2) : primary,
    accent_candidates: accent,
    neutral_candidates: { light: lights.slice(0, 5), dark: darks.slice(0, 5) },
    total_extracted: all.length,
    total_unique: unique.length,
    scanned_file_count: visualFiles.length,
  };
}

const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
  [/(api[_-]?key|api[_-]?secret|api[_-]?token|access[_-]?key|secret[_-]?key|auth[_-]?token|bearer[_-]?token|refresh[_-]?token|app[_-]?secret|client[_-]?secret|private[_-]?key|ssh[_-]?key|github[_-]?token|openai[_-]?api[_-]?key|anthropic[_-]?api[_-]?key|password|pwd|passwd|db[_-]?password|session[_-]?secret|cookie[_-]?secret|jwt[_-]?secret|secret)\s*[=:]\s*['"]?[A-Za-z0-9_\-./+]{16,}['"]?/gi, "$1 = [REDACTED]"],
  [/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|SECRET_KEY))\s*=\s*['"]?[^\s'"#]{8,}['"]?/gm, "$1=[REDACTED]"],
  [/(postgres(?:ql)?|mysql|sqlite|redis|rediss|mongodb|amqp|rabbitmq|mqtt|nats|s3|gs|azblob):\/\/[^\s'")\]]+/gi, "$1://[REDACTED_CONNECTION]"],
  [/(https?:\/\/)[^:]+:[^@]+@/gi, "$1[REDACTED]:[REDACTED]@"],
  [/(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(?:\/\d{1,2})?/g, "[REDACTED_IP]"],
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]"],
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, "[REDACTED_JWT]"],
  [/\b(?:sk-|pk-|AKIA|ASIA|SCW|NQ)[A-Za-z0-9_-]{8,}/gi, "[REDACTED_KEY]"],
];

function desensitize(text: string) {
  let redactions = 0;
  let result = text;
  for (const [pattern, replacement] of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, (...args) => {
      redactions += 1;
      if (typeof replacement === "string" && replacement.includes("$1")) return String(args[1] ?? "") + replacement.replace("$1", "");
      return replacement;
    });
  }
  return { text: result, redactions };
}

function guessLanguage(file: string) {
  const map: Record<string, string> = {
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
  return map[path.extname(file).toLowerCase()] ?? "text";
}

async function sampleCoreCode(projectRoot: string, files: string[], projectType: string, options: AnalyzeInput) {
  const maxFiles = Math.max(1, Math.min(30, options.maxSampleFiles ?? 8));
  const maxTotalChars = Math.max(1000, Math.min(100000, options.maxSampleChars ?? 10000));
  const perFileChars = Math.max(500, Math.min(20000, options.perFileSampleChars ?? 3000));
  const skipExts = new Set([".json", ".yaml", ".yml", ".toml", ".lock", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".md", ".rst", ".txt", ".log", ".pyc", ".pyo", ".so", ".dll", ".dylib"]);
  let targets = (options.corePaths ?? [])
    .map((p) => path.resolve(projectRoot, p))
    .filter((p) => p.startsWith(path.resolve(projectRoot) + path.sep) && files.includes(p))
    .slice(0, maxFiles);
  if (!targets.length) {
    const preferred = findEntryPoints(projectRoot, files, projectType).map((p) => path.join(projectRoot, p));
    const bySize: Array<[number, string]> = [];
    for (const f of files) {
      if (preferred.includes(f) || skipExts.has(path.extname(f).toLowerCase())) continue;
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
  const sampled_files: Array<Record<string, any>> = [];
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

async function detectDependencies(projectRoot: string) {
  const manifests: Record<string, any> = {};
  const packageJson = path.join(projectRoot, "package.json");
  if (await exists(packageJson)) {
    try {
      const pkg = JSON.parse(await fs.readFile(packageJson, "utf8"));
      manifests.package_json = {
        name: pkg.name,
        scripts: pkg.scripts ? Object.keys(pkg.scripts).sort() : [],
        dependencies: Object.keys(pkg.dependencies ?? {}).sort().slice(0, 60),
        devDependencies: Object.keys(pkg.devDependencies ?? {}).sort().slice(0, 60),
      };
    } catch {
      // ignore invalid json
    }
  }
  const pyproject = path.join(projectRoot, "pyproject.toml");
  if (await exists(pyproject)) {
    try {
      const text = await fs.readFile(pyproject, "utf8");
      manifests.pyproject = {
        build_backend: text.match(/build-backend\s*=\s*["']([^"']+)/)?.[1] ?? "",
        tool_sections: [...text.matchAll(/^\[tool\.([^\]]+)\]/gm)].map((m) => m[1]).sort(),
        project_name: text.match(/^name\s*=\s*["']([^"']+)/m)?.[1] ?? "",
      };
    } catch {
      // ignore
    }
  }
  return manifests;
}

function collectInventory(projectRoot: string, relFiles: string[], dirs: string[]) {
  const docs = relFiles.filter((f) => /(^|\/)(docs?|README|CHANGELOG|CONTRIBUTING|examples?)(\/|\.|$)/i.test(f));
  const tests = relFiles.filter((f) => /(^|\/)(tests?|specs?)(\/|$)|\.(test|spec)\./i.test(f));
  const visualAssets = relFiles.filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()) || STYLE_EXTS.has(path.extname(f).toLowerCase()));
  const topLevelDirs = [...new Set(dirs.map((d) => rel(projectRoot, d).split("/")[0]).filter(Boolean))].sort();
  return {
    top_level_dirs: topLevelDirs,
    docs: docs.slice(0, 80),
    tests: tests.slice(0, 80),
    visual_assets: visualAssets.slice(0, 80),
    counts: { docs: docs.length, tests: tests.length, visual_assets: visualAssets.length },
    has_examples: relFiles.some((f) => /(^|\/)examples?(\/|$)/i.test(f)),
    has_ci: relFiles.some((f) => /^\.github\/workflows\//.test(f) || /^\.gitlab-ci\.yml$/.test(f)),
  };
}

async function docsNarrative(projectRoot: string, relFiles: string[]) {
  const readme = relFiles.find((f) => path.basename(f).toLowerCase().startsWith("readme"));
  if (!readme) return { readme_exists: false, headings: [], opening_excerpt: "" };
  try {
    const raw = await fs.readFile(path.join(projectRoot, readme), "utf8");
    const clean = desensitize(raw.slice(0, 5000)).text;
    return {
      readme_exists: true,
      path: readme,
      headings: [...clean.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1].trim()).slice(0, 20),
      opening_excerpt: clean.replace(/\s+/g, " ").slice(0, 800),
    };
  } catch {
    return { readme_exists: true, path: readme, headings: [], opening_excerpt: "" };
  }
}

function heuristicAbstract(context: Record<string, any>) {
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

export async function performAnalysis(ctx: ExtensionContext, options: AnalyzeInput) {
  const projectRoot = ctx.cwd;
  const { dirs, files } = await walkProject(projectRoot);
  const languages = collectLanguages(files);
  const frameworks = detectFrameworks(files);
  const projectType = detectProjectType(files);
  const relFiles = files.map((f) => rel(projectRoot, f)).sort();
  const inventory = collectInventory(projectRoot, relFiles, dirs);
  const configFiles = relFiles.filter((f) => /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|tsconfig\.json|vite\.config\.|next\.config\.|Dockerfile|Makefile|ruff\.toml|eslint|prettier|biome)/.test(f));
  const git_profile: Record<string, any> = await analyzeGit(projectRoot);
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
    asset_recommendations: [] as Array<Record<string, any>>,
    analysis_focus: focus,
    requested_sections: options.includeSections ?? [],
  };
  if (pre_analysis.needs_ui_assets) pre_analysis.asset_recommendations.push({ category: "brand_assets", reason: "UI/frontend or visual source files detected", quantity: 3 });
  const fileStructure: Record<string, any> = {
    directories: options.includeFileLists === false ? { omitted: true, count: dirs.length } : dirs.map((d) => rel(projectRoot, d)).sort(),
    files: options.includeFileLists === false ? { omitted: true, count: relFiles.length } : relFiles,
    top_level_dirs: inventory.top_level_dirs,
    entry_points: findEntryPoints(projectRoot, files, projectType),
    config_files: configFiles,
  };
  const context: Record<string, any> = {
    basic,
    file_structure: fileStructure,
    inventory,
    tech_stack: {
      project_type: projectType,
      languages,
      frameworks,
      build_system: buildSystem(files),
      package_manager: packageManager(files),
      manifests: await detectDependencies(projectRoot),
    },
    pre_analysis,
    git_profile,
    docs_narrative: await docsNarrative(projectRoot, relFiles),
    github_meta: {},
    color_palette: await extractThemeColors(projectRoot, files, options.colorScanLimit),
    core_samples: await sampleCoreCode(projectRoot, files, projectType, options),
    deterministic_tooling: {
      note: "Generated by repochan action analysis.run; use this artifact instead of ad-hoc scripts for git stats, color extraction, file sampling, desensitization, and tech-stack detection.",
      capabilities: ["file_walk", "git_profile", "color_extraction", "tech_stack_detection", "desensitized_core_sampling", "docs_summary", "inventory_counts"],
    },
  };
  context.abstract = heuristicAbstract(context);
  return { schemaVersion: "repochan.analysis.v1", generatedAt: stamp(), context, persona: null, error: null };
}


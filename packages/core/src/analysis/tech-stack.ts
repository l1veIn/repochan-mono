import path from "node:path";
import { rel } from "./walk.js";

export function detectFrameworks(files: string[]) {
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

export function detectProjectType(files: string[]) {
  const names = new Set(files.map((f) => path.basename(f)));
  const exts = new Set(files.map((f) => path.extname(f).toLowerCase()));
  if (names.has("Cargo.toml")) return "rust";
  if (names.has("go.mod")) return "go";
  if (names.has("package.json")) return names.has("tsconfig.json") ? "typescript" : "javascript";
  if (exts.has(".py")) return "python";
  if (exts.has(".java") || exts.has(".kt") || exts.has(".kts")) return "jvm";
  return "other";
}

export function buildSystem(files: string[]) {
  const names = new Set(files.map((f) => path.basename(f)));
  if (names.has("pyproject.toml")) return "pyproject.toml";
  if (names.has("package.json")) return "package.json";
  if (names.has("Cargo.toml")) return "Cargo";
  if (names.has("go.mod")) return "go modules";
  if (names.has("Makefile")) return "Makefile";
  return "";
}

export function packageManager(files: string[]) {
  const names = new Set(files.map((f) => path.basename(f)));
  if (names.has("uv.lock")) return "uv";
  if (names.has("pnpm-lock.yaml")) return "pnpm";
  if (names.has("yarn.lock")) return "yarn";
  if (names.has("package-lock.json")) return "npm";
  if (names.has("poetry.lock")) return "poetry";
  if (names.has("Cargo.lock")) return "cargo";
  return "";
}

export function findEntryPoints(projectRoot: string, files: string[], projectType: string) {
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

export function inferProjectCategory(projectRoot: string, projectType: string, files: string[], frameworks: string[]) {
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

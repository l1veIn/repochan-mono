import { promises as fs } from "node:fs";
import path from "node:path";
import { exists } from "../protocol/index.js";
import { IMAGE_EXTS, STYLE_EXTS } from "./colors.js";
import { desensitize } from "./desensitize.js";
import { rel } from "./walk.js";

export async function detectDependencies(projectRoot: string) {
  const manifests: Record<string, unknown> = {};
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

export function collectInventory(projectRoot: string, relFiles: string[], dirs: string[]) {
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

export async function docsNarrative(projectRoot: string, relFiles: string[]) {
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

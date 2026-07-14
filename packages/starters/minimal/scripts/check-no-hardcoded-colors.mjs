import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const starterRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const sourceRoots = [
  "src/components",
  "src/layouts",
  "src/pages",
  "src/styles",
];
const standaloneFiles = ["tailwind.config.mjs"];
const sourceExtensions = new Set([".astro", ".css", ".js", ".mjs", ".ts"]);

const checks = [
  {
    name: "hex color",
    pattern: /#[\da-f]{3,8}\b/gi,
  },
  {
    name: "numeric color function",
    pattern: /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(\s*[-+]?(?:\d|\.\d)/gi,
  },
  {
    name: "literal SVG color",
    pattern: /\b(?:fill|stroke)=["'](?!none\b|currentColor\b|inherit\b|transparent\b|url\()[^"']+["']/gi,
  },
  {
    name: "named CSS color",
    pattern: /\b(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|fill|stroke)\s*:\s*(?:white|black|red|orange|yellow|green|blue|indigo|violet|purple|pink|gray|grey|cyan|magenta)\b/gi,
  },
  {
    name: "fixed Tailwind color utility",
    pattern: /\b(?:text|bg|border|outline|ring|fill|stroke)-(?:white|black|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)(?:-\d{2,3})?(?:\/\d{1,3})?\b/gi,
  },
];

async function collectFiles(relativeDir) {
  const absoluteDir = path.join(starterRoot, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(relativePath)));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(relativePath);
    }
  }

  return files;
}

const files = [
  ...(await Promise.all(sourceRoots.map(collectFiles))).flat(),
  ...standaloneFiles,
];
const violations = [];

for (const relativePath of files) {
  const source = await readFile(path.join(starterRoot, relativePath), "utf8");

  for (const check of checks) {
    for (const match of source.matchAll(check.pattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${relativePath}:${line} ${check.name}: ${match[0]}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Hardcoded colors are not allowed outside src/config/site.ts:\n");
  console.error(violations.map((violation) => `- ${violation}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Color contract passed (${files.length} presentation files checked).`);
}

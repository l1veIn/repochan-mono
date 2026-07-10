import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Template types — CLI-local.
// core only sees `templateId` as a plain string on AssetOrder.
// Template loading, parsing, and consumption is the CLI's responsibility.
// Built-in templates ship with @repochan/skill (packages/skill/templates/);
// project-level templates live in <projectRoot>/.repochan/templates/.
// ---------------------------------------------------------------------------

/** Grid layout constraint for sliceable output (e.g., 4×4 sticker sheets). */
export type TemplateGrid = {
  rows: number;
  cols: number;
  /** If true, the output can be auto-sliced into rows×cols individual tiles. */
  sliceable: boolean;
};

/**
 * A template is a reusable prompt skeleton plus the physical output metadata
 * needed by the image pipeline.
 */
export type TemplateData = {
  id: string;
  assetType: string;
  label: string;
  description?: string;
  tags?: string[];
  size: string;
  width: number;
  height: number;
  aspectRatio: string;
  grid?: TemplateGrid;
  promptTemplate?: string;
  constraints: string[];
};

// Minimal YAML parser for flat-ish template files.
// We avoid adding a full YAML dependency by parsing the subset we control.
// Templates use simple key: value, lists, nested objects, inline arrays, and
// literal block strings (`|` / `|-`).

type RawYaml = Record<string, any>;

async function loadYaml(filePath: string): Promise<RawYaml> {
  const text = await readFile(filePath, "utf8");
  return parseSimpleYaml(text);
}

/**
 * Parse a constrained subset of YAML sufficient for template files.
 * Supports: key: value, nested maps, list items (- value), and quoted strings.
 */
function parseSimpleYaml(text: string): RawYaml {
  const lines = text.split("\n");
  let i = 0;

  function parseScalar(value: string): unknown {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed
          .slice(1, -1)
          .split(",")
          .map((item) => String(parseScalar(item)))
          .filter(Boolean);
      }
    }
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
    return trimmed;
  }

  function parseBlock(indent: number): RawYaml {
    const obj: RawYaml = {};
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        i++;
        continue;
      }
      const currentIndent = line.length - line.trimStart().length;
      if (currentIndent < indent) break;

      if (currentIndent > indent) {
        i++;
        continue;
      }

      if (trimmed.startsWith("- ")) {
        // List handling done by parent
        break;
      }

      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) {
        i++;
        continue;
      }

      const key = trimmed.slice(0, colonIdx).trim();
      const rest = trimmed.slice(colonIdx + 1).trim();
      i++;

      if (rest === "|" || rest === "|-") {
        const blockLines: string[] = [];
        let contentIndent: number | undefined;
        while (i < lines.length) {
          const blockLine = lines[i];
          const blockTrimmed = blockLine.trim();
          if (!blockTrimmed) {
            blockLines.push("");
            i++;
            continue;
          }
          const blockIndent = blockLine.length - blockLine.trimStart().length;
          if (blockIndent <= currentIndent) break;
          contentIndent ??= blockIndent;
          blockLines.push(blockLine.slice(contentIndent));
          i++;
        }
        const content = blockLines.join("\n").replace(/\n+$/, "");
        obj[key] = rest === "|" ? `${content}\n` : content;
      } else if (rest === "") {
        // Check if next lines are a nested block or a list
        let lookahead = i;
        while (
          lookahead < lines.length &&
          (!lines[lookahead].trim() || lines[lookahead].trim().startsWith("#"))
        ) {
          lookahead++;
        }
        if (lookahead < lines.length) {
          const nextLine = lines[lookahead];
          const nextTrimmed = nextLine.trim();
          const nextIndent = nextLine.length - nextLine.trimStart().length;
          if (nextIndent > currentIndent && nextTrimmed.startsWith("- ")) {
            // It's a list
            i = lookahead;
            const items: any[] = [];
            while (i < lines.length) {
              const lItem = lines[i];
              const tItem = lItem.trim();
              if (!tItem || tItem.startsWith("#")) { i++; continue; }
              const itemIndent = lItem.length - lItem.trimStart().length;
              if (itemIndent < nextIndent) break;
              if (itemIndent > nextIndent) {
                // nested object within list item
                i++;
                continue;
              }
              if (!tItem.startsWith("- ")) break;
              items.push(parseScalar(tItem.slice(2).trim()));
              i++;
            }
            obj[key] = items;
          } else if (nextIndent > currentIndent) {
            // Nested block
            i = lookahead;
            obj[key] = parseBlock(nextIndent);
          } else {
            i = lookahead;
            obj[key] = "";
          }
        } else {
          obj[key] = "";
        }
      } else {
        obj[key] = parseScalar(rest);
      }
    }
    return obj;
  }

  return parseBlock(0);
}

function toTemplateData(raw: RawYaml, idFallback: string): TemplateData | null {
  if (!raw.id && !raw.asset_type) return null;

  const explicitSize = typeof raw.size === "string" ? raw.size.match(/^(\d+)x(\d+)$/) : null;
  const parsedLegacyWidth = Number(raw.width ?? raw.default_width?.split("x")[0] ?? 1024);
  const parsedLegacyHeight = Number(raw.height ?? raw.default_width?.split("x")[1] ?? 1024);
  const legacyWidth = Number.isFinite(parsedLegacyWidth) && parsedLegacyWidth > 0 ? parsedLegacyWidth : 1024;
  const legacyHeight = Number.isFinite(parsedLegacyHeight) && parsedLegacyHeight > 0 ? parsedLegacyHeight : 1024;
  const width = explicitSize ? Number(explicitSize[1]) : legacyWidth;
  const height = explicitSize ? Number(explicitSize[2]) : legacyHeight;
  const size = `${width}x${height}`;

  function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
  }

  const divisor = gcd(width, height);
  const derivedAspectRatio = `${width / divisor}:${height / divisor}`;

  const grid: TemplateGrid | undefined =
    raw.grid && typeof raw.grid === "object"
      ? {
          rows: Number(raw.grid.rows ?? 0),
          cols: Number(raw.grid.cols ?? 0),
          sliceable: raw.grid.sliceable === true || raw.grid.sliceable === "true",
        }
      : undefined;

  const constraints: string[] = Array.isArray(raw.constraints)
    ? raw.constraints.filter((c: any) => typeof c === "string")
    : [];

  return {
    id: raw.id ?? idFallback,
    assetType: raw.asset_type ?? raw.assetType ?? "",
    label: raw.label ?? raw.id ?? idFallback,
    description: raw.description,
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((tag: unknown): tag is string => typeof tag === "string")
      : undefined,
    size,
    width,
    height,
    aspectRatio: explicitSize
      ? derivedAspectRatio
      : (raw.aspect_ratio ?? raw.aspectRatio ?? derivedAspectRatio),
    grid,
    promptTemplate: typeof raw.prompt_template === "string" ? raw.prompt_template : undefined,
    constraints,
  };
}

/**
 * Load a single template from a YAML file.
 */
export async function loadTemplate(filePath: string): Promise<TemplateData | null> {
  try {
    const raw = await loadYaml(filePath);
    const fallback = path.basename(filePath, ".yaml").replace(/_/g, "-");
    return toTemplateData(raw, `official/${fallback}`);
  } catch {
    return null;
  }
}

/**
 * Load all templates from a directory.
 */
export async function loadTemplatesFromDir(dir: string): Promise<TemplateData[]> {
  const { readdir } = await import("node:fs/promises");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const yamlFiles = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const results = await Promise.all(yamlFiles.map((f) => loadTemplate(path.join(dir, f))));
  return results.filter((t): t is TemplateData => t !== null);
}

/**
 * Resolve the built-in templates directory shipped with @repochan/skill.
 * Mirrors setup/agents/shared.ts resolveSkillSourceDir().
 */
export async function getBuiltinTemplatesDir(): Promise<string> {
  const pkgJsonPath = require.resolve("@repochan/skill/package.json");
  return path.join(path.dirname(pkgJsonPath), "templates");
}

/**
 * Load all available templates: built-in (from @repochan/skill) + project-level
 * (<projectRoot>/.repochan/templates/). Project-level templates override
 * built-in by id.
 */
export async function loadAllTemplates(
  builtinDir: string,
  projectRoot: string,
): Promise<TemplateData[]> {
  const [builtin, project] = await Promise.all([
    loadTemplatesFromDir(builtinDir),
    loadTemplatesFromDir(path.join(projectRoot, ".repochan", "templates")),
  ]);

  // Project-level templates override built-in by id
  const byId = new Map<string, TemplateData>();
  for (const t of builtin) byId.set(t.id, t);
  for (const t of project) byId.set(t.id, t);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

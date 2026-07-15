import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Template types — CLI-local.
// core only sees `templateId` as a plain string on AssetOrder.
// Template loading, parsing, and consumption is the CLI's responsibility.
// Built-in templates ship with @repochan/templates (packages/templates/);
// project-level templates live in <projectRoot>/.repochan/templates/.
// ---------------------------------------------------------------------------

/** Grid layout constraint for sliceable output (e.g., 4×4 sticker sheets). */
export type TemplateGrid = {
  rows: number;
  cols: number;
  /** If true, the output can be auto-sliced into rows×cols individual tiles. */
  sliceable: boolean;
  /** Optional row-major semantic names for deterministic named extraction. */
  cellKeys?: string[];
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
  /** Provider-side rendering quality (low | medium | high | auto). Passed to `image gen --quality`. */
  quality?: "low" | "medium" | "high" | "auto";
  grid?: TemplateGrid;
  promptTemplate: string;
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

function requiredString(raw: RawYaml, key: string): string {
  const value = raw[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Template field '${key}' must be a non-empty string.`);
  return value;
}

function toTemplateData(raw: RawYaml): TemplateData {
  const allowed = new Set(["id", "asset_type", "label", "description", "tags", "size", "quality", "grid", "prompt_template", "constraints"]);
  const unknown = Object.keys(raw).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`Unknown template field '${unknown}'.`);

  const id = requiredString(raw, "id");
  const assetType = requiredString(raw, "asset_type");
  const label = requiredString(raw, "label");
  const promptTemplate = requiredString(raw, "prompt_template");
  const explicitSize = requiredString(raw, "size").match(/^(\d+)x(\d+)$/);
  if (!explicitSize) throw new Error("Template field 'size' must use canonical WxH syntax.");
  const width = Number(explicitSize[1]);
  const height = Number(explicitSize[2]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error("Template field 'size' must contain positive safe integers.");
  }
  const size = `${width}x${height}`;

  function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
  }

  const divisor = gcd(width, height);
  const derivedAspectRatio = `${width / divisor}:${height / divisor}`;

  let grid: TemplateGrid | undefined;
  if (raw.grid !== undefined) {
    if (!raw.grid || typeof raw.grid !== "object" || Array.isArray(raw.grid)) throw new Error("Template field 'grid' must be an object.");
    const gridAllowed = new Set(["rows", "cols", "sliceable", "cell_keys"]);
    const unknownGrid = Object.keys(raw.grid).find((key) => !gridAllowed.has(key));
    if (unknownGrid) throw new Error(`Unknown template grid field '${unknownGrid}'.`);
    const rows = Number(raw.grid.rows);
    const cols = Number(raw.grid.cols);
    if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(cols) || cols < 1) {
      throw new Error("Template grid rows and cols must be positive integers.");
    }
    if (typeof raw.grid.sliceable !== "boolean") throw new Error("Template grid sliceable must be boolean.");
    let cellKeys: string[] | undefined;
    if (raw.grid.cell_keys !== undefined) {
      if (!Array.isArray(raw.grid.cell_keys) || raw.grid.cell_keys.some((key: unknown) => typeof key !== "string" || !key.trim())) {
        throw new Error("Template grid cell_keys must be non-empty strings.");
      }
      cellKeys = raw.grid.cell_keys as string[];
      if (new Set(cellKeys).size !== cellKeys.length) throw new Error("Template grid cell_keys must be unique.");
      if (cellKeys.length !== rows * cols) throw new Error("Template grid cell_keys must name every grid cell.");
    }
    grid = { rows, cols, sliceable: raw.grid.sliceable, cellKeys };
  }

  if (!Array.isArray(raw.constraints) || raw.constraints.some((value: unknown) => typeof value !== "string" || !value.trim())) {
    throw new Error("Template field 'constraints' must be an array of non-empty strings.");
  }
  const constraints = raw.constraints as string[];
  if (raw.description !== undefined && typeof raw.description !== "string") {
    throw new Error("Template field 'description' must be a string.");
  }
  if (raw.tags !== undefined && (!Array.isArray(raw.tags) || raw.tags.some((value: unknown) => typeof value !== "string" || !value.trim()))) {
    throw new Error("Template field 'tags' must be an array of non-empty strings.");
  }
  const quality = raw.quality;
  if (quality !== undefined && !["low", "medium", "high", "auto"].includes(quality)) {
    throw new Error("Template field 'quality' must be low, medium, high, or auto.");
  }

  return {
    id,
    assetType,
    label,
    description: raw.description,
    tags: raw.tags as string[] | undefined,
    size,
    width,
    height,
    aspectRatio: derivedAspectRatio,
    grid,
    promptTemplate,
    quality,
    constraints,
  };
}

/**
 * Load a single template from a YAML file.
 */
export async function loadTemplate(filePath: string): Promise<TemplateData> {
  try {
    const raw = await loadYaml(filePath);
    return toTemplateData(raw);
  } catch (error) {
    throw new Error(`Invalid template ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
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
  return Promise.all(yamlFiles.map((f) => loadTemplate(path.join(dir, f))));
}

/**
 * Resolve the built-in templates directory shipped with @repochan/templates.
 * YAML files live at the package root (next to package.json).
 */
export async function getBuiltinTemplatesDir(): Promise<string> {
  const pkgJsonPath = require.resolve("@repochan/templates/package.json");
  return path.dirname(pkgJsonPath);
}

/**
 * Load all available templates: built-in (from @repochan/templates) + project-level
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

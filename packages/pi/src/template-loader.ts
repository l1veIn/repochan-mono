import { readFile } from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Template types — pi-local, NOT exported from @repochan/core.
// core only sees `templateId` as a plain string on AssetOrder.
// Template loading, parsing, and consumption is entirely pi's responsibility.
// ---------------------------------------------------------------------------

/** Grid layout constraint for sliceable output (e.g., 4×4 sticker sheets). */
export type TemplateGrid = {
  rows: number;
  cols: number;
  /** If true, the output can be auto-sliced into rows×cols individual tiles. */
  sliceable: boolean;
};

/** Background type hint for image generation. */
export type TemplateBackground = "plain" | "illustrated" | "transparent";

/**
 * A template defines the STRUCTURAL constraints of an asset — the "canvas
 * spec" that the Painter must respect. It is NOT a prompt generator.
 */
export type TemplateData = {
  id: string;
  assetType: string;
  label: string;
  description?: string;
  tags?: string[];
  width: number;
  height: number;
  aspectRatio?: string;
  grid?: TemplateGrid;
  background?: TemplateBackground;
  guide?: string;
  constraints: string[];
};

// Minimal YAML parser for flat-ish template files.
// We avoid adding a full YAML dependency by parsing the subset we control.
// Templates use simple key: value, lists, and nested objects.

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
  const result: RawYaml = {};
  let i = 0;

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

      if (rest === "") {
        // Check if next lines are a nested block or a list
        if (i < lines.length) {
          const nextLine = lines[i];
          const nextTrimmed = nextLine.trim();
          const nextIndent = nextLine.length - nextLine.trimStart().length;
          if (nextTrimmed.startsWith("- ")) {
            // It's a list
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
              items.push(tItem.slice(2).trim().replace(/^["']|["']$/g, ""));
              i++;
            }
            obj[key] = items;
          } else if (nextIndent > currentIndent) {
            // Nested block
            obj[key] = parseBlock(nextIndent);
          } else {
            obj[key] = "";
          }
        } else {
          obj[key] = "";
        }
      } else {
        obj[key] = rest.replace(/^["']|["']$/g, "");
      }
    }
    return obj;
  }

  return parseBlock(0);
}

function toTemplateData(raw: RawYaml, idFallback: string): TemplateData | null {
  if (!raw.id && !raw.asset_type) return null;

  const grid: TemplateGrid | undefined =
    raw.grid && typeof raw.grid === "object"
      ? {
          rows: Number(raw.grid.rows ?? 0),
          cols: Number(raw.grid.cols ?? 0),
          sliceable: Boolean(raw.grid.sliceable ?? false),
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
    tags: Array.isArray(raw.tags) ? raw.tags : undefined,
    width: Number(raw.width ?? raw.default_width?.split("x")[0] ?? 1024),
    height: Number(raw.height ?? raw.default_width?.split("x")[1] ?? 1024),
    aspectRatio: raw.aspect_ratio ?? raw.aspectRatio,
    grid,
    background: (raw.background as TemplateBackground) ?? undefined,
    guide: raw.guide,
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
 * Load all available templates: built-in (from piBuiltinDir) + project-level (.repochan/templates/).
 */
export async function loadAllTemplates(
  piBuiltinDir: string,
  projectRoot: string,
): Promise<TemplateData[]> {
  const [builtin, project] = await Promise.all([
    loadTemplatesFromDir(piBuiltinDir),
    loadTemplatesFromDir(path.join(projectRoot, ".repochan", "templates")),
  ]);

  // Project-level templates override built-in by id
  const byId = new Map<string, TemplateData>();
  for (const t of builtin) byId.set(t.id, t);
  for (const t of project) byId.set(t.id, t);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

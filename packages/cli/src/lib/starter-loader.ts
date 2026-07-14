import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** A partial order embedded in a starter asset slot. Page-designer merges this with project-specific fields (orderId, intent, foundation reference) to create the real order. */
export type StarterAssetOrder = {
  assetType?: string;
  templateId?: string;
  brief?: {
    intent?: string;
    mustInclude?: string[];
    avoid?: string[];
    creativeFreedom?: string[];
  };
  deliverables?: Array<{ name: string; format: string; width?: number; height?: number; aspectRatio?: string }>;
  references?: Array<Record<string, unknown>>;
};

/** A single asset slot declared in a starter's starter.json. */
export type StarterAssetSlot = {
  slot: string;
  reference: string;
  description?: string;
  /** Partial order template — page-designer merges + supplements to create the real order. */
  order?: StarterAssetOrder;
};

/** Parsed starter manifest (starter.json). */
export type StarterMeta = {
  id: string;
  name?: string;
  description?: string;
  style?: string;
  tags?: string[];
  default?: boolean;
  assets?: StarterAssetSlot[];
  /** Absolute path to the starter directory (the Astro project root). */
  dir: string;
};

/**
 * Resolve the built-in starters package directory shipped with @repochan/starters.
 * Each starter is a subdirectory containing an Astro project + starter.json.
 */
export async function getBuiltinStartersDir(): Promise<string> {
  const pkgJsonPath = require.resolve("@repochan/starters/package.json");
  return path.dirname(pkgJsonPath);
}

async function readStarterManifest(starterDir: string): Promise<StarterMeta | null> {
  const manifestPath = path.join(starterDir, "starter.json");
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch {
    return null; // not a starter directory (no manifest)
  }
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return {
    id: String(parsed.id ?? path.basename(starterDir)),
    name: parsed.name,
    description: parsed.description,
    style: parsed.style,
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    default: parsed.default === true,
    assets: Array.isArray(parsed.assets) ? parsed.assets : [],
    dir: starterDir,
  };
}

/**
 * List all available built-in starters by scanning subdirectories of the
 * @repochan/starters package for starter.json manifests.
 */
export async function listStarters(): Promise<StarterMeta[]> {
  const root = await getBuiltinStartersDir();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => path.join(root, e.name));
  const results = await Promise.all(dirs.map(readStarterManifest));
  return results.filter((s): s is StarterMeta => s !== null);
}

/**
 * Resolve the default starter id (the one with `default: true`, else the first).
 */
export async function getDefaultStarterId(): Promise<string> {
  const starters = await listStarters();
  const marked = starters.find((s) => s.default);
  if (marked) return marked.id;
  if (starters.length === 0) throw new Error("No starters found in @repochan/starters.");
  return starters[0].id;
}

/**
 * Resolve a starter by id to its absolute directory path.
 * Throws if the id is unknown.
 */
export async function getStarterDir(id: string): Promise<string> {
  const starters = await listStarters();
  const match = starters.find((s) => s.id === id);
  if (!match) {
    const available = starters.map((s) => s.id).join(", ") || "(none)";
    throw new Error(`Unknown starter '${id}'. Available: ${available}`);
  }
  return match.dir;
}

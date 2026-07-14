import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  validateStarterManifest,
  type StarterManifest,
} from "@repochan/core";

const require = createRequire(import.meta.url);
export const STARTER_MANIFEST_PATH = path.join("repochan", "starter.json");

export type StarterMeta = StarterManifest & { dir: string };

export async function getBuiltinStartersDir(): Promise<string> {
  const pkgJsonPath = require.resolve("@repochan/starters/package.json");
  return path.dirname(pkgJsonPath);
}

export async function readStarterManifest(starterDir: string): Promise<StarterMeta | null> {
  const manifestPath = path.join(starterDir, STARTER_MANIFEST_PATH);
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid starter manifest JSON at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return { ...validateStarterManifest(parsed), dir: starterDir };
  } catch (error) {
    throw new Error(`Invalid starter manifest at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function readStarterInstance(siteDir: string): Promise<StarterMeta> {
  const starter = await readStarterManifest(siteDir);
  if (!starter) throw new Error(`Missing starter manifest: ${path.join(siteDir, STARTER_MANIFEST_PATH)}`);
  return starter;
}

export async function listStarters(): Promise<StarterMeta[]> {
  const root = await getBuiltinStartersDir();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const results: StarterMeta[] = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const manifest = await readStarterManifest(path.join(root, entry.name));
    if (manifest) results.push(manifest);
  }
  return results;
}

export async function getDefaultStarterId(): Promise<string> {
  const starters = await listStarters();
  const marked = starters.filter((starter) => starter.default);
  if (marked.length > 1) throw new Error(`Multiple default starters: ${marked.map((starter) => starter.id).join(", ")}`);
  if (marked[0]) return marked[0].id;
  if (starters.length === 0) throw new Error("No Starter v1 manifests found in @repochan/starters.");
  return starters[0].id;
}

export async function getStarter(id: string): Promise<StarterMeta> {
  const starters = await listStarters();
  const match = starters.find((starter) => starter.id === id);
  if (!match) throw new Error(`Unknown starter '${id}'. Available: ${starters.map((starter) => starter.id).join(", ") || "(none)"}`);
  return match;
}

export async function getStarterDir(id: string): Promise<string> {
  return (await getStarter(id)).dir;
}

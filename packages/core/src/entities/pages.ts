import { promises as fs } from "node:fs";
import path from "node:path";
import type { AssetRef, JsonObject, PageData, PageSection } from "../types.js";
import { exists, initProtocol, protocolRoot, readJson, requireAnalysis, stamp, stampForPath, writeJson } from "../protocol/index.js";
import { validateInput } from "../validate.js";
import { PageCreateParamsSchema } from "../schemas/index.js";
import { isPlainObject } from "../utils/index.js";
import { readOrder, IMAGE_EXTENSIONS } from "./shared.js";

export async function createOrUpdatePage(projectRoot: string, params: JsonObject) {
  validateInput("page.create", PageCreateParamsSchema, params);
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);

  if (!isPlainObject(params.page)) throw new Error("params.page is required and must be an object.");
  const current = path.join(protocolRoot(projectRoot), "pages", "current.json");
  const currentExists = await exists(current);
  const overwrite = params.overwrite === true;
  const versionPrevious = params.versionPrevious !== false;
  if (currentExists && !overwrite) {
    throw new Error(".repochan/pages/current.json already exists. Use page.get, or ask the user before page.create with overwrite=true.");
  }

  const ts = stampForPath();
  if (currentExists && overwrite && versionPrevious) {
    await writeJson(path.join(protocolRoot(projectRoot), "pages", "versions", `${ts}-previous.json`), await readJson(current), false);
  }

  const provenance = params.page.provenance ?? params.provenance ?? { tool: "repochan", action: "page.create" };
  const data: PageData = {
    ...(params.page as PageData),
    schemaVersion: "repochan.page.v1",
    generatedAt: stamp(),
    provenance,
  };

  const slug = typeof params.slug === "string" ? params.slug : "page";
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("slug must match ^[a-z0-9-]+$.");
  const versionName = `${ts}-${slug}.json`;
  await writeJson(path.join(protocolRoot(projectRoot), "pages", "versions", versionName), data, false);
  await writeJson(current, data, currentExists || overwrite);
  return { versionName, data };
}

// ---------------------------------------------------------------------------
// Page asset reference checking
// ---------------------------------------------------------------------------

export type AssetResolution = {
  ref: AssetRef;
  exists: boolean;
  resolvedPath?: string;
  error?: string;
};

export type AssetCheckResult = {
  ok: boolean;
  total: number;
  resolved: AssetResolution[];
  missing: AssetResolution[];
};

/**
 * Extract all AssetRefs from a page's sections.
 * Walks every section type and collects image references.
 */
export function collectAssetRefs(sections: PageSection[]): AssetRef[] {
  const refs: AssetRef[] = [];
  for (const s of sections) {
    switch (s.type) {
      case "hero":
        if (s.content.image) refs.push(s.content.image);
        break;
      case "gallery":
        refs.push(...s.content.images);
        break;
      case "features":
        for (const item of s.content.items) {
          if (item.image) refs.push(item.image);
        }
        break;
      case "footer":
        if (s.content.logo) refs.push(s.content.logo);
        break;
    }
  }
  return refs;
}

/**
 * Check whether all image assets referenced by a page are resolvable.
 *
 * For each AssetRef:
 *  1. Read the referenced order
 *  2. Determine versionId (explicit or currentVersion)
 *  3. Check the version directory exists
 *  4. Check the specific file exists in that directory
 *
 * Returns ok=false if any asset is missing, with detailed error messages
 * that include available files for guided correction.
 */
export async function checkPageAssets(
  projectRoot: string,
  page: PageData,
): Promise<AssetCheckResult> {
  const refs = collectAssetRefs(page.sections);
  const resolved: AssetResolution[] = [];
  const missing: AssetResolution[] = [];

  for (const ref of refs) {
    // 1. Read order
    const order = await readOrder(projectRoot, ref.orderId).catch(() => null);
    if (!order) {
      missing.push({
        ref,
        exists: false,
        error: `order '${ref.orderId}' not found`,
      });
      continue;
    }

    // 2. Resolve versionId
    const versionId = ref.versionId ?? order.currentVersion;
    if (!versionId) {
      missing.push({
        ref,
        exists: false,
        error: `order '${ref.orderId}' has no currentVersion and no versionId specified`,
      });
      continue;
    }

    // 3. Check version directory exists
    const dir = path.join(protocolRoot(projectRoot), "orders", ref.orderId, "versions", versionId);
    if (!(await exists(dir))) {
      missing.push({
        ref,
        exists: false,
        error: `order '${ref.orderId}' has no result version '${versionId}'`,
      });
      continue;
    }

    // 4. Check file exists in version directory
    const filePath = path.join(dir, ref.file);
    if (!(await exists(filePath))) {
      const available = (await fs.readdir(dir).catch(() => []))
        .filter((f) => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()));
      missing.push({
        ref,
        exists: false,
        error: `file '${ref.file}' not found in ${ref.orderId}/${versionId}/. Available image files: [${available.join(", ")}]`,
      });
      continue;
    }

    resolved.push({ ref, exists: true, resolvedPath: filePath });
  }

  return {
    ok: missing.length === 0,
    total: refs.length,
    resolved,
    missing,
  };
}

/**
 * Read the current page artifact.
 */
export async function readPage(projectRoot: string): Promise<PageData | undefined> {
  const file = path.join(protocolRoot(projectRoot), "pages", "current.json");
  if (!(await exists(file))) return undefined;
  return readJson(file) as Promise<PageData>;
}

import path from "node:path";
import {
  assetManifestPath,
  inspectProtocol,
  listAssets,
  listOrders,
  protocolRoot,
  readJson,
  readJsonIfExists,
  type ProtocolValidationResult,
} from "@repochan/core";

export async function readAnalysis(projectRoot: string) {
  return readJsonIfExists(path.join(protocolRoot(projectRoot), "analysis.json"));
}

export async function readPersona(projectRoot: string) {
  return readJsonIfExists(path.join(protocolRoot(projectRoot), "persona", "current.json"));
}

export async function readProtocolOverview(projectRoot: string) {
  const protocol = await inspectProtocol(projectRoot);
  const orders = protocol.exists ? await listOrders(projectRoot) : { files: [], orders: [] };
  const assets = protocol.exists ? await listAssets(projectRoot) : { assets: [] };
  return { protocol, orders, assets };
}

export async function listAssetsForOrder(projectRoot: string, orderId: string) {
  const result = await listAssets(projectRoot);
  const matches: Array<{ assetId: string; manifest: any }> = [];
  for (const row of result.assets as Array<{ assetId?: string }>) {
    if (!row.assetId) continue;
    try {
      const manifest = await readJson(assetManifestPath(projectRoot, row.assetId));
      if (Array.isArray(manifest.orderIds) && manifest.orderIds.includes(orderId)) {
        matches.push({ assetId: row.assetId, manifest });
      }
    } catch {
      // ignore unreadable manifests; validate command reports details
    }
  }
  return matches;
}

export function count(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

export type { ProtocolValidationResult };

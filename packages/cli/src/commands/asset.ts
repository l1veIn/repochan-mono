import { assetManifestPath, inspectProtocol, listAssets, readJson } from "@repochan/core";
import { asArray, bullet, dim, heading, printJson, type OutputOptions, UsageError } from "./common.js";

export async function runAssetCommand(cwd: string, args: string[], options: OutputOptions = {}) {
  const [subcommand, assetId] = args;
  if (!subcommand || subcommand === "list") return list(cwd, options);
  if (subcommand === "get") {
    if (!assetId) throw new UsageError("Usage: repochan asset get <asset-id> [--json]");
    return get(cwd, assetId, options);
  }
  throw new UsageError(`Unknown asset command: ${subcommand}. Use: repochan asset list|get ...`);
}

async function list(cwd: string, options: OutputOptions) {
  const protocol = await inspectProtocol(cwd);
  const result = protocol.exists ? await listAssets(cwd) : { assets: [] };
  if (options.json) return printJson({ protocol, ...result });
  heading("RepoChan assets");
  if (!protocol.exists) return console.log(dim("No .repochan directory found."));
  const assets = asArray(result.assets);
  if (!assets.length) return console.log(dim("No assets found."));
  for (const asset of assets as any[]) {
    console.log(`- ${asset.assetId ?? "unknown"}`);
    console.log(`  currentVersion: ${asset.currentVersion ?? "none"}`);
    console.log(`  versions: ${asset.versionCount ?? 0}`);
  }
}

async function get(cwd: string, assetId: string, options: OutputOptions) {
  const protocol = await inspectProtocol(cwd);
  if (!protocol.exists) throw new UsageError("No .repochan directory found. Run `repochan init` first.");
  const manifest = await readJson(assetManifestPath(cwd, assetId));
  if (options.json) return printJson(manifest);
  heading(`RepoChan asset ${manifest.assetId ?? assetId}`);
  bullet("currentVersion", manifest.currentVersion ?? "none");
  bullet("versions", Array.isArray(manifest.versions) ? manifest.versions.length : 0);
  bullet("orders", Array.isArray(manifest.orderIds) ? manifest.orderIds.length : 0);
}

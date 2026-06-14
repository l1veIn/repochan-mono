import { assetManifestPath, inspectProtocol, listAssets, readJson } from "@repochan/core";
import { UsageError } from "../ui/errors.js";
import { asArray, bullet, dim, heading, printJson, type OutputOptions } from "../ui/output.js";

export async function runAssetCommand(cwd: string, args: string[], options: OutputOptions) {
  const [subcommand, assetId] = args;

  if (!subcommand || subcommand === "list") {
    await list(cwd, options);
    return;
  }

  if (subcommand === "get") {
    if (!assetId) throw new UsageError("Usage: repochan asset get <asset-id> [--json]");
    await get(cwd, assetId, options);
    return;
  }

  throw new UsageError(`Unknown asset command: ${subcommand}. Use: repochan asset list [--json] or repochan asset get <asset-id> [--json].`);
}

async function list(cwd: string, options: OutputOptions) {
  const protocol = await inspectProtocol(cwd);
  const result = protocol.exists ? await listAssets(cwd) : { assets: [] };
  const details = { protocol, ...result };

  if (options.json) {
    printJson(details);
    return;
  }

  heading("RepoChan assets");
  if (!protocol.exists) {
    console.log(dim("No .repochan directory found. No assets to list."));
    return;
  }

  const assets = asArray(result.assets);
  if (assets.length === 0) {
    console.log(dim("No assets found."));
    return;
  }

  for (const asset of assets) {
    const row = asset as Record<string, unknown>;
    console.log(`- ${row.assetId ?? "unknown"}`);
    console.log(`  currentVersion: ${row.currentVersion ?? "none"}`);
    console.log(`  versions: ${row.versionCount ?? 0}`);
  }
}

async function get(cwd: string, assetId: string, options: OutputOptions) {
  const protocol = await inspectProtocol(cwd);
  if (!protocol.exists) {
    throw new UsageError("No .repochan directory found. No assets are available. Run `repochan inspect` or complete the RepoChan workflow first.");
  }

  let manifest: Awaited<ReturnType<typeof readJson>>;
  try {
    manifest = await readJson(assetManifestPath(cwd, assetId));
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      throw new UsageError(`Asset not found: ${assetId}. Run \`repochan asset list\` to see available assets.`);
    }
    throw error;
  }

  if (options.json) {
    printJson(manifest);
    return;
  }

  heading(`RepoChan asset ${manifest.assetId ?? assetId}`);
  bullet("currentVersion", manifest.currentVersion ?? "none");
  bullet("versions", Array.isArray(manifest.versions) ? manifest.versions.length : 0);
  bullet("orders", Array.isArray(manifest.orderIds) ? manifest.orderIds.length : 0);
}

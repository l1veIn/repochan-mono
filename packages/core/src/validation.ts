import path from "node:path";

import { assetManifestPath, listAssets, listOrders } from "./entities.js";
import { exists, inspectProtocol, protocolRoot, readJson } from "./protocol/index.js";
import { isPlainObject, isValidOrderStatus, validateAssetId, validateOrderId } from "./utils/index.js";

export type ProtocolValidationProblem = {
  code: string;
  message: string;
  path?: string;
  suggestion?: string;
};

export type ProtocolValidationResult = {
  ok: boolean;
  protocol: Awaited<ReturnType<typeof inspectProtocol>>;
  problems: ProtocolValidationProblem[];
  warnings: ProtocolValidationProblem[];
  checked: {
    orders: number;
    assets: number;
  };
};

function problem(
  problems: ProtocolValidationProblem[],
  code: string,
  message: string,
  artifactPath?: string,
  suggestion?: string,
) {
  problems.push({ code, message, ...(artifactPath ? { path: artifactPath } : {}), ...(suggestion ? { suggestion } : {}) });
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function readArtifact(
  artifactPath: string,
  absolutePath: string,
  problems: ProtocolValidationProblem[],
) {
  try {
    return await readJson(absolutePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    problem(problems, "invalid_json", `Cannot read JSON artifact ${artifactPath}: ${message}`, artifactPath);
    return undefined;
  }
}

function validateOrderArtifact(
  file: string,
  order: unknown,
  problems: ProtocolValidationProblem[],
  warnings: ProtocolValidationProblem[],
) {
  const artifactPath = `.repochan/orders/${file}`;
  if (!isPlainObject(order)) {
    problem(problems, "invalid_order_shape", `Order ${file} must be a JSON object.`, artifactPath);
    return undefined;
  }

  const orderId = order.orderId;
  if (typeof orderId !== "string") {
    problem(problems, "missing_order_id", `Order ${file} is missing string orderId.`, artifactPath);
  } else {
    try {
      validateOrderId(orderId);
      if (file !== `${orderId}.json`) {
        problem(
          warnings,
          "order_filename_mismatch",
          `Order filename ${file} does not match orderId ${orderId}.`,
          artifactPath,
          `Rename it to .repochan/orders/${orderId}.json.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problem(problems, "invalid_order_id", `Order ${file} has invalid orderId: ${message}`, artifactPath);
    }
  }

  const status = order.status;
  if (typeof status !== "string") {
    problem(problems, "missing_order_status", `Order ${file} is missing status.`, artifactPath);
  } else if (!isValidOrderStatus(status)) {
    problem(
      problems,
      "invalid_order_status",
      `Order ${file} has invalid status '${status}'.`,
      artifactPath,
      "Use one of: draft, approved, in_progress, delivered, needs_revision, cancelled.",
    );
  }

  if (order.schemaVersion !== undefined && order.schemaVersion !== "repochan.asset-order.v1") {
    problem(problems, "invalid_order_schema", `Order ${file} has unexpected schemaVersion '${String(order.schemaVersion)}'.`, artifactPath);
  }
  if (order.schemaVersion === undefined) {
    problem(warnings, "missing_order_schema", `Order ${file} has no schemaVersion.`, artifactPath);
  }

  return typeof orderId === "string" ? orderId : undefined;
}

function validateAssetManifest(
  assetDir: string,
  manifest: unknown,
  knownOrderIds: Set<string>,
  problems: ProtocolValidationProblem[],
  warnings: ProtocolValidationProblem[],
) {
  const artifactPath = `.repochan/assets/${assetDir}/manifest.json`;
  if (!isPlainObject(manifest)) {
    problem(problems, "invalid_asset_manifest_shape", `Asset manifest for ${assetDir} must be a JSON object.`, artifactPath);
    return;
  }

  const assetId = manifest.assetId;
  if (typeof assetId !== "string") {
    problem(problems, "missing_asset_id", `Asset manifest ${assetDir} is missing string assetId.`, artifactPath);
  } else {
    try {
      validateAssetId(assetId);
      if (assetId !== assetDir) {
        problem(warnings, "asset_id_mismatch", `Asset directory ${assetDir} does not match manifest assetId ${assetId}.`, artifactPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problem(problems, "invalid_asset_id", `Asset manifest ${assetDir} has invalid assetId: ${message}`, artifactPath);
    }
  }

  if (manifest.schemaVersion !== "repochan.asset-manifest.v1") {
    problem(problems, "invalid_asset_schema", `Asset manifest ${assetDir} has invalid or missing schemaVersion.`, artifactPath);
  }

  const versions = Array.isArray(manifest.versions) ? manifest.versions : undefined;
  if (!versions) {
    problem(problems, "invalid_asset_versions", `Asset manifest ${assetDir} must include a versions array.`, artifactPath);
  }

  const versionIds = new Set<string>();
  for (const version of versions ?? []) {
    if (isPlainObject(version) && typeof version.versionId === "string") versionIds.add(version.versionId);
  }

  if (typeof manifest.currentVersion === "string" && !versionIds.has(manifest.currentVersion)) {
    problem(
      problems,
      "missing_current_asset_version",
      `Asset ${assetDir} currentVersion '${manifest.currentVersion}' is not present in versions.`,
      artifactPath,
    );
  }

  const orderIds = asStringArray(manifest.orderIds);
  if (!Array.isArray(manifest.orderIds)) {
    problem(problems, "invalid_asset_order_ids", `Asset manifest ${assetDir} must include an orderIds array.`, artifactPath);
  }
  for (const orderId of orderIds) {
    if (!knownOrderIds.has(orderId)) {
      problem(warnings, "asset_order_missing", `Asset ${assetDir} references missing order ${orderId}.`, artifactPath);
    }
  }
}

export async function validateProtocol(projectRoot: string): Promise<ProtocolValidationResult> {
  const protocol = await inspectProtocol(projectRoot);
  const problems: ProtocolValidationProblem[] = [];
  const warnings: ProtocolValidationProblem[] = [];

  if (!protocol.exists) {
    problem(warnings, "protocol_missing", "No .repochan directory found yet; nothing to validate.", ".repochan");
    return { ok: true, protocol, problems, warnings, checked: { orders: 0, assets: 0 } };
  }

  const requiredDirs = ["analysis.versions", "persona/versions", "orders", "orders/batches", "orders/versions", "assets"];
  for (const dir of requiredDirs) {
    if (!(await exists(path.join(protocolRoot(projectRoot), dir)))) {
      problem(warnings, "missing_protocol_directory", `Expected protocol directory is missing: .repochan/${dir}`, `.repochan/${dir}`);
    }
  }

  if (protocol.analysis) {
    await readArtifact(".repochan/analysis.json", path.join(protocolRoot(projectRoot), "analysis.json"), problems);
  }
  if (protocol.persona) {
    await readArtifact(".repochan/persona/current.json", path.join(protocolRoot(projectRoot), "persona", "current.json"), problems);
  }
  if (protocol.persona && !protocol.analysis) {
    problem(problems, "persona_without_analysis", "Persona exists but .repochan/analysis.json is missing.", ".repochan/persona/current.json", "Run or restore the analysis artifact first.");
  }

  const orderList = await listOrders(projectRoot);
  const knownOrderIds = new Set<string>();
  for (const file of orderList.files) {
    const artifactPath = `.repochan/orders/${file}`;
    const summary = orderList.orders.find((order) => order.file === file) as Record<string, unknown> | undefined;
    if (summary?.unreadable) {
      problem(problems, "unreadable_order", `Order file ${file} is not readable JSON.`, artifactPath);
      continue;
    }
    const order = await readArtifact(artifactPath, path.join(protocolRoot(projectRoot), "orders", file), problems);
    const orderId = validateOrderArtifact(file, order, problems, warnings);
    if (orderId) knownOrderIds.add(orderId);
  }

  if (orderList.files.length > 0 && !protocol.analysis) {
    problem(problems, "orders_without_analysis", "Orders exist but .repochan/analysis.json is missing.", ".repochan/orders", "Run or restore analysis before creating orders.");
  }

  const assetList = await listAssets(projectRoot);
  const assetDirs = asStringArray(protocol.assets);
  if (assetDirs.length > 0 && !protocol.analysis) {
    problem(problems, "assets_without_analysis", "Assets exist but .repochan/analysis.json is missing.", ".repochan/assets");
  }
  if (assetDirs.length > 0 && !protocol.persona) {
    problem(problems, "assets_without_persona", "Assets exist but .repochan/persona/current.json is missing.", ".repochan/assets");
  }

  for (const assetDir of assetDirs) {
    try {
      validateAssetId(assetDir);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problem(problems, "invalid_asset_directory", `Asset directory ${assetDir} is invalid: ${message}`, `.repochan/assets/${assetDir}`);
    }

    const manifestPath = assetManifestPath(projectRoot, assetDir);
    if (!(await exists(manifestPath))) {
      problem(problems, "missing_asset_manifest", `Asset directory ${assetDir} is missing manifest.json.`, `.repochan/assets/${assetDir}/manifest.json`);
      continue;
    }
    const manifest = await readArtifact(`.repochan/assets/${assetDir}/manifest.json`, manifestPath, problems);
    validateAssetManifest(assetDir, manifest, knownOrderIds, problems, warnings);
  }

  return {
    ok: problems.length === 0,
    protocol,
    problems,
    warnings,
    checked: { orders: orderList.files.length, assets: assetList.assets.length },
  };
}

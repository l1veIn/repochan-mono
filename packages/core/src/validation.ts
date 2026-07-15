import { promises as fs } from "node:fs";
import path from "node:path";

import { assertNoSymlinkPath } from "./entities/orders.js";
import { exists, inspectProtocol, protocolRoot, readJson } from "./protocol/index.js";
import {
  AnalysisArtifactSchema,
  AssetOrderArtifactSchema,
  InterviewArtifactSchema,
  OrderResultVersionSchema,
  PersonaArtifactSchema,
  PersonaReviewArtifactSchema,
  ReviewArtifactSchema,
} from "./schemas/index.js";
import type { TSchema } from "typebox";
import { isPlainObject, isValidOrderStatus, validateOrderId, validateVersionId } from "./utils/index.js";
import { validateInput } from "./validate.js";

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
    results: number;
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

async function validateStoredArtifact(
  artifactPath: string,
  absolutePath: string,
  schemaName: string,
  schema: TSchema,
  problems: ProtocolValidationProblem[],
) {
  const stat = await fs.lstat(absolutePath).catch(() => undefined);
  if (!stat) {
    problem(problems, "missing_artifact", `Missing stored artifact ${artifactPath}.`, artifactPath);
    return undefined;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    problem(problems, "unsafe_artifact_path", `${artifactPath} must be a real JSON file.`, artifactPath);
    return undefined;
  }
  const data = await readArtifact(artifactPath, absolutePath, problems);
  if (data === undefined) return undefined;
  try {
    validateInput(schemaName, schema, data);
  } catch (error) {
    problem(
      problems,
      `invalid_${schemaName.replace(/\./g, "_")}`,
      `${artifactPath} violates the stored artifact contract: ${error instanceof Error ? error.message : String(error)}`,
      artifactPath,
    );
  }
  return data;
}

async function validateJsonDirectory(
  projectRoot: string,
  relativeDir: string,
  schemaName: string,
  schema: TSchema,
  problems: ProtocolValidationProblem[],
) {
  const absoluteDir = path.join(protocolRoot(projectRoot), relativeDir);
  const stat = await fs.lstat(absoluteDir).catch(() => undefined);
  if (!stat) return;
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    problem(problems, "unsafe_artifact_directory", `.repochan/${relativeDir} must be a real directory.`, `.repochan/${relativeDir}`);
    return;
  }
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const artifactPath = `.repochan/${relativeDir}/${entry.name}`;
    if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith(".json")) {
      problem(problems, "invalid_artifact_entry", `Unexpected entry in .repochan/${relativeDir}: ${entry.name}.`, artifactPath);
      continue;
    }
    await validateStoredArtifact(artifactPath, path.join(absoluteDir, entry.name), schemaName, schema, problems);
  }
}

async function validateOrderReviews(
  projectRoot: string,
  orderId: string,
  problems: ProtocolValidationProblem[],
) {
  const relativeDir = `orders/${orderId}/reviews`;
  const absoluteDir = path.join(protocolRoot(projectRoot), relativeDir);
  const stat = await fs.lstat(absoluteDir).catch(() => undefined);
  if (!stat) return;
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    problem(problems, "unsafe_artifact_directory", `.repochan/${relativeDir} must be a real directory.`, `.repochan/${relativeDir}`);
    return;
  }
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "versions" && entry.isDirectory()) {
      await validateJsonDirectory(projectRoot, `${relativeDir}/versions`, "review.artifact", ReviewArtifactSchema, problems);
      continue;
    }
    const artifactPath = `.repochan/${relativeDir}/${entry.name}`;
    if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith(".json")) {
      problem(problems, "invalid_artifact_entry", `Unexpected entry in .repochan/${relativeDir}: ${entry.name}.`, artifactPath);
      continue;
    }
    const review = await validateStoredArtifact(artifactPath, path.join(absoluteDir, entry.name), "review.artifact", ReviewArtifactSchema, problems);
    if (isPlainObject(review)) {
      if (review.orderId !== orderId) {
        problem(problems, "review_order_mismatch", `${artifactPath} records orderId '${String(review.orderId)}' instead of '${orderId}'.`, artifactPath);
      }
      if (review.versionId !== entry.name.slice(0, -5)) {
        problem(problems, "review_version_mismatch", `${artifactPath} versionId does not match its filename.`, artifactPath);
      }
    }
  }
}

async function validateResultMaterialization(
  projectRoot: string,
  orderId: string,
  versionId: string,
  problems: ProtocolValidationProblem[],
): Promise<Record<string, unknown> | undefined> {
  const resultPath = `.repochan/orders/${orderId}/versions/${versionId}`;
  const versionDir = path.join(protocolRoot(projectRoot), "orders", orderId, "versions", versionId);
  const metaPath = path.join(versionDir, "meta.json");
  const remediation = "Restore the recorded deliverable bytes, or publish a new evidence-bearing result version and make it current.";
  try {
    await assertNoSymlinkPath(projectRoot, versionDir, "Protocol validation result version");
  } catch (error) {
    problem(
      problems,
      "unsafe_result_path",
      `Order result ${orderId}/${versionId} uses an unsafe path: ${error instanceof Error ? error.message : String(error)}`,
      resultPath,
      "Replace the symlinked protocol path with a real directory inside this project's .repochan tree.",
    );
    return undefined;
  }
  if (!(await exists(metaPath))) {
    problem(
      problems,
      "missing_result_meta",
      `Order result ${orderId}/${versionId} is missing its required meta.json.`,
      resultPath,
      "Remove the invalid version directory and publish a new evidence-bearing result with a new versionId.",
    );
    return undefined;
  }

  try {
    await assertNoSymlinkPath(projectRoot, metaPath, "Protocol validation result metadata");
  } catch (error) {
    problem(
      problems,
      "unsafe_result_path",
      `Order result ${orderId}/${versionId} metadata uses an unsafe path: ${error instanceof Error ? error.message : String(error)}`,
      `${resultPath}/meta.json`,
      "Replace the symlinked metadata with a real file inside this result version directory.",
    );
    return undefined;
  }
  const meta = await readArtifact(`${resultPath}/meta.json`, metaPath, problems);
  if (!isPlainObject(meta)) return undefined;
  if (typeof meta.createdAt !== "string" || !Number.isFinite(Date.parse(meta.createdAt))) {
    problem(problems, "invalid_result_timestamp", `Order result ${orderId}/${versionId} has an invalid createdAt timestamp.`, `${resultPath}/meta.json`);
  }
  try {
    validateInput("order.result_version", OrderResultVersionSchema, meta);
  } catch (error) {
    problem(
      problems,
      "invalid_result_meta",
      `Order result ${orderId}/${versionId} metadata violates the result contract: ${error instanceof Error ? error.message : String(error)}`,
      `${resultPath}/meta.json`,
      remediation,
    );
  }
  if (meta.versionId !== versionId) {
    problem(
      problems,
      "result_version_mismatch",
      `Order result metadata id '${String(meta.versionId)}' does not match directory '${versionId}'.`,
      `${resultPath}/meta.json`,
      remediation,
    );
  }
  if (!Array.isArray(meta.files) || meta.files.length === 0) {
    problem(
      problems,
      "unmaterialized_order_result",
      `Order result ${orderId}/${versionId} metadata records no deliverable files.`,
      `${resultPath}/meta.json`,
      remediation,
    );
    return meta;
  }

  const seen = new Set<string>();
  for (const recorded of meta.files) {
    if (
      typeof recorded !== "string" ||
      !recorded.trim() ||
      recorded.includes("/") ||
      recorded.includes("\\") ||
      recorded !== path.basename(recorded) ||
      recorded.normalize("NFC").toLowerCase() === "meta.json"
    ) {
      problem(
        problems,
        "invalid_result_file_record",
        `Order result ${orderId}/${versionId} has a non-canonical recorded file '${String(recorded)}'.`,
        `${resultPath}/meta.json`,
        remediation,
      );
      continue;
    }
    const portableName = recorded.normalize("NFC").toLowerCase();
    if (seen.has(portableName)) {
      problem(
        problems,
        "duplicate_result_file_record",
        `Order result ${orderId}/${versionId} records duplicate file '${recorded}'.`,
        `${resultPath}/meta.json`,
        remediation,
      );
      continue;
    }
    seen.add(portableName);
    const recordedPath = path.join(versionDir, recorded);
    try {
      await assertNoSymlinkPath(projectRoot, recordedPath, "Protocol validation result file");
    } catch (error) {
      problem(
        problems,
        "unsafe_result_path",
        `Order result ${orderId}/${versionId} recorded file '${recorded}' uses an unsafe path: ${error instanceof Error ? error.message : String(error)}`,
        `${resultPath}/${recorded}`,
        remediation,
      );
      continue;
    }
    const stat = await fs.lstat(recordedPath).catch(() => undefined);
    if (!(stat?.isFile() && stat.size > 0)) {
      problem(
        problems,
        "missing_result_file",
        `Order result ${orderId}/${versionId} recorded file '${recorded}' is missing, empty, or not a regular file.`,
        `${resultPath}/${recorded}`,
        remediation,
      );
    }
  }
  return meta;
}

type DiskResult = {
  versionId: string;
  meta?: Record<string, unknown>;
};

async function enumerateDiskResults(
  projectRoot: string,
  orderId: string,
  problems: ProtocolValidationProblem[],
): Promise<DiskResult[]> {
  const relativeVersionsPath = `.repochan/orders/${orderId}/versions`;
  const versionsDir = path.join(protocolRoot(projectRoot), "orders", orderId, "versions");
  const versionsStat = await fs.lstat(versionsDir).catch(() => undefined);
  if (!versionsStat) return [];
  if (versionsStat.isSymbolicLink() || !versionsStat.isDirectory()) {
    problem(
      problems,
      "unsafe_versions_path",
      `Order ${orderId} versions path must be a real directory, not a symlink or other entry.`,
      relativeVersionsPath,
      "Replace it with a real versions directory inside this order.",
    );
    return [];
  }

  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(versionsDir, { withFileTypes: true });
  } catch (error) {
    problem(
      problems,
      "unreadable_versions_directory",
      `Cannot enumerate order ${orderId} versions: ${error instanceof Error ? error.message : String(error)}`,
      relativeVersionsPath,
    );
    return [];
  }

  const results: DiskResult[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const resultPath = `${relativeVersionsPath}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      problem(problems, "unsafe_result_path", `Order result ${orderId}/${entry.name} is a symlink.`, resultPath,
        "Replace the symlink with a real version directory inside this order.");
      continue;
    }
    if (!entry.isDirectory()) {
      problem(problems, "invalid_result_entry", `Unexpected non-directory entry under ${relativeVersionsPath}: ${entry.name}.`, resultPath,
        "Move non-version files out of versions/.");
      continue;
    }
    try {
      validateVersionId(entry.name);
    } catch (error) {
      problem(
        problems,
        "invalid_result_version_directory",
        `Order ${orderId} has invalid result version directory '${entry.name}': ${error instanceof Error ? error.message : String(error)}`,
        resultPath,
        "Rename or restore this directory to a canonical versionId before using it.",
      );
      continue;
    }

    const meta = await validateResultMaterialization(projectRoot, orderId, entry.name, problems);
    results.push({ versionId: entry.name, meta });
  }
  return results;
}

async function validateOrderArtifact(
  orderIdFromDir: string,
  order: unknown,
  projectRoot: string,
  problems: ProtocolValidationProblem[],
  warnings: ProtocolValidationProblem[],
) {
  const artifactPath = `.repochan/orders/${orderIdFromDir}/order.json`;
  if (!isPlainObject(order)) {
    problem(problems, "invalid_order_shape", `Order ${orderIdFromDir} must be a JSON object.`, artifactPath);
    return 0;
  }
  try {
    validateInput("order.artifact", AssetOrderArtifactSchema, order);
  } catch (error) {
    problem(problems, "invalid_order_artifact", `Order ${orderIdFromDir} violates the stored order contract: ${error instanceof Error ? error.message : String(error)}`, artifactPath);
  }

  const orderId = order.orderId;
  if (typeof orderId !== "string") {
    problem(problems, "missing_order_id", `Order ${orderIdFromDir} is missing string orderId.`, artifactPath);
  } else {
    try {
      validateOrderId(orderId);
      if (orderIdFromDir !== orderId) {
        problem(
          problems,
          "order_directory_mismatch",
          `Order directory ${orderIdFromDir} does not match orderId ${orderId}.`,
          artifactPath,
          `Move it to .repochan/orders/${orderId}/order.json.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problem(problems, "invalid_order_id", `Order ${orderIdFromDir} has invalid orderId: ${message}`, artifactPath);
    }
  }

  const status = order.status;
  if (typeof status !== "string") {
    problem(problems, "missing_order_status", `Order ${orderIdFromDir} is missing status.`, artifactPath);
  } else if (!isValidOrderStatus(status)) {
    problem(
      problems,
      "invalid_order_status",
      `Order ${orderIdFromDir} has invalid status '${status}'.`,
      artifactPath,
      "Use one of: draft, approved, in_progress, delivered, needs_revision, cancelled.",
    );
  }

  if (order.schemaVersion !== "repochan.asset-order.v1") {
    problem(problems, "invalid_order_schema", `Order ${orderIdFromDir} has unexpected schemaVersion '${String(order.schemaVersion)}'.`, artifactPath);
  }
  for (const field of ["createdAt", "updatedAt"] as const) {
    if (typeof order[field] !== "string" || !Number.isFinite(Date.parse(order[field] as string))) {
      problem(problems, "invalid_order_timestamp", `Order ${orderIdFromDir} has invalid or missing ${field}.`, artifactPath);
    }
  }
  if (!Array.isArray(order.candidateVersions)) {
    problem(problems, "invalid_candidate_versions", `Order ${orderIdFromDir} must contain candidateVersions as an array.`, artifactPath);
  }
  if (!(["new_asset", "revision", "variant", "batch_item"] as unknown[]).includes(order.requestType)) {
    problem(problems, "invalid_order_request_type", `Order ${orderIdFromDir} has invalid requestType.`, artifactPath);
  }
  if (typeof order.assetType !== "string" || !order.assetType.trim()) {
    problem(problems, "invalid_order_asset_type", `Order ${orderIdFromDir} has invalid assetType.`, artifactPath);
  }
  if (!isPlainObject(order.brief) || !Array.isArray(order.deliverables) || !Array.isArray(order.acceptanceCriteria)) {
    problem(problems, "invalid_order_contract", `Order ${orderIdFromDir} is missing brief, deliverables, or acceptanceCriteria.`, artifactPath);
  }

  const diskResults = await enumerateDiskResults(projectRoot, orderIdFromDir, problems);
  const diskIds = new Set(diskResults.map((result) => result.versionId));
  const lifecycleIds: string[] = [];
  if (order.currentVersion !== undefined) {
    if (typeof order.currentVersion !== "string") {
      problem(problems, "invalid_current_version", `Order ${orderIdFromDir} currentVersion must be a versionId string.`, artifactPath);
    } else {
      try { lifecycleIds.push(validateVersionId(order.currentVersion)); }
      catch (error) { problem(problems, "invalid_current_version", `Order ${orderIdFromDir} has invalid currentVersion: ${String(error)}`, artifactPath); }
    }
  }
  const candidateSeen = new Set<string>();
  if (Array.isArray(order.candidateVersions)) {
    for (const candidate of order.candidateVersions) {
      if (typeof candidate !== "string") {
        problem(problems, "invalid_candidate_version", `Order ${orderIdFromDir} has a non-string candidate version.`, artifactPath);
        continue;
      }
      try { validateVersionId(candidate); }
      catch (error) {
        problem(problems, "invalid_candidate_version", `Order ${orderIdFromDir} has invalid candidate version '${candidate}': ${String(error)}`, artifactPath);
        continue;
      }
      if (candidateSeen.has(candidate)) problem(problems, "duplicate_candidate_version", `Order ${orderIdFromDir} repeats candidate version '${candidate}'.`, artifactPath);
      candidateSeen.add(candidate);
      lifecycleIds.push(candidate);
    }
  }
  if (typeof order.currentVersion === "string" && candidateSeen.has(order.currentVersion)) {
    problem(problems, "conflicting_result_lifecycle", `Order ${orderIdFromDir} marks '${order.currentVersion}' as both current and candidate.`, artifactPath);
  }
  for (const lifecycleId of lifecycleIds) {
    if (!diskIds.has(lifecycleId)) problem(problems, "missing_lifecycle_result", `Order ${orderIdFromDir} points to missing result '${lifecycleId}'.`, artifactPath);
  }
  if (order.status === "delivered" && typeof order.currentVersion !== "string") {
    problem(problems, "delivered_without_current", `Delivered order ${orderIdFromDir} has no currentVersion.`, artifactPath);
  }
  return diskResults.length;
}

export async function validateProtocol(projectRoot: string): Promise<ProtocolValidationResult> {
  let protocol: Awaited<ReturnType<typeof inspectProtocol>>;
  try {
    protocol = await inspectProtocol(projectRoot);
  } catch {
    protocol = { exists: await exists(protocolRoot(projectRoot)), root: ".repochan" };
  }
  const problems: ProtocolValidationProblem[] = [];
  const warnings: ProtocolValidationProblem[] = [];

  if (!protocol.exists) {
    problem(warnings, "protocol_missing", "No .repochan directory found yet; nothing to validate.", ".repochan");
    return { ok: true, protocol, problems, warnings, checked: { orders: 0, results: 0 } };
  }

  const protocolStat = await fs.lstat(protocolRoot(projectRoot)).catch(() => undefined);
  if (protocolStat?.isSymbolicLink() || (protocolStat && !protocolStat.isDirectory())) {
    problem(problems, "unsafe_protocol_root", ".repochan must be a real directory inside the project.", ".repochan");
    return { ok: false, protocol, problems, warnings, checked: { orders: 0, results: 0 } };
  }

  const requiredDirs = ["analysis/versions", "persona/versions", "orders"];
  for (const dir of requiredDirs) {
    if (!(await exists(path.join(protocolRoot(projectRoot), dir)))) {
      problem(warnings, "missing_protocol_directory", `Expected protocol directory is missing: .repochan/${dir}`, `.repochan/${dir}`);
    }
  }

  if (protocol.analysis) {
    await validateStoredArtifact(
      ".repochan/analysis/current.json",
      path.join(protocolRoot(projectRoot), "analysis", "current.json"),
      "analysis.artifact",
      AnalysisArtifactSchema,
      problems,
    );
  }
  if (protocol.persona) {
    await validateStoredArtifact(
      ".repochan/persona/current.json",
      path.join(protocolRoot(projectRoot), "persona", "current.json"),
      "persona.artifact",
      PersonaArtifactSchema,
      problems,
    );
  }
  if (protocol.interview) {
    await validateStoredArtifact(
      ".repochan/interview/current.json",
      path.join(protocolRoot(projectRoot), "interview", "current.json"),
      "interview.artifact",
      InterviewArtifactSchema,
      problems,
    );
  }
  if (protocol.persona && !protocol.analysis) {
    problem(problems, "persona_without_analysis", "Persona exists but .repochan/analysis/current.json is missing.", ".repochan/persona/current.json", "Run or restore the analysis artifact first.");
  }

  await validateJsonDirectory(projectRoot, "analysis/versions", "analysis.artifact", AnalysisArtifactSchema, problems);
  await validateJsonDirectory(projectRoot, "interview/versions", "interview.artifact", InterviewArtifactSchema, problems);
  await validateJsonDirectory(projectRoot, "persona/versions", "persona.artifact", PersonaArtifactSchema, problems);
  await validateJsonDirectory(projectRoot, "persona/candidates", "persona.artifact", PersonaArtifactSchema, problems);
  const personaReviewFile = path.join(protocolRoot(projectRoot), "persona", "reviews", "current.json");
  if (await exists(personaReviewFile)) {
    await validateStoredArtifact(
      ".repochan/persona/reviews/current.json",
      personaReviewFile,
      "persona_review.artifact",
      PersonaReviewArtifactSchema,
      problems,
    );
  }
  await validateJsonDirectory(projectRoot, "persona/reviews/versions", "persona_review.artifact", PersonaReviewArtifactSchema, problems);

  const ordersDir = path.join(protocolRoot(projectRoot), "orders");
  let orderEntries: import("node:fs").Dirent[] = [];
  const ordersStat = await fs.lstat(ordersDir).catch(() => undefined);
  if (ordersStat?.isSymbolicLink() || (ordersStat && !ordersStat.isDirectory())) {
    problem(problems, "unsafe_orders_path", ".repochan/orders must be a real directory.", ".repochan/orders");
  } else if (ordersStat) {
    try {
      orderEntries = await fs.readdir(ordersDir, { withFileTypes: true });
    } catch (error) {
      problem(problems, "unreadable_orders_directory", `Cannot enumerate .repochan/orders: ${error instanceof Error ? error.message : String(error)}`, ".repochan/orders");
    }
  }

  let resultCount = 0;
  let orderCount = 0;
  for (const entry of orderEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    const orderPath = `.repochan/orders/${entry.name}`;
    if (entry.isSymbolicLink()) {
      problem(problems, "unsafe_order_path", `Order entry ${entry.name} is a symlink.`, orderPath,
        "Replace it with a real order directory inside .repochan/orders.");
      continue;
    }
    if (!entry.isDirectory()) {
      problem(problems, "invalid_order_entry", `Unexpected non-directory entry under .repochan/orders: ${entry.name}.`, orderPath,
        "Move non-order files out of .repochan/orders.");
      continue;
    }
    try {
      validateOrderId(entry.name);
    } catch (error) {
      problem(
        problems,
        "invalid_order_directory",
        `Invalid order directory '${entry.name}': ${error instanceof Error ? error.message : String(error)}`,
        orderPath,
      );
      continue;
    }
    orderCount += 1;
    const artifactPath = `${orderPath}/order.json`;
    const orderFile = path.join(ordersDir, entry.name, "order.json");
    const orderFileStat = await fs.lstat(orderFile).catch(() => undefined);
    if (orderFileStat?.isSymbolicLink()) {
      problem(problems, "unsafe_order_path", `Order ${entry.name} order.json is a symlink.`, artifactPath);
      continue;
    }
    const order = await readArtifact(artifactPath, orderFile, problems);
    resultCount += await validateOrderArtifact(entry.name, order, projectRoot, problems, warnings);
    await validateOrderReviews(projectRoot, entry.name, problems);
  }

  if (orderCount > 0 && !protocol.analysis) {
    problem(problems, "orders_without_analysis", "Orders exist but .repochan/analysis/current.json is missing.", ".repochan/orders", "Run or restore analysis before creating orders.");
  }

  return {
    ok: problems.length === 0,
    protocol,
    problems,
    warnings,
    checked: { orders: orderCount, results: resultCount },
  };
}

import path from "node:path";

import { listOrders, listOrderResults } from "./entities/index.js";
import { exists, inspectProtocol, orderJsonPath, orderVersionDir, protocolRoot, readJson } from "./protocol/index.js";
import { isPlainObject, isValidOrderStatus, validateOrderId } from "./utils/index.js";

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

  const orderId = order.orderId;
  if (typeof orderId !== "string") {
    problem(problems, "missing_order_id", `Order ${orderIdFromDir} is missing string orderId.`, artifactPath);
  } else {
    try {
      validateOrderId(orderId);
      if (orderIdFromDir !== orderId) {
        problem(
          warnings,
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

  if (order.schemaVersion !== undefined && order.schemaVersion !== "repochan.asset-order.v1") {
    problem(problems, "invalid_order_schema", `Order ${orderIdFromDir} has unexpected schemaVersion '${String(order.schemaVersion)}'.`, artifactPath);
  }
  if (order.schemaVersion === undefined) {
    problem(warnings, "missing_order_schema", `Order ${orderIdFromDir} has no schemaVersion.`, artifactPath);
  }

  const results = await listOrderResults(projectRoot, orderIdFromDir);
  const resultIds = new Set(results.results.map((result) => result.versionId));
  if (typeof order.currentVersion === "string" && !resultIds.has(order.currentVersion)) {
    problem(
      problems,
      "missing_current_order_result",
      `Order ${orderIdFromDir} currentVersion '${order.currentVersion}' is not present under versions/.`,
      artifactPath,
    );
  }
  for (const result of results.results) {
    const resultPath = `.repochan/orders/${orderIdFromDir}/versions/${result.versionId}`;
    const metaPath = path.join(orderVersionDir(projectRoot, orderIdFromDir, result.versionId), "meta.json");
    if (!(await exists(metaPath))) {
      problem(warnings, "missing_result_meta", `Order result ${orderIdFromDir}/${result.versionId} has no meta.json.`, resultPath);
    }
  }
  return results.results.length;
}

export async function validateProtocol(projectRoot: string): Promise<ProtocolValidationResult> {
  const protocol = await inspectProtocol(projectRoot);
  const problems: ProtocolValidationProblem[] = [];
  const warnings: ProtocolValidationProblem[] = [];

  if (!protocol.exists) {
    problem(warnings, "protocol_missing", "No .repochan directory found yet; nothing to validate.", ".repochan");
    return { ok: true, protocol, problems, warnings, checked: { orders: 0, results: 0 } };
  }

  const requiredDirs = ["analysis/versions", "persona/versions", "orders"];
  for (const dir of requiredDirs) {
    if (!(await exists(path.join(protocolRoot(projectRoot), dir)))) {
      problem(warnings, "missing_protocol_directory", `Expected protocol directory is missing: .repochan/${dir}`, `.repochan/${dir}`);
    }
  }

  if (protocol.analysis) {
    await readArtifact(".repochan/analysis/current.json", path.join(protocolRoot(projectRoot), "analysis", "current.json"), problems);
  }
  if (protocol.persona) {
    await readArtifact(".repochan/persona/current.json", path.join(protocolRoot(projectRoot), "persona", "current.json"), problems);
  }
  if (protocol.persona && !protocol.analysis) {
    problem(problems, "persona_without_analysis", "Persona exists but .repochan/analysis/current.json is missing.", ".repochan/persona/current.json", "Run or restore the analysis artifact first.");
  }

  const orderList = await listOrders(projectRoot);
  let resultCount = 0;
  for (const file of orderList.files) {
    const orderId = file.split("/")[0] ?? file;
    const artifactPath = `.repochan/orders/${file}`;
    const summary = orderList.orders.find((order) => order.file === file) as Record<string, unknown> | undefined;
    if (summary?.unreadable) {
      problem(problems, "unreadable_order", `Order file ${file} is not readable JSON.`, artifactPath);
      continue;
    }
    const order = await readArtifact(artifactPath, orderJsonPath(projectRoot, orderId), problems);
    resultCount += await validateOrderArtifact(orderId, order, projectRoot, problems, warnings);
  }

  if (orderList.files.length > 0 && !protocol.analysis) {
    problem(problems, "orders_without_analysis", "Orders exist but .repochan/analysis/current.json is missing.", ".repochan/orders", "Run or restore analysis before creating orders.");
  }

  return {
    ok: problems.length === 0,
    protocol,
    problems,
    warnings,
    checked: { orders: orderList.files.length, results: resultCount },
  };
}

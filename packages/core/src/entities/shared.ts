import { orderJsonPath, readJson } from "../protocol/index.js";
import { AssetOrderArtifactSchema } from "../schemas/index.js";
import type { AssetOrder } from "../types.js";
import { validateOrderId } from "../utils/index.js";
import { validateInput } from "../validate.js";

/** Image file extensions recognized when scanning order result directories. */
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];

export function validateStoredOrder(value: unknown, expectedOrderId?: string): AssetOrder {
  validateInput("order.artifact", AssetOrderArtifactSchema, value);
  const order = value as AssetOrder;
  if (expectedOrderId !== undefined && order.orderId !== expectedOrderId) {
    throw new Error(`Stored orderId mismatch: expected ${expectedOrderId}, got ${String(order.orderId)}.`);
  }
  if (!Number.isFinite(Date.parse(order.createdAt ?? "")) || !Number.isFinite(Date.parse(order.updatedAt ?? ""))) {
    throw new Error(`Stored order ${order.orderId} has invalid createdAt/updatedAt timestamps.`);
  }
  if (order.currentVersion && order.candidateVersions.includes(order.currentVersion)) {
    throw new Error(`Stored order ${order.orderId} marks ${order.currentVersion} as both current and candidate.`);
  }
  if (new Set(order.candidateVersions).size !== order.candidateVersions.length) {
    throw new Error(`Stored order ${order.orderId} contains duplicate candidateVersions.`);
  }
  if (order.status === "delivered" && !order.currentVersion) {
    throw new Error(`Stored delivered order ${order.orderId} has no currentVersion.`);
  }
  return order;
}

export async function readOrder(projectRoot: string, orderId: string) {
  const id = validateOrderId(orderId);
  return validateStoredOrder(await readJson(orderJsonPath(projectRoot, id)), id);
}

export async function ensureOrderApprovedForExecution(projectRoot: string, orderId: string) {
  const id = validateOrderId(orderId);
  const order = await readOrder(projectRoot, id);
  if (!["approved", "in_progress"].includes(String(order.status ?? ""))) {
    throw new Error(
      `Order ${id} is not approved/in_progress (status=${order.status ?? "missing"}). ` +
        "Approve it first with `repochan order set-status <orderId> approved`.",
    );
  }
  return order;
}

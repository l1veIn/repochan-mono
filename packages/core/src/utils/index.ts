import type { AssetOrder, JsonObject, OrderStatus } from "../types.js";
import { stamp } from "../protocol/index.js";

export const ORDER_STATUSES: OrderStatus[] = ["draft", "approved", "in_progress", "delivered", "needs_revision", "cancelled"];
export const ORDER_STATUS_SET = new Set<OrderStatus>(ORDER_STATUSES);

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["draft", "approved", "cancelled"],
  approved: ["approved", "in_progress", "needs_revision", "cancelled"],
  in_progress: ["in_progress", "delivered", "needs_revision", "cancelled"],
  delivered: ["delivered", "needs_revision"],
  needs_revision: ["needs_revision", "approved", "in_progress", "cancelled"],
  cancelled: ["cancelled", "draft"],
};

export function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function deepMerge(base: any, patch: any): any {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const next: JsonObject = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    next[key] = isPlainObject(value) && isPlainObject(next[key]) ? deepMerge(next[key], value) : value;
  }
  return next;
}

export function normalizeOrder(order: AssetOrder, batchId?: string, now = stamp()): AssetOrder {
  return {
    status: "draft",
    priority: "normal",
    createdAt: now,
    updatedAt: now,
    ...order,
    schemaVersion: "repochan.asset-order.v1",
    batchId: order.batchId ?? batchId,
  };
}

export function isValidOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUS_SET.has(value as OrderStatus);
}

export function isValidStatusTransition(from: OrderStatus | undefined, to: OrderStatus) {
  return from ? TRANSITIONS[from]?.includes(to) ?? false : true;
}

export function requireValidStatus(status: string): OrderStatus {
  if (!isValidOrderStatus(status)) throw new Error(`Invalid status: ${status}`);
  return status;
}

export function validateOrderId(orderId: string) {
  if (!/^ord-[a-z0-9][a-z0-9-]*$/.test(orderId)) {
    throw new Error("orderId must match ^ord-[a-z0-9][a-z0-9-]*$.");
  }
  return orderId;
}

export function validateAssetId(assetId: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(assetId)) {
    throw new Error("assetId must match ^[a-z0-9][a-z0-9-]*$.");
  }
  return assetId;
}

export function validateBatchId(batchId: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(batchId)) {
    throw new Error("batchId must match ^[a-z0-9][a-z0-9-]*$.");
  }
  return batchId;
}

export function validateVersionId(versionId: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(versionId)) {
    throw new Error("versionId must match ^[A-Za-z0-9][A-Za-z0-9_.-]*$.");
  }
  return versionId;
}

export function orderIdsFromParams(params: JsonObject) {
  const ids = new Set<string>();
  if (typeof params.orderId === "string") ids.add(validateOrderId(params.orderId));
  if (Array.isArray(params.orderIds)) {
    for (const id of params.orderIds) {
      if (typeof id === "string") ids.add(validateOrderId(id));
    }
  }
  return [...ids];
}

export function areOrdersApprovedForAsset(orders: JsonObject[], allowUnapproved: boolean) {
  return allowUnapproved || orders.every((order) => ["approved", "in_progress"].includes(String(order.status ?? "")));
}

export function stampProvenance(existing: unknown, fallback: JsonObject) {
  return existing ?? fallback;
}

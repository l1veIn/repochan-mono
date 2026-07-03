import type { AssetOrder, JsonObject, OrderReference, OrderStatus, ReferenceRole } from "../types.js";
import { FOUNDATION_ASSET_TYPES } from "../types.js";
import { stamp } from "../protocol/index.js";

export const ORDER_STATUSES: OrderStatus[] = ["draft", "approved", "in_progress", "delivered", "needs_revision", "cancelled"];
export const ORDER_STATUS_SET = new Set<OrderStatus>(ORDER_STATUSES);

const VALID_REFERENCE_ROLES = new Set<ReferenceRole>(["character", "style", "composition"]);

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["draft", "approved", "cancelled"],
  approved: ["approved", "in_progress", "needs_revision", "cancelled"],
  in_progress: ["in_progress", "delivered", "needs_revision", "cancelled"],
  delivered: ["delivered", "needs_revision"],
  needs_revision: ["needs_revision", "approved", "in_progress", "cancelled"],
  cancelled: ["cancelled", "draft"],
};

export function validNextStatuses(from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from] ?? [];
}

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

export function normalizeOrder(order: AssetOrder, now = stamp()): AssetOrder {
  return {
    status: "draft",
    priority: "normal",
    createdAt: now,
    updatedAt: now,
    ...order,
    references: normalizeReferences(order.references),
    schemaVersion: "repochan.asset-order.v1",
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

export function validateVersionId(versionId: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(versionId)) {
    throw new Error("versionId must match ^[A-Za-z0-9][A-Za-z0-9_.-]*$.");
  }
  return versionId;
}

export function isFoundationAssetType(assetType: string): boolean {
  return (FOUNDATION_ASSET_TYPES as readonly string[]).includes(assetType);
}

function normalizeReference(ref: unknown): OrderReference {
  if (!isPlainObject(ref)) throw new Error("Each reference must be an object with orderId and role.");
  const orderId = ref.orderId;
  const role = ref.role;
  if (typeof orderId !== "string" || !orderId.trim()) throw new Error("reference.orderId is required.");
  validateOrderId(orderId);
  if (typeof role !== "string" || !VALID_REFERENCE_ROLES.has(role as ReferenceRole)) {
    throw new Error(`reference.role must be one of: character, style, composition. Got: ${String(role)}`);
  }
  const result: OrderReference = { orderId, role: role as ReferenceRole };
  if (typeof ref.versionId === "string" && ref.versionId.trim()) {
    result.versionId = ref.versionId;
  }
  return result;
}

export function normalizeReferences(refs: unknown): OrderReference[] {
  if (!Array.isArray(refs)) return [];
  return refs.map(normalizeReference);
}

import { promises as fs } from "node:fs";
import path from "node:path";
import type { JsonObject, OrderStatus } from "../types.js";
import { orderJsonPath, readJson } from "../protocol/index.js";
import { validateOrderId } from "../utils/index.js";

/** Image file extensions recognized when scanning order result directories. */
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];

export async function readOrder(projectRoot: string, orderId: string) {
  return readJson(orderJsonPath(projectRoot, validateOrderId(orderId)));
}

export async function ensureOrderApprovedForExecution(projectRoot: string, orderId: string, allowUnapproved: boolean) {
  const id = validateOrderId(orderId);
  const order = await readOrder(projectRoot, id);
  if (!allowUnapproved && !["approved", "in_progress"].includes(String(order.status ?? ""))) {
    throw new Error(
      `Order ${id} is not approved/in_progress (status=${order.status ?? "missing"}). ` +
        "Call repochan action='order.get' or 'order.list' for the pre-check, then obtain user approval or pass allowUnapprovedOrder=true only after explicit approval.",
    );
  }
  return order;
}

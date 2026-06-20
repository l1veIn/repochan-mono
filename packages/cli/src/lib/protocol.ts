import path from "node:path";
import {
  inspectProtocol,
  listOrderResults as coreListOrderResults,
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
  const results = protocol.exists
    ? Object.fromEntries(await Promise.all((orders.orders as any[]).filter((order) => order.orderId).map(async (order) => [order.orderId, await coreListOrderResults(projectRoot, order.orderId)])))
    : {};
  return { protocol, orders, results };
}

export async function listOrderResults(projectRoot: string, orderId: string) {
  return coreListOrderResults(projectRoot, orderId);
}

export function count(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

export type { ProtocolValidationResult };

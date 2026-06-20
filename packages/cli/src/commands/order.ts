import { inspectProtocol, listOrders, readOrder } from "@repochan/core";
import { asArray, bullet, dim, heading, printJson, type OutputOptions, UsageError } from "./common.js";

export async function runOrderCommand(cwd: string, args: string[], options: OutputOptions = {}) {
  const [subcommand, orderId] = args;
  if (!subcommand || subcommand === "list") return list(cwd, options);
  if (subcommand === "get") {
    if (!orderId) throw new UsageError("Usage: repochan order get <order-id> [--json]");
    return get(cwd, orderId, options);
  }
  throw new UsageError(`Unknown order command: ${subcommand}. Use: repochan order list|get ...`);
}

async function list(cwd: string, options: OutputOptions) {
  const protocol = await inspectProtocol(cwd);
  const result = protocol.exists ? await listOrders(cwd) : { files: [], orders: [] };
  if (options.json) return printJson({ protocol, ...result });
  heading("RepoChan orders");
  if (!protocol.exists) return console.log(dim("No .repochan directory found."));
  const orders = asArray(result.orders);
  if (!orders.length) return console.log(dim("No orders found."));
  for (const order of orders as any[]) {
    console.log(`- ${order.orderId ?? order.file ?? "unknown"} ${dim(String(order.status ?? ""))}`);
    if (order.assetType) console.log(`  assetType: ${order.assetType}`);
    if (order.priority) console.log(`  priority: ${order.priority}`);
    console.log(`  results: ${order.resultCount ?? 0}${order.currentVersion ? ` (current ${order.currentVersion})` : ""}`);
  }
}

async function get(cwd: string, orderId: string, options: OutputOptions) {
  const protocol = await inspectProtocol(cwd);
  if (!protocol.exists) throw new UsageError("No .repochan directory found. Run `repochan init` first.");
  const order = await readOrder(cwd, orderId);
  if (options.json) return printJson(order);
  heading(`RepoChan order ${order.orderId ?? orderId}`);
  bullet("status", order.status ?? "unknown");
  bullet("assetType", order.assetType ?? "unknown");
  bullet("priority", order.priority ?? "normal");
  bullet("currentVersion", order.currentVersion ?? "none");
  if (order.brief?.intent) bullet("intent", order.brief.intent);
  if (Array.isArray(order.deliverables)) bullet("deliverables", order.deliverables.length);
  if (Array.isArray(order.acceptanceCriteria)) bullet("acceptance criteria", order.acceptanceCriteria.length);
}

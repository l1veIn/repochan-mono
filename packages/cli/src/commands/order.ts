import { inspectProtocol, listOrders, readOrder } from "@repochan/core";
import { UsageError } from "../ui/errors.js";
import { asArray, bullet, dim, heading, printJson, type OutputOptions } from "../ui/output.js";

export async function runOrderCommand(cwd: string, args: string[], options: OutputOptions) {
  const [subcommand, orderId] = args;

  if (!subcommand || subcommand === "list") {
    await list(cwd, options);
    return;
  }

  if (subcommand === "get") {
    if (!orderId) throw new UsageError("Usage: repochan order get <order-id> [--json]");
    await get(cwd, orderId, options);
    return;
  }

  throw new UsageError(`Unknown order command: ${subcommand}. Use: repochan order list [--json] or repochan order get <order-id> [--json].`);
}

async function list(cwd: string, options: OutputOptions) {
  const protocol = await inspectProtocol(cwd);
  const result = protocol.exists ? await listOrders(cwd) : { files: [], orders: [] };
  const details = { protocol, ...result };

  if (options.json) {
    printJson(details);
    return;
  }

  heading("RepoChan orders");
  if (!protocol.exists) {
    console.log(dim("No .repochan directory found. No orders to list."));
    return;
  }

  const orders = asArray(result.orders);
  if (orders.length === 0) {
    console.log(dim("No orders found."));
    return;
  }

  for (const order of orders) {
    const row = order as Record<string, unknown>;
    console.log(`- ${row.orderId ?? row.file ?? "unknown"} ${dim(String(row.status ?? ""))}`);
    if (row.assetType) console.log(`  assetType: ${row.assetType}`);
    if (row.priority) console.log(`  priority: ${row.priority}`);
  }
}

async function get(cwd: string, orderId: string, options: OutputOptions) {
  const protocol = await inspectProtocol(cwd);
  if (!protocol.exists) {
    throw new UsageError("No .repochan directory found. No orders are available. Run `repochan inspect` or start with `repochan run analysis`.");
  }

  let order: Awaited<ReturnType<typeof readOrder>>;
  try {
    order = await readOrder(cwd, orderId);
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      throw new UsageError(`Order not found: ${orderId}. Run \`repochan order list\` to see available orders.`);
    }
    throw error;
  }

  if (options.json) {
    printJson(order);
    return;
  }

  heading(`RepoChan order ${order.orderId ?? orderId}`);
  bullet("status", order.status ?? "unknown");
  bullet("assetType", order.assetType ?? "unknown");
  bullet("priority", order.priority ?? "normal");
  if (order.brief?.intent) bullet("intent", order.brief.intent);
  if (Array.isArray(order.deliverables)) bullet("deliverables", order.deliverables.length);
  if (Array.isArray(order.acceptanceCriteria)) bullet("acceptance criteria", order.acceptanceCriteria.length);
}

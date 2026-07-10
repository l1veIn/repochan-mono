import {
  createOrders,
  listOrders,
  updateOrder,
  setOrderStatus,
  addOrderRevision,
  createOrderResult,
  createOrderCandidate,
  promoteCandidate,
  listOrderResults,
  readOrderResult,
  setCurrentOrderResult,
  resolveOrderReferences,
  readOrder,
  inspectProtocol,
  type OrderStatus,
} from "@repochan/core";
import { asArray, bullet, dim, heading, emitResult, printJson, type OutputOptions, UsageError } from "../lib/output.js";
import { readDataFile } from "../lib/data-file.js";
import { runOrderSlice, runOrderExtractStickers } from "./order-image.js";

// repochan order list
export async function runOrderList(cwd: string, options: OutputOptions) {
  const protocol = await inspectProtocol(cwd);
  const result = protocol.exists ? await listOrders(cwd) : { files: [], orders: [] };
  if (options.json) return void printJson({ protocol, ...result });
  heading("RepoChan orders");
  if (!protocol.exists) return void console.log(dim("No .repochan directory found. Run `repochan init` first."));
  const orders = asArray(result.orders);
  if (!orders.length) return void console.log(dim("No orders found."));
  for (const order of orders as any[]) {
    console.log(`- ${order.orderId ?? order.file ?? "unknown"} ${dim(String(order.status ?? ""))}`);
    if (order.assetType) console.log(`  assetType: ${order.assetType}`);
    console.log(`  results: ${order.resultCount ?? 0}${order.currentVersion ? ` (current ${order.currentVersion})` : ""}`);
  }
}

// repochan order get <id>
export async function runOrderGet(cwd: string, orderId: string, options: OutputOptions) {
  const order = await readOrder(cwd, orderId);
  if (options.json) return void printJson(order);
  emitResult(options, `Order ${order.orderId ?? orderId}`, order);
}

// repochan order create --data-file
export async function runOrderCreate(cwd: string, dataFile: string | undefined, options: OutputOptions) {
  const params = readDataFile(dataFile);
  const result = await createOrders(cwd, params);
  emitResult(options, `Created ${result.written.length} order(s): ${result.written.join(", ")}`, result);
}

// repochan order update --data-file
export async function runOrderUpdate(cwd: string, dataFile: string | undefined, options: OutputOptions) {
  const params = readDataFile(dataFile);
  const result = await updateOrder(cwd, params);
  emitResult(options, "Updated order.", result);
}

// repochan order set-status <id> <status>
export async function runOrderSetStatus(cwd: string, orderId: string, status: string, options: OutputOptions) {
  if (!orderId || !status) throw new UsageError("Usage: repochan order set-status <id> <status>");
  await setOrderStatus(cwd, orderId, status as OrderStatus);
  emitResult(options, `Set order ${orderId} status → ${status}`, { orderId, status });
}

// repochan order add-revision <id> --data-file (or --text)
export async function runOrderAddRevision(cwd: string, orderId: string, dataFile: string | undefined, text: string | undefined, options: OutputOptions) {
  if (!orderId) throw new UsageError("Usage: repochan order add-revision <id> --text '...' or --data-file -");
  let revisionRequest: string;
  if (text) revisionRequest = text;
  else { const params = readDataFile(dataFile); revisionRequest = String(params.revisionRequest ?? params.text ?? ""); }
  if (!revisionRequest) throw new UsageError("revision request text is required (--text or --data-file with revisionRequest).");
  const result = await addOrderRevision(cwd, orderId, revisionRequest);
  emitResult(options, `Added revision to order ${orderId}.`, result);
}

// repochan order create-result --data-file
export async function runOrderCreateResult(cwd: string, dataFile: string | undefined, options: OutputOptions) {
  const params = readDataFile(dataFile);
  const result = await createOrderResult(cwd, params);
  emitResult(options, "Created order result version.", result);
}

// repochan order list-results <id>
export async function runOrderListResults(cwd: string, orderId: string, options: OutputOptions) {
  if (!orderId) throw new UsageError("Usage: repochan order list-results <id>");
  const result = await listOrderResults(cwd, orderId);
  emitResult(options, `Results for ${orderId}: ${asArray(result.results).length}`, result);
}

// repochan order get-result <id> [--version <v>]
export async function runOrderGetResult(cwd: string, orderId: string, versionId: string | undefined, options: OutputOptions) {
  if (!orderId) throw new UsageError("Usage: repochan order get-result <id> [--version <v>]");
  const result = await readOrderResult(cwd, orderId, versionId);
  emitResult(options, JSON.stringify(result, null, 2), result);
}

// repochan order resolve-references <id>
export async function runOrderResolveReferences(cwd: string, orderId: string, options: OutputOptions) {
  if (!orderId) throw new UsageError("Usage: repochan order resolve-references <id>");
  const order = await readOrder(cwd, orderId);
  const references = Array.isArray(order.references) ? order.references : [];
  const result = await resolveOrderReferences(cwd, references);
  emitResult(options, `Resolved references for ${orderId}.`, result);
}

// repochan order candidate create --data-file
export async function runOrderCandidateCreate(cwd: string, dataFile: string | undefined, options: OutputOptions) {
  const params = readDataFile(dataFile);
  const result = await createOrderCandidate(cwd, params);
  emitResult(options, "Created order result candidate.", result);
}

// repochan order candidate promote <id> <version>
export async function runOrderCandidatePromote(cwd: string, orderId: string, versionId: string, options: OutputOptions) {
  if (!orderId || !versionId) throw new UsageError("Usage: repochan order candidate promote <id> <version>");
  const result = await promoteCandidate(cwd, orderId, versionId);
  emitResult(options, `Promoted candidate ${orderId}/${versionId} to current.`, result);
}

// repochan order set-current <id> <version>
export async function runOrderSetCurrent(cwd: string, orderId: string, versionId: string, options: OutputOptions) {
  if (!orderId || !versionId) throw new UsageError("Usage: repochan order set-current <id> <version>");
  const result = await setCurrentOrderResult(cwd, orderId, versionId);
  emitResult(options, `Set current result for ${orderId} → ${versionId}.`, result);
}

// re-export the image-backed slice/extract-stickers (orchestration in order-image.ts)
export { runOrderSlice, runOrderExtractStickers };

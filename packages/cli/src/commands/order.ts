import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
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
  listOrderRecoveries,
  recoverOrderRecovery,
  abortOrderRecovery,
  resolveOrderReferences,
  readOrder,
  inspectProtocol,
  exists,
  orderVersionDir,
  OrderAddRevisionParamsSchema,
  validateInput,
  type OrderStatus,
} from "@repochan/core";
import { asArray, bullet, dim, heading, emitResult, printJson, type OutputOptions, UsageError } from "../lib/output.js";
import { readDataFile } from "../lib/data-file.js";
import { archiveOrderDerivedRun } from "../lib/order-derived-archive.js";
import { getBuiltinTemplatesDir, loadAllTemplates, type TemplateGrid } from "../lib/template-loader.js";
import {
  contextualizeImageMlCapabilityError,
  ensureImageMlCapability,
  type ImageMlCapabilityDeps,
} from "../lib/image-ml-capability.js";

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
  else {
    const params = readDataFile(dataFile);
    validateInput("order.add_revision", OrderAddRevisionParamsSchema, { ...params, orderId });
    revisionRequest = String(params.revisionRequest ?? "");
  }
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

// repochan order get-result <id> [--result-version <v>]
export async function runOrderGetResult(
  cwd: string,
  orderId: string,
  resultVersion: string | undefined,
  options: OutputOptions,
) {
  const usage = "Usage: repochan order get-result <id> [--result-version <version-id>]";
  if (!orderId) throw new UsageError(usage);
  const result = await readOrderResult(cwd, orderId, resultVersion);
  emitResult(options, JSON.stringify(result, null, 2), result);
}

// repochan order resolve-references <id>
export async function runOrderResolveReferences(cwd: string, orderId: string, options: OutputOptions) {
  if (!orderId) throw new UsageError("Usage: repochan order resolve-references <id>");
  const order = await readOrder(cwd, orderId);
  const references = Array.isArray(order.references) ? order.references : [];
  const result = await resolveOrderReferences(cwd, references, orderId);
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

export async function runOrderRecoveryList(cwd: string, orderId: string, options: OutputOptions) {
  if (!orderId) throw new UsageError("Usage: repochan order recovery list <id>");
  const result = await listOrderRecoveries(cwd, orderId);
  emitResult(options, `Recovery transactions for ${orderId}.`, result);
}

export async function runOrderRecoveryRecover(cwd: string, orderId: string, transactionId: string, options: OutputOptions) {
  if (!orderId || !transactionId) throw new UsageError("Usage: repochan order recovery recover <id> <transaction>");
  const result = await recoverOrderRecovery(cwd, orderId, transactionId);
  emitResult(options, `Recovered ${orderId} from ${transactionId}.`, result);
}

export async function runOrderRecoveryAbort(cwd: string, orderId: string, transactionId: string, options: OutputOptions) {
  if (!orderId || !transactionId) throw new UsageError("Usage: repochan order recovery abort <id> <transaction>");
  const result = await abortOrderRecovery(cwd, orderId, transactionId);
  emitResult(options, `Accepted current state and aborted ${transactionId}.`, result);
}

// ---------------------------------------------------------------------------
// repochan order extract <orderId> [--result-version vN]
//   [--strategy chroma-grid|equal-cell|ml-blobs|hybrid] [--rows R] [--cols C]
//   [--pipeline v1|v2] [--ml-fallback] [--model small|medium] [--json]
//
// Manual cutout extraction against a delivered order result version, archived
// into the order's derived/ audit copy + derived.json (repochan.order-derived.v1)
// via the same append-only mechanism as `starter asset-apply` — without any
// starter/site. Never touches the immutable versions/ directory. Entry fields:
// slot "manual", starter "image-edit"; the step op is "extract-grid" and args
// record the actual run parameters (strategy/pipeline/rows/cols/source version).
// ---------------------------------------------------------------------------

const ORDER_EXTRACT_STRATEGIES = ["equal-cell", "chroma-grid", "ml-blobs", "hybrid"] as const;

type OrderExtractOptions = OutputOptions & {
  resultVersion?: string;
  rows?: number | string;
  cols?: number | string;
  strategy?: string;
  pipeline?: string;
  mlFallback?: boolean;
  model?: string;
};

function optionalPositiveInt(value: number | string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new UsageError(`${flag} must be a positive integer (got "${String(value)}")`);
  }
  return parsed;
}

/** Positional fallback keys, matching the ml-blobs naming convention (s00, s01, …). */
function positionalExtractKeys(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `s${String(index).padStart(2, "0")}`);
}

export async function runOrderExtract(
  cwd: string,
  orderId: string | undefined,
  options: OrderExtractOptions,
  deps: ImageMlCapabilityDeps = {},
) {
  if (!orderId) {
    throw new UsageError(
      "Usage: repochan order extract <orderId> [--result-version <v>] [--rows <n> --cols <n>] " +
      "[--strategy chroma-grid|equal-cell|ml-blobs|hybrid] [--pipeline v1|v2] [--ml-fallback] [--model small|medium] [--json]",
    );
  }
  const order = await readOrder(cwd, orderId);
  if (order.status !== "delivered") {
    throw new UsageError(`Order ${orderId} must be delivered before order extract (status: ${order.status}). Deliver a result first (order create-result / candidate promote, then set-status delivered).`);
  }
  const result = await readOrderResult(cwd, orderId, options.resultVersion);
  const versionId = result.version.versionId;
  const versionDir = orderVersionDir(cwd, orderId, versionId);
  const sourceFiles = result.version.files.map((file) => path.isAbsolute(file) ? file : path.join(versionDir, file));
  if (!sourceFiles.length || !(await exists(sourceFiles[0]))) {
    throw new UsageError(`Order ${orderId}/${versionId} has no readable result files to extract from.`);
  }
  const sourceFile = sourceFiles[0];

  // rows/cols: explicit flags win; otherwise default from the order template's grid.
  let templateGrid: TemplateGrid | undefined;
  if (order.templateId) {
    const templates = await loadAllTemplates(await getBuiltinTemplatesDir(), cwd);
    templateGrid = templates.find((template) => template.id === order.templateId)?.grid;
  }
  const rows = optionalPositiveInt(options.rows, "--rows") ?? templateGrid?.rows;
  const cols = optionalPositiveInt(options.cols, "--cols") ?? templateGrid?.cols;
  if (rows === undefined || cols === undefined) {
    throw new UsageError(
      `--rows and --cols are required: order ${orderId} has ${order.templateId ? `template ${order.templateId} without a grid` : "no templateId"} to default from. Pass --rows <n> --cols <n>.`,
    );
  }

  const strategyRaw = options.strategy ?? "chroma-grid";
  if (!(ORDER_EXTRACT_STRATEGIES as readonly string[]).includes(strategyRaw)) {
    throw new UsageError(`--strategy must be ${ORDER_EXTRACT_STRATEGIES.join(" | ")} (got "${options.strategy}")`);
  }
  const strategy = strategyRaw as import("@repochan/image-edit").ExtractStrategy;
  const pipeline = options.pipeline ?? "v2";
  if (pipeline !== "v1" && pipeline !== "v2") {
    throw new UsageError(`--pipeline must be v1 | v2 (got "${options.pipeline}")`);
  }
  if (options.mlFallback && strategy !== "hybrid") {
    throw new UsageError(`--ml-fallback only applies to --strategy hybrid (got "${strategy}")`);
  }
  if (strategy === "hybrid" && options.mlFallback !== true) {
    throw new UsageError("--strategy hybrid requires --ml-fallback (ML assist is always explicit); use --strategy chroma-grid otherwise");
  }
  if (options.model !== undefined && options.model !== "small" && options.model !== "medium") {
    throw new UsageError(`--model must be small | medium (got "${options.model}")`);
  }
  const model = options.model as import("@repochan/image-edit").MatteModel | undefined;

  const requiredBy = `order extract --strategy ${strategy}`;
  if (strategy === "ml-blobs" || strategy === "hybrid") {
    await ensureImageMlCapability(requiredBy, deps);
  }

  // extractAssets requires a semantic mapping + normalize canvas for named
  // strategies. No starter manifest exists here, so derive both: mapping from
  // the template grid's cell_keys when it covers the resolved grid, else
  // positional keys; canvas from the source sheet's cell size (no rescale).
  const named = strategy !== "ml-blobs";
  let mapping: string[] | undefined;
  let normalize: { canvasSize: number; padding: number } | undefined;
  if (named) {
    mapping = templateGrid?.cellKeys && templateGrid.cellKeys.length === rows * cols
      ? templateGrid.cellKeys
      : positionalExtractKeys(rows * cols);
    const { inspectImage } = await import("@repochan/image-edit");
    const inspection = await inspectImage(sourceFile);
    const canvasSize = Math.max(Math.ceil(inspection.width / cols), Math.ceil(inspection.height / rows));
    normalize = { canvasSize, padding: 0 };
  }

  const { extractAssets, matteColorToHex } = await import("@repochan/image-edit");
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-order-extract-"));
  try {
    const extractOut = path.join(tempRoot, "assets");
    const extracted = await (async () => {
      try {
        return await extractAssets(sourceFile, extractOut, {
          strategy,
          rows,
          cols,
          mapping,
          chroma: { pipeline },
          normalize,
          hybrid: strategy === "hybrid"
            ? { mlFallback: true, ...(model ? { model } : {}) }
            : model ? { model } : undefined,
          overwrite: true,
        });
      } catch (err) {
        const missing = contextualizeImageMlCapabilityError(err, requiredBy);
        if (missing) throw missing;
        throw err;
      }
    })();

    // Archiving is this command's primary purpose: a failure here is fatal
    // (unlike asset-apply's best-effort warning) and surfaces as a thrown error.
    const archiveDir = await archiveOrderDerivedRun({
      cwd,
      orderId,
      slot: "manual",
      starter: "image-edit",
      resultVersion: versionId,
      archiveLabel: "extract",
      steps: [{
        op: "extract-grid",
        args: {
          strategy,
          pipeline,
          rows,
          cols,
          sourceVersion: versionId,
          source: result.version.files[0],
          ...(model ? { model } : {}),
        },
        out: "assets",
        copies: [{ out: "assets", sourceBase: tempRoot }],
      }],
    });

    const warnings = extracted.qa.metrics?.warnings ?? [];
    emitResult(
      options,
      `Extracted ${extracted.items.length} assets from order ${orderId}/${versionId} (${extracted.qa.strategyUsed}, chroma ${extracted.qa.pipeline}, matte ${matteColorToHex(extracted.matteColor)} ${extracted.matteColorSource}) → archived at .repochan/orders/${orderId}/${archiveDir}` +
      (warnings.length ? `\nqa warnings:\n- ${warnings.join("\n- ")}` : ""),
      {
        orderId,
        version: versionId,
        sourceFile: extracted.sourceFile,
        rows: extracted.rows,
        cols: extracted.cols,
        strategy: extracted.qa.strategyUsed,
        pipeline: extracted.qa.pipeline,
        matteColor: matteColorToHex(extracted.matteColor),
        matteColorSource: extracted.matteColorSource,
        items: extracted.items.length,
        itemKeys: extracted.items.map((item) => item.key),
        derived: archiveDir,
        qa: extracted.qa,
        ...(warnings.length ? { warnings } : {}),
      },
    );
    return extracted;
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

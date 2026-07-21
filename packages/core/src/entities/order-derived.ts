import path from "node:path";
import { exists, orderDir, readJson, writeJson } from "../protocol/index.js";
import { validateInput } from "../validate.js";
import { OrderDerivedIndexSchema } from "../schemas/index.js";
import { validateOrderId } from "../utils/index.js";
import type { StarterPostprocessOp } from "../starter.js";

/**
 * Derived-artifact archive (audit bypass).
 *
 * `starter asset-apply` copies each kept postprocess step's artifacts into
 * `.repochan/orders/<orderId>/derived/<appliedAt>--<slot>/` and records the
 * run in `.repochan/orders/<orderId>/derived.json`. This is the sanctioned
 * exception to "derived assets never flow back into .repochan/": the copies
 * are an audit trail. They never touch the immutable `versions/` directory.
 */

export type OrderDerivedArtifact = {
  /** Declared step output path (site-root-relative), or `<out>/<file>` for directory outputs. */
  out: string;
  /** Archive copy path relative to the order dir, e.g. `derived/<ts>--<slot>/public/assets/icon.webp`. */
  stored: string;
};

export type OrderDerivedStep = {
  op: StarterPostprocessOp;
  args?: Record<string, unknown>;
  out: string;
  keep?: boolean;
  artifacts: OrderDerivedArtifact[];
};

export type OrderDerivedEntry = {
  slot: string;
  starter: string;
  resultVersion: string;
  appliedAt: string;
  archiveDir: string;
  steps: OrderDerivedStep[];
};

export type OrderDerivedIndex = {
  schemaVersion: "repochan.order-derived.v1";
  orderId: string;
  entries: OrderDerivedEntry[];
};

export function orderDerivedJsonPath(projectRoot: string, orderId: string) {
  return path.join(orderDir(projectRoot, orderId), "derived.json");
}

export async function readOrderDerived(projectRoot: string, orderId: string): Promise<OrderDerivedIndex | undefined> {
  const file = orderDerivedJsonPath(projectRoot, validateOrderId(orderId));
  if (!(await exists(file))) return undefined;
  const data = await readJson(file);
  validateInput("order.derived", OrderDerivedIndexSchema, data);
  return data as OrderDerivedIndex;
}

/**
 * Append one asset-apply run to the order's derived.json, creating the index
 * on first use. Append-only: re-applying the same slot+version adds another
 * entry instead of replacing (audit history). Written atomically via the
 * protocol writeJson (staging temp + rename).
 */
export async function appendOrderDerivedEntry(
  projectRoot: string,
  orderId: string,
  entry: OrderDerivedEntry,
): Promise<OrderDerivedIndex> {
  const id = validateOrderId(orderId);
  const index: OrderDerivedIndex = (await readOrderDerived(projectRoot, id)) ?? {
    schemaVersion: "repochan.order-derived.v1",
    orderId: id,
    entries: [],
  };
  index.entries.push(entry);
  validateInput("order.derived", OrderDerivedIndexSchema, index);
  await writeJson(orderDerivedJsonPath(projectRoot, id), index, true);
  return index;
}

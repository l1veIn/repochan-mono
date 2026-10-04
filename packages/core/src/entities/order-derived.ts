import path from "node:path";
import { promises as fs } from "node:fs";
import { assertNoProtocolSymlinkPath, exists, initProtocol, orderDir, protocolRoot, readJson, writeJson } from "../protocol/index.js";
import { validateInput } from "../validate.js";
import { OrderDerivedIndexSchema } from "../schemas/index.js";
import { validateOrderId } from "../utils/index.js";
import { withOrderMutationLock } from "../protocol/order-lock.js";
import { assertNoPendingOrderRecovery } from "./order-transactions.js";
import type { StarterPostprocessOp } from "../starter.js";

/**
 * Derived-artifact archive (audit bypass).
 *
 * `starter asset-apply` copies each kept postprocess step's artifacts into
 * `.repochan/orders/<orderId>/derived/<appliedAt>--<slot>--<nonce>/` and records the
 * run in `.repochan/orders/<orderId>/derived.json`. This is the sanctioned
 * exception to "derived assets never flow back into .repochan/": the copies
 * are an audit trail. They never touch the immutable `versions/` directory.
 */

export type OrderDerivedArtifact = {
  /** Declared step output path (site-root-relative), or `<out>/<file>` for directory outputs. */
  out: string;
  /** Archive copy path relative to the order dir, e.g. `derived/<ts>--<slot>--<nonce>/public/assets/icon.webp`. */
  stored: string;
};

export type OrderDerivedStep = {
  /** Historical "extract-stickers" may appear in append-only archives; new starter manifests can no longer select it. */
  op: StarterPostprocessOp | "extract-stickers";
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

/** Only archive-relative, portable paths may identify copies in an audit run. */
function archivePath(orderRoot: string, relative: string): string {
  if (/[\\:\0]/.test(relative) || relative.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe derived archive path: ${relative}`);
  }
  return path.resolve(orderRoot, ...relative.split("/"));
}

async function validateArchivedArtifacts(projectRoot: string, orderId: string, entry: OrderDerivedEntry): Promise<void> {
  const orderRoot = orderDir(projectRoot, orderId);
  const archiveRoot = archivePath(orderRoot, entry.archiveDir);
  if (!entry.archiveDir.startsWith("derived/")) throw new Error(`Invalid derived archive directory: ${entry.archiveDir}`);
  for (const step of entry.steps) {
    for (const artifact of step.artifacts) {
      const stored = archivePath(orderRoot, artifact.stored);
      if (!stored.startsWith(`${archiveRoot}${path.sep}`)) {
        throw new Error(`Derived archive artifact is outside its archiveDir: ${artifact.stored}`);
      }
      try {
        await assertNoProtocolSymlinkPath(stored);
        const stat = await fs.lstat(stored);
        if (!stat.isFile() || stat.size === 0) throw new Error("not a non-empty regular file");
        const handle = await fs.open(stored, "r");
        try {
          const opened = await handle.stat();
          if (!opened.isFile() || opened.size === 0 || (await handle.read(Buffer.alloc(1), 0, 1, 0)).bytesRead !== 1) {
            throw new Error("not a readable, non-empty regular file");
          }
        } finally {
          await handle.close();
        }
      } catch (cause) {
        throw new Error(`Derived archive artifact is missing, empty, unreadable, or unsafe: ${artifact.stored}`, { cause });
      }
    }
  }
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
  // Generic recovery may restore this entire order. Finish it before reading
  // audit history, outside the order lock that recovery itself acquires.
  await initProtocol(projectRoot);
  return withOrderMutationLock(projectRoot, id, "order.derived append", async () => {
    await assertNoPendingOrderRecovery(projectRoot, id);
    // A different process can leave a recovery journal after initialization
    // but before this lock is acquired. Do not append into its prior snapshot.
    const transactions = path.join(protocolRoot(projectRoot), ".transactions");
    const pending = await fs.readdir(transactions).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    });
    for (const transaction of pending) {
      const intentFile = path.join(transactions, transaction, "intent.json");
      if (!(await exists(intentFile))) continue;
      const intent = await readJson(intentFile) as { targets?: unknown };
      if (!Array.isArray(intent.targets)) throw new Error(`Invalid protocol transaction intent: ${intentFile}`);
      if (intent.targets.some((target) => target === "orders" || target === `orders/${id}`
        || (typeof target === "string" && target.startsWith(`orders/${id}/`)))) {
        throw new Error(`Order ${id} has a pending protocol transaction at ${path.dirname(intentFile)}. Retry after recovery.`);
      }
    }
    const index: OrderDerivedIndex = (await readOrderDerived(projectRoot, id)) ?? {
      schemaVersion: "repochan.order-derived.v1",
      orderId: id,
      entries: [],
    };
    index.entries.push(entry);
    validateInput("order.derived", OrderDerivedIndexSchema, index);
    // Copies are staged by the CLI before this lock. Recovery can remove a
    // copy made after its snapshot; never commit an index pointing at it.
    await validateArchivedArtifacts(projectRoot, id, entry);
    await writeJson(orderDerivedJsonPath(projectRoot, id), index, true);
    return index;
  });
}

import path from "node:path";
import type { AssetOrder, JsonObject, ReviewArtifact, ReviewVerdict } from "../types.js";
import { exists, initProtocol, orderJsonPath, orderVersionDir, readJson, requireAnalysis, reviewJsonPath, reviewVersionsDir, stamp, stampForPath, writeJson } from "../protocol/index.js";
import { validateInput } from "../validate.js";
import { ReviewCreateParamsSchema } from "../schemas/index.js";
import { validateOrderId, validateVersionId } from "../utils/index.js";
import { withOrderMutationLock } from "./order-transactions.js";

/**
 * Check whether an order result version exists (either as a directory under
 * versions/ or embedded in order.orderAsset.versions). Used by createReview
 * to refuse reviewing a non-existent delivery.
 */
async function orderResultExists(projectRoot: string, orderId: string, order: AssetOrder, versionId: string): Promise<boolean> {
  // Fast path: check embedded versions first (createOrderResult stores them here)
  const embedded = order.orderAsset?.versions;
  if (Array.isArray(embedded) && embedded.some((v: any) => v.versionId === versionId)) return true;
  // Fallback: check filesystem
  return exists(orderVersionDir(projectRoot, orderId, versionId));
}

export async function createReview(projectRoot: string, params: JsonObject) {
  validateInput("review.create", ReviewCreateParamsSchema, params);
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);

  const orderId = validateOrderId(String(params.orderId ?? ""));
  const versionId = validateVersionId(String(params.versionId ?? ""));
  const verdict = String(params.verdict ?? "") as ReviewVerdict;

  // The order must exist.
  const orderFile = orderJsonPath(projectRoot, orderId);
  if (!(await exists(orderFile))) {
    throw new Error(`Cannot review: order ${orderId} does not exist.`);
  }
  const order: AssetOrder = await readJson(orderFile);

  // The reviewed version must exist — can't review a non-existent delivery.
  if (!(await orderResultExists(projectRoot, orderId, order, versionId))) {
    throw new Error(
      `Cannot review: order ${orderId} has no result version '${versionId}'. ` +
        "Only delivered result versions can be reviewed.",
    );
  }

  // Overwrite guard — mirror the page/persona pattern.
  const reviewFile = reviewJsonPath(projectRoot, orderId, versionId);
  const reviewExists = await exists(reviewFile);
  const overwrite = params.overwrite === true;
  if (reviewExists && !overwrite) {
    throw new Error(
      `Review for ${orderId}/${versionId} already exists. Use protocol.read to view it, or pass overwrite=true to replace (the prior review will be archived).`,
    );
  }

  // Archive prior review before overwriting (versionPrevious defaults to true).
  const ts = stampForPath();
  if (reviewExists && overwrite) {
    const archivePath = path.join(reviewVersionsDir(projectRoot, orderId), `${ts}-${versionId}-previous.json`);
    await writeJson(archivePath, await readJson(reviewFile), false);
  }

  // Build the review artifact.
  const provenance = params.provenance ?? { tool: "repochan", action: "review.create" };
  const data: ReviewArtifact = {
    orderId,
    versionId,
    verdict,
    ...(Array.isArray(params.criteriaResults) ? { criteriaResults: params.criteriaResults } : {}),
    ...(typeof params.notes === "string" ? { notes: params.notes } : {}),
    ...(typeof params.reviewerRole === "string" ? { reviewerRole: params.reviewerRole } : {}),
    schemaVersion: "repochan.review.v1",
    generatedAt: stamp(),
    provenance,
  };
  await writeJson(reviewFile, data, reviewExists ? overwrite : false);

  // Verdict side-effect: a non-pass verdict on a DELIVERED order pushes it
  // back to needs_revision, mirroring how addRevision works. Other statuses
  // (draft/in_progress/cancelled) are left untouched — they haven't been
  // "finalized" yet, so a review can't unwind them.
  let next: AssetOrder = { ...order };
  let statusChanged = false;
  if (verdict !== "pass") {
    await withOrderMutationLock(projectRoot, orderId, "review.create order update", async () => {
      next = await readJson(orderFile) as AssetOrder;
      if (String(next.status ?? "") !== "delivered") return;
      next.revisions = Array.isArray(next.revisions) ? next.revisions : [];
      const reason = typeof params.notes === "string" && params.notes.trim()
        ? params.notes.trim()
        : `Review verdict: ${verdict} for version ${versionId}`;
      next.revisions.push({ requestedAt: stamp(), request: reason, status: "draft" });
      next.status = "needs_revision";
      next.updatedAt = stamp();
      statusChanged = true;
      await writeJson(orderFile, next, true);
    });
  }

  return { review: data, order: next, statusChanged };
}

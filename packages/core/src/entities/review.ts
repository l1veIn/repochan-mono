import path from "node:path";
import type { AssetOrder, JsonObject, ReviewArtifact, ReviewVerdict } from "../types.js";
import { exists, initProtocol, orderJsonPath, readReviewArtifact, requireAnalysis, reviewJsonPath, reviewVersionsDir, stamp, stampForPath, withProtocolRollback, writeJson } from "../protocol/index.js";
import { validateInput } from "../validate.js";
import { ReviewArtifactSchema, ReviewCreateParamsSchema } from "../schemas/index.js";
import { validateOrderId, validateVersionId } from "../utils/index.js";
import { readOrderResult } from "./orders.js";
import { readOrder } from "./shared.js";

export async function createReview(projectRoot: string, params: JsonObject) {
  validateInput("review.create", ReviewCreateParamsSchema, params);
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);

  const orderId = validateOrderId(String(params.orderId ?? ""));
  const versionId = validateVersionId(String(params.versionId ?? ""));
  const verdict = String(params.verdict ?? "") as ReviewVerdict;

  const orderFile = orderJsonPath(projectRoot, orderId);
  const reviewFile = reviewJsonPath(projectRoot, orderId, versionId);
  return withProtocolRollback([path.dirname(reviewFile), orderFile], async () => {
    if (!(await exists(orderFile))) {
      throw new Error(`Cannot review: order ${orderId} does not exist.`);
    }
    const order = await readOrder(projectRoot, orderId) as AssetOrder;

    try {
      await readOrderResult(projectRoot, orderId, versionId);
    } catch (error) {
      throw new Error(
        `Cannot review: order ${orderId} has no result version '${versionId}'. ` +
          `Only complete materialized result versions can be reviewed. ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const reviewExists = await exists(reviewFile);
    const overwrite = params.overwrite === true;
    if (reviewExists && !overwrite) {
      throw new Error(
        `Review for ${orderId}/${versionId} already exists. Use protocol.read to view it, or pass overwrite=true to replace (the prior review will be archived).`,
      );
    }
    const priorReview = reviewExists ? await readReviewArtifact(reviewFile) : undefined;

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
    validateInput("review.artifact", ReviewArtifactSchema, data);

    let next: AssetOrder = { ...order };
    let statusChanged = false;
    if (verdict !== "pass" && order.status === "delivered" && order.currentVersion === versionId) {
      const reason = typeof params.notes === "string" && params.notes.trim()
        ? params.notes.trim()
        : `Review verdict: ${verdict} for version ${versionId}`;
      next = {
        ...order,
        revisions: [...(order.revisions ?? []), { requestedAt: stamp(), request: reason, status: "draft" }],
        status: "needs_revision",
        updatedAt: stamp(),
      };
      statusChanged = true;
    }

    if (priorReview) {
      const archivePath = path.join(reviewVersionsDir(projectRoot, orderId), `${stampForPath()}-${versionId}-previous.json`);
      await writeJson(archivePath, priorReview, false);
    }
    await writeJson(reviewFile, data, reviewExists);
    if (statusChanged) await writeJson(orderFile, next, true);

    return { review: data, order: next, statusChanged };
  });
}

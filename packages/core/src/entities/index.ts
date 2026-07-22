// Public API barrel — re-exports all entity operations.
// Consumers import from "@repochan/core" which re-exports this via
// `export * from "./entities/index.js"` in src/index.ts.

export { readOrder, validateStoredOrder, ensureOrderApprovedForExecution } from "./shared.js";
export type { } from "./shared.js";

export { createOrUpdatePersona, createPersonaCandidate, promotePersonaCandidate, listPersonaCandidates } from "./persona.js";

export { createOrUpdateInterview, appendToInterview } from "./interview.js";

export {
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
  findFoundationSheet,
  resolveOrderReferences,
  assertNoSymlinkPath,
} from "./orders.js";

export { createReview } from "./review.js";

export {
  appendOrderDerivedEntry,
  orderDerivedJsonPath,
  readOrderDerived,
  type OrderDerivedArtifact,
  type OrderDerivedEntry,
  type OrderDerivedIndex,
  type OrderDerivedStep,
} from "./order-derived.js";

export { createPersonaReview } from "./persona-review.js";

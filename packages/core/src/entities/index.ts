// Public API barrel — re-exports all entity operations.
// Consumers import from "@repochan/core" which re-exports this via
// `export * from "./entities/index.js"` in src/index.ts.

export { readOrder, ensureOrderApprovedForExecution } from "./shared.js";
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
  setCurrentOrderResult,
  findFoundationSheet,
  resolveOrderReferences,
} from "./orders.js";

export {
  createOrUpdatePage,
  collectAssetRefs,
  checkPageAssets,
  readPage,
} from "./pages.js";
export type { AssetResolution, AssetCheckResult } from "./pages.js";

export { createReview } from "./review.js";

export { createPersonaReview } from "./persona-review.js";

// Slicing — grid-image tile-coordinate computation (no image files generated).
export { readPngSize, computeTileCells, sliceOrderResult } from "../slicing/index.js";
export type { TileCell, TilesMeta } from "../slicing/index.js";

// Sticker extraction — ML matting (whole-grid) + smart blob slicing → transparent PNGs.
export { extractStickers, findConnectedComponents } from "../stickers/index.js";
export type { StickerMeta } from "../stickers/index.js";

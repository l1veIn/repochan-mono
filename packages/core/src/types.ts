export type JsonObject = Record<string, any>;
export type JsonValue = any;

export type OrderStatus = "draft" | "approved" | "in_progress" | "delivered" | "needs_revision" | "cancelled";
export type OrderPriority = "low" | "normal" | "high";

export type OrderResultVersion = JsonObject & {
  versionId: string;
  createdAt: string;
  tool?: string;
  files: string[];
  promptBrief?: string;
  notes?: string;
  provenance?: JsonObject;
  meta?: JsonObject;
};

export type AssetOrder = JsonObject & {
  schemaVersion?: "repochan.asset-order.v1";
  orderId: string;
  batchId?: string;
  requestType: "new_asset" | "revision" | "variant" | "batch_item";
  status?: OrderStatus;
  currentVersion?: string;
  assetType: string;
  priority?: OrderPriority;
  brief: {
    intent: string;
    audience?: string;
    emotionalGoal?: string;
    composition?: string;
    mustInclude: string[];
    avoid: string[];
    creativeFreedom: string[];
    revisionRequest?: string;
    [key: string]: any;
  };
  deliverables: Array<{
    name: string;
    format: string;
    width?: number;
    height?: number;
    aspectRatio?: string;
    transparentBackground?: boolean;
    [key: string]: any;
  }>;
  acceptanceCriteria: string[];
  createdAt?: string;
  updatedAt?: string;
  // orderAsset: the OrderAsset (pictures/products of this order).
  // Previous separate Asset's information (currentVersion, versions list, meta) is now directly here.
  // Pictures (OrderAsset versions) live under orders/<orderId>/versions/<versionId>/
  orderAsset?: {
    currentVersion?: string;
    versions?: OrderResultVersion[];
    meta?: JsonObject;
  };
};

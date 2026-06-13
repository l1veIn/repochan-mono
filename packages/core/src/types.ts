export type JsonObject = Record<string, any>;
export type JsonValue = any;

export type OrderStatus = "draft" | "approved" | "in_progress" | "delivered" | "needs_revision" | "cancelled";
export type OrderPriority = "low" | "normal" | "high";

export type AssetOrder = JsonObject & {
  schemaVersion?: "repochan.asset-order.v1";
  orderId: string;
  batchId?: string;
  requestType: "new_asset" | "revision" | "variant" | "batch_item";
  status?: OrderStatus;
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
};

export type VersionEntry = JsonObject & {
  versionId: string;
  createdAt: string;
  tool: string;
  files: string[];
  promptBrief: string;
  notes: string;
  provenance: JsonObject;
  meta?: JsonObject;
};

export type AssetManifest = JsonObject & {
  schemaVersion: "repochan.asset-manifest.v1";
  assetId: string;
  currentVersion?: string;
  orderIds: string[];
  versions: VersionEntry[];
  meta: JsonObject;
  updatedAt?: string;
};

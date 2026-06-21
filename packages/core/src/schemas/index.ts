import { Type } from "typebox";

export const JsonValueSchema = Type.Any({ description: "JSON-serializable value." });

export const OrderStatusSchema = Type.Union([
  Type.Literal("draft"),
  Type.Literal("approved"),
  Type.Literal("in_progress"),
  Type.Literal("delivered"),
  Type.Literal("needs_revision"),
  Type.Literal("cancelled"),
]);

export const AssetOrderSchema = Type.Object({
  schemaVersion: Type.Optional(Type.Literal("repochan.asset-order.v1")),
  orderId: Type.String({ pattern: "^ord-[a-z0-9][a-z0-9-]*$" }),
  batchId: Type.Optional(Type.String()),
  requestType: Type.Union([
    Type.Literal("new_asset"),
    Type.Literal("revision"),
    Type.Literal("variant"),
    Type.Literal("batch_item"),
  ]),
  status: Type.Optional(OrderStatusSchema),
  currentVersion: Type.Optional(Type.String()),
  assetType: Type.String(),
  priority: Type.Optional(Type.Union([Type.Literal("low"), Type.Literal("normal"), Type.Literal("high")])),
  references: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
  brief: Type.Object({
    intent: Type.String(),
    audience: Type.Optional(Type.String()),
    emotionalGoal: Type.Optional(Type.String()),
    composition: Type.Optional(Type.String()),
    mustInclude: Type.Array(Type.String()),
    avoid: Type.Array(Type.String()),
    creativeFreedom: Type.Array(Type.String()),
    revisionRequest: Type.Optional(Type.String()),
  }),
  deliverables: Type.Array(
    Type.Object({
      name: Type.String(),
      format: Type.String(),
      width: Type.Optional(Type.Number()),
      height: Type.Optional(Type.Number()),
      aspectRatio: Type.Optional(Type.String()),
      transparentBackground: Type.Optional(Type.Boolean()),
    }),
  ),
  acceptanceCriteria: Type.Array(Type.String()),
  notes: Type.Optional(Type.String()),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  // orderAsset: the product (images) info - previous separate Asset data now embedded directly here
  orderAsset: Type.Optional(Type.Object({
    currentVersion: Type.Optional(Type.String()),
    versions: Type.Optional(Type.Array(Type.Object({
      versionId: Type.String(),
      createdAt: Type.String(),
      tool: Type.Optional(Type.String()),
      files: Type.Array(Type.String()),
      promptBrief: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String()),
      provenance: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
      meta: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
    }))),
    meta: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
  })),
});

export const PersonaArtifactSchema = Type.Record(Type.String(), JsonValueSchema, {
  description: "Completed RepoChan persona artifact. The unified tool stamps schemaVersion and generatedAt.",
});

export const AnalysisArtifactSchema = Type.Record(Type.String(), JsonValueSchema, {
  description: "RepoChan deterministic repository analysis artifact.",
});

export const OrderResultVersionSchema = Type.Object({
  versionId: Type.String(),
  createdAt: Type.String(),
  tool: Type.Optional(Type.String()),
  files: Type.Array(Type.String()),
  promptBrief: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  provenance: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
  meta: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
});

export const ProvenanceSchema = Type.Record(Type.String(), JsonValueSchema);

import { Type } from "typebox";
import type { TSchema } from "typebox";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const JsonValueSchema = Type.Any({ description: "JSON-serializable value." });

export const OrderStatusSchema = Type.Union([
  Type.Literal("draft"),
  Type.Literal("approved"),
  Type.Literal("in_progress"),
  Type.Literal("delivered"),
  Type.Literal("needs_revision"),
  Type.Literal("cancelled"),
]);

const OrderIdSchema = Type.String({ pattern: "^ord-[a-z0-9][a-z0-9-]*$", description: "Order ID, e.g. 'ord-foundation-001'." });
const VersionIdSchema = Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]*$", description: "Version ID." });
const ProvenanceSchema = Type.Record(Type.String(), JsonValueSchema, { description: "Provenance metadata: who/what produced this artifact." });

// ---------------------------------------------------------------------------
// Entity schemas (on-disk artifact shapes)
// ---------------------------------------------------------------------------

export const OrderResultVersionSchema = Type.Object({
  versionId: VersionIdSchema,
  createdAt: Type.String(),
  tool: Type.Optional(Type.String()),
  files: Type.Array(Type.String()),
  promptBrief: Type.Optional(Type.String()),
  generationPrompt: Type.Optional(Type.String()),
  revisedPrompt: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  provenance: Type.Optional(ProvenanceSchema),
  meta: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
});

/**
 * Persona artifact — the repository's living mascot.
 *
 * Only `name` and `rolePrompt` are strictly required. Everything else is
 * optional so that early-stage drafts can be saved, but downstream consumers
 * (Painter, Art Director) should check for the fields they need.
 */
export const PersonaArtifactSchema = Type.Object({
  name: Type.String({ description: "Primary name." }),
  rolePrompt: Type.String({ description: "ALWAYS English. Comma-separated tag phrases for image generation." }),

  // ── Optional identity ──
  nameJa: Type.Optional(Type.String()),
  nameZh: Type.Optional(Type.String()),
  ageAppearance: Type.Optional(Type.String()),
  birthday: Type.Optional(Type.String()),
  birthdaySource: Type.Optional(Type.String()),
  occupation: Type.Optional(Type.String()),

  // ── Optional narrative ──
  personality: Type.Optional(Type.String()),
  hobbies: Type.Optional(Type.Array(Type.String())),
  characterFlaws: Type.Optional(Type.Array(Type.String())),
  catchphrase: Type.Optional(Type.String()),
  backstory: Type.Optional(Type.String()),

  // ── Optional visual — colors ──
  mainColor: Type.Optional(Type.String()),
  secondaryColor: Type.Optional(Type.String()),
  accentColors: Type.Optional(Type.Array(Type.String())),

  // ── Optional visual — appearance ──
  appearance: Type.Optional(Type.String()),
  hairColor: Type.Optional(Type.String()),
  eyeColor: Type.Optional(Type.String()),
  outfit: Type.Optional(Type.String()),
  accessories: Type.Optional(Type.Array(Type.String())),
  keyMotifs: Type.Optional(Type.Array(Type.String())),

  // ── Optional visual — posing ──
  signaturePose: Type.Optional(Type.String()),
  signatureAction: Type.Optional(Type.String()),

  // ── Optional visual — design ──
  abilities: Type.Optional(Type.Array(Type.String())),
  designNotes: Type.Optional(Type.String()),

  // ── Meta ──
  language: Type.Optional(Type.String()),
  nativeLanguage: Type.Optional(Type.String()),
  schemaVersion: Type.Optional(Type.String()),
  generatedAt: Type.Optional(Type.String()),
  provenance: Type.Optional(ProvenanceSchema),
});

export const AnalysisArtifactSchema = Type.Object({
  schemaVersion: Type.Optional(Type.Literal("repochan.analysis.v1")),
  generatedAt: Type.Optional(Type.String()),
}, { description: "RepoChan deterministic repository analysis artifact. Additional fields are allowed (the analysis engine produces many runtime fields)." });

// ---------------------------------------------------------------------------
// Write-operation input schemas (params gate)
// ---------------------------------------------------------------------------

/**
 * Design convention for params schemas:
 *
 * - Every field that core reads via `params.X` gets a schema entry here.
 * - Fields that are truly optional (core has a default or tolerates absence)
 *   use Type.Optional().
 * - The schema is a GATE, not a full mirror of the entity. It enforces
 *   "the agent passed the right shape" — business rules (state machine
 *   transitions, conditional requirements like image-gen prompt) are checked
 *   in the entity function AFTER validateInput passes.
 * - Type.AdditionalProperties is NOT stripped: we allow extra keys because
 *   agents may pass provenance, meta, or future fields. The schema enforces
 *   only what core actively reads.
 */

// ── Persona ──

export const PersonaCreateParamsSchema = Type.Object({
  persona: PersonaArtifactSchema,
  overwrite: Type.Optional(Type.Boolean()),
  versionPrevious: Type.Optional(Type.Boolean()),
  slug: Type.Optional(Type.String({ pattern: "^[a-z0-9-]+$" })),
  provenance: Type.Optional(ProvenanceSchema),
});

export const PersonaUpdateParamsSchema = Type.Object({
  persona: PersonaArtifactSchema,
  overwrite: Type.Optional(Type.Boolean()),
  versionPrevious: Type.Optional(Type.Boolean()),
  slug: Type.Optional(Type.String({ pattern: "^[a-z0-9-]+$" })),
  provenance: Type.Optional(ProvenanceSchema),
});

// ── Orders ──

const BriefSchema = Type.Object({
  intent: Type.String(),
  mustInclude: Type.Array(Type.String()),
  avoid: Type.Array(Type.String()),
  creativeFreedom: Type.Array(Type.String()),
  audience: Type.Optional(Type.String()),
  emotionalGoal: Type.Optional(Type.String()),
  composition: Type.Optional(Type.String()),
  revisionRequest: Type.Optional(Type.String()),
});

const DeliverableSchema = Type.Object({
  name: Type.String(),
  format: Type.String(),
  width: Type.Optional(Type.Number()),
  height: Type.Optional(Type.Number()),
  aspectRatio: Type.Optional(Type.String()),
  transparentBackground: Type.Optional(Type.Boolean()),
});

const OrderReferenceSchema = Type.Object({
  orderId: OrderIdSchema,
  role: Type.Union([Type.Literal("character"), Type.Literal("style"), Type.Literal("composition")]),
  versionId: Type.Optional(VersionIdSchema),
});

const SingleOrderSchema = Type.Object({
  orderId: OrderIdSchema,
  requestType: Type.Union([
    Type.Literal("new_asset"),
    Type.Literal("revision"),
    Type.Literal("variant"),
    Type.Literal("batch_item"),
  ]),
  assetType: Type.String(),
  brief: BriefSchema,
  deliverables: Type.Array(DeliverableSchema),
  acceptanceCriteria: Type.Array(Type.String()),
  status: Type.Optional(OrderStatusSchema),
  priority: Type.Optional(Type.Union([Type.Literal("low"), Type.Literal("normal"), Type.Literal("high")])),
  templateId: Type.Optional(Type.String()),
  references: Type.Optional(Type.Array(OrderReferenceSchema)),
  notes: Type.Optional(Type.String()),
});

export const OrderCreateParamsSchema = Type.Object({
  order: Type.Optional(SingleOrderSchema),
  orders: Type.Optional(Type.Array(SingleOrderSchema)),
  overwrite: Type.Optional(Type.Boolean()),
});

export const OrderUpdateParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  overwrite: Type.Boolean({ description: "Must be true — order.update requires explicit approval." }),
  patch: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
  order: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
});

export const OrderSetStatusParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  status: OrderStatusSchema,
});

export const OrderAddRevisionParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  revisionRequest: Type.String({ minLength: 1, description: "Non-empty revision request text." }),
});

export const OrderCreateResultParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  files: Type.Optional(Type.Array(Type.String())),
  versionId: Type.Optional(VersionIdSchema),
  tool: Type.Optional(Type.String()),
  promptBrief: Type.Optional(Type.String()),
  generationPrompt: Type.Optional(Type.String()),
  revisedPrompt: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  meta: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
  provenance: Type.Optional(ProvenanceSchema),
  setCurrent: Type.Optional(Type.Boolean()),
  overwrite: Type.Optional(Type.Boolean()),
  allowUnapprovedOrder: Type.Optional(Type.Boolean()),
  markDelivered: Type.Optional(Type.Boolean()),
});

export const OrderSetCurrentResultParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  versionId: VersionIdSchema,
});

// ── Analysis ──

export const AnalysisRunParamsSchema = Type.Object({
  overwrite: Type.Optional(Type.Boolean()),
  versionPrevious: Type.Optional(Type.Boolean()),
  // AnalyzeInput fields (from schema.ts) — defined loosely since the analysis
  // engine itself does deeper validation. We only gate on the write-relevant
  // params here.
  language: Type.Optional(Type.String()),
  analysis: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
}, { description: "analysis.run params. Most analysis options pass through to the engine; the schema enforces only write-control fields." });

export const AnalysisUpdateParamsSchema = Type.Object({
  overwrite: Type.Boolean({ description: "Must be true — analysis.update requires explicit approval." }),
  patch: Type.Record(Type.String(), JsonValueSchema, { description: "Patch object to deep-merge into current analysis." }),
  versionPrevious: Type.Optional(Type.Boolean()),
  reason: Type.Optional(Type.String()),
});

// ---------------------------------------------------------------------------
// Schema registry (for consumers that need the full list)
// ---------------------------------------------------------------------------

export const WriteOpSchemas = {
  "persona.create": PersonaCreateParamsSchema,
  "persona.update": PersonaUpdateParamsSchema,
  "order.create": OrderCreateParamsSchema,
  "order.update": OrderUpdateParamsSchema,
  "order.set_status": OrderSetStatusParamsSchema,
  "order.add_revision": OrderAddRevisionParamsSchema,
  "order.create_result": OrderCreateResultParamsSchema,
  "order.set_current_result": OrderSetCurrentResultParamsSchema,
  "analysis.run": AnalysisRunParamsSchema,
  "analysis.update": AnalysisUpdateParamsSchema,
} satisfies Record<string, TSchema>;

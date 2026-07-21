import { Type } from "typebox";
import type { Static, TSchema } from "typebox";

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
const TimestampSchema = Type.String({ format: "date-time" });
const ProvenanceSchema = Type.Record(Type.String(), JsonValueSchema, { description: "Provenance metadata: who/what produced this artifact." });

// ---------------------------------------------------------------------------
// Entity schemas (on-disk artifact shapes)
// ---------------------------------------------------------------------------

export const OrderResultVersionSchema = Type.Object({
  versionId: VersionIdSchema,
  createdAt: TimestampSchema,
  tool: Type.Optional(Type.String()),
  files: Type.Array(Type.String(), { minItems: 1 }),
  promptBrief: Type.Optional(Type.String()),
  generationPrompt: Type.Optional(Type.String()),
  revisedPrompt: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  provenance: Type.Optional(ProvenanceSchema),
  meta: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
}, { additionalProperties: false });

/**
 * Persona artifact — the repository's living mascot.
 *
 * `name`, `rolePrompt`, and `artStyle` are required. `artStyle` drives
 * downstream template selection (Art Director) and material/rendering style
 * (Painter) — omitting it breaks the style coordination chain.
 * Everything else is optional so that early-stage drafts can be saved,
 * but downstream consumers (Painter, Art Director) should check for the
 * fields they need.
 */
export const PersonaDataSchema = Type.Object({
  name: Type.String({ description: "Primary name." }),
  rolePrompt: Type.String({ description: "ALWAYS English. Comma-separated tag phrases for image generation." }),
  artStyle: Type.String({ description: "Selected art style (e.g. 'cyberpunk neon', 'ghibli watercolor', 'thick paint', 'minimalist flat'). Drives poster and other artistic assets. Always within the anime/2D framework — this is a sub-style, not a switch to realistic/oil painting." }),

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
  motto: Type.Optional(Type.String({ description: "Creed / value statement — what she believes, NOT a situational catchphrase. Complements catchphrase (situational) and backstory (why she is this way)." })),
  funFacts: Type.Optional(Type.Array(Type.String(), { description: "2-4 small quirks / anecdotes. For realistic/daily-world personas especially, this is the natural carrier for atmosphere-level 'subtle unease' details (e.g. 'odd orders always come in on weekends'). Must stay atmospheric, NOT world-law-level — law-level crosses into high concept." })),
  favoriteFood: Type.Optional(Type.Array(Type.String(), { description: "Food preferences. MUST derive from repo emotional signals, NOT literal mapping (a coffee-named framework does not oblige her to love coffee)." })),
  favoriteDrink: Type.Optional(Type.Array(Type.String(), { description: "Drink preferences. Same anti-mechanical-mapping rule as favoriteFood." })),
  specialSkill: Type.Optional(Type.String({ description: "One contrasting everyday talent (e.g. 'can recite the dep tree from memory in 30s'). Distinct from abilities (ACG-named powers)." })),
  height: Type.Optional(Type.String({ description: "Literary height description (e.g. 'about 165cm, slight frame'), NOT a bare number. Helps painters with body proportion." })),

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

  // ── Optional visual — brand extensions ──
  signaturePatterns: Type.Optional(Type.Array(Type.String(), { description: "Brand-specific seamless texture/pattern concepts derived from the character's motifs and color palette (e.g. 'botanical specimen fragments in a 2×2 tileable grid for section backgrounds'). Each entry is one pattern idea, ideally noting its intended use (section bg / border / social OG / merch). Drives visual_pattern asset generation and page/merch background design." })),
  signatureScenes: Type.Optional(Type.Array(Type.String(), { description: "Signature background/worldview scenes that carry the character's world mood (e.g. 'misty botanical library atrium with pressed-flower light', 'stormfront cliffside with bioluminescent rain'). Each entry is one scene concept. Drives poster/background asset generation." })),

  // ── v2 narrative extensions ──
  world: Type.Optional(Type.Object({
    name: Type.String(),
    coreRule: Type.String(),
    atmosphere: Type.String(),
    relationshipToCharacter: Type.String(),
  }, { additionalProperties: false, description: "World setting designed by the World Architect. Drives scene/atmosphere for all downstream visual assets." })),
  character_book: Type.Optional(Type.Object({
    name: Type.String(),
    entries: Type.Array(Type.Object({
      keys: Type.Array(Type.String()),
      content: Type.String(),
    }, { additionalProperties: false })),
  }, { additionalProperties: false, description: "Character book entries for RAG-style context injection." })),
  mes_example: Type.Optional(Type.Array(Type.String(), { description: "Example dialogue lines for the character." })),
  sourceSignals: Type.Optional(Type.Object({
    primarySignal: Type.String(),
    supportingSignals: Type.Array(Type.String()),
  }, { additionalProperties: false, description: "Design provenance: which repo signals drove the character concept." })),
  userIntentSummary: Type.Optional(Type.Object({
    source: Type.String(),
    summary: Type.String(),
  }, { additionalProperties: false, description: "How the creative direction was decided (interview, yolo, etc.)." })),

  // ── Agent-supplied provenance ──
  provenance: Type.Optional(ProvenanceSchema),
}, { additionalProperties: false });

export const PersonaArtifactSchema = Type.Object({
  ...PersonaDataSchema.properties,
  schemaVersion: Type.Literal("repochan.persona.v2"),
    generatedAt: TimestampSchema,
  provenance: ProvenanceSchema,
}, { additionalProperties: false });

const AnalysisContextSchema = Type.Object({
  basic: Type.Record(Type.String(), JsonValueSchema),
  identity: Type.Object({
    namingSeeds: Type.Object({
      primary: Type.Array(Type.String()),
      secondary: Type.Array(Type.String()),
      rationale: Type.Array(Type.String()),
    }, { additionalProperties: false }),
  }, { additionalProperties: false }),
  file_structure: Type.Record(Type.String(), JsonValueSchema),
  inventory: Type.Record(Type.String(), JsonValueSchema),
  tech_stack: Type.Record(Type.String(), JsonValueSchema),
  pre_analysis: Type.Record(Type.String(), JsonValueSchema),
  git_profile: Type.Record(Type.String(), JsonValueSchema),
  docs_narrative: Type.Record(Type.String(), JsonValueSchema),
  github_meta: Type.Record(Type.String(), JsonValueSchema),
  color_palette: Type.Record(Type.String(), JsonValueSchema),
  core_samples: Type.Record(Type.String(), JsonValueSchema),
  deterministic_tooling: Type.Record(Type.String(), JsonValueSchema),
  abstract: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
}, { additionalProperties: false });

export const AnalysisArtifactSchema = Type.Object({
  schemaVersion: Type.Literal("repochan.analysis.v1"),
  generatedAt: TimestampSchema,
  updatedAt: Type.Optional(TimestampSchema),
  revisionReason: Type.Optional(Type.String()),
  context: AnalysisContextSchema,
  persona: Type.Null(),
  error: Type.Null(),
  preAnalysis: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
  abstract: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
  enrichedAt: Type.Optional(TimestampSchema),
}, { additionalProperties: false, description: "RepoChan deterministic repository analysis artifact." });

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
 * - Public write params are closed objects. Extensibility is explicit and
 *   limited to named containers such as provenance, meta, or patch.
 */

// ── Persona ──

export const PersonaCreateParamsSchema = Type.Object({
  persona: PersonaDataSchema,
  overwrite: Type.Optional(Type.Boolean()),
  versionPrevious: Type.Optional(Type.Boolean()),
  slug: Type.Optional(Type.String({ pattern: "^[a-z0-9-]+$" })),
  provenance: Type.Optional(ProvenanceSchema),
}, { additionalProperties: false });

export const PersonaUpdateParamsSchema = Type.Object({
  persona: PersonaDataSchema,
  overwrite: Type.Optional(Type.Boolean()),
  versionPrevious: Type.Optional(Type.Boolean()),
  slug: Type.Optional(Type.String({ pattern: "^[a-z0-9-]+$" })),
  provenance: Type.Optional(ProvenanceSchema),
}, { additionalProperties: false });

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
}, { additionalProperties: false });

const DeliverableSchema = Type.Object({
  name: Type.String(),
  format: Type.String(),
  width: Type.Optional(Type.Number()),
  height: Type.Optional(Type.Number()),
  aspectRatio: Type.Optional(Type.String()),
  transparentBackground: Type.Optional(Type.Boolean()),
  /** Requested generation resolution (WxH), >= the final asset size. The painter
   *  generates at this size and postprocess downscales, keeping assets crisp on
   *  high-DPI displays. Defaults to width/height when omitted. */
  genSize: Type.Optional(Type.String({ pattern: "^\\d+x\\d+$" })),
}, { additionalProperties: false });

const OrderReferenceSchema = Type.Union([
  // order variant
  Type.Object({
    type: Type.Literal("order"),
    orderId: OrderIdSchema,
    role: Type.Union([Type.Literal("character"), Type.Literal("style"), Type.Literal("composition")]),
    versionId: Type.Optional(VersionIdSchema),
  }, { additionalProperties: false }),
  // file variant — references an arbitrary image file by path
  Type.Object({
    type: Type.Literal("file"),
    path: Type.String({ description: "File path relative to projectRoot, or absolute." }),
    role: Type.Union([Type.Literal("character"), Type.Literal("style"), Type.Literal("composition")]),
  }, { additionalProperties: false }),
]);

const OrderRevisionSchema = Type.Object({
  requestedAt: TimestampSchema,
  request: Type.String(),
  status: Type.String(),
}, { additionalProperties: false });

/** Canonical on-disk order lifecycle artifact. */
export const AssetOrderArtifactSchema = Type.Object({
  schemaVersion: Type.Literal("repochan.asset-order.v1"),
  orderId: OrderIdSchema,
  batchId: Type.Optional(Type.String()),
  requestType: Type.Union([
    Type.Literal("new_asset"), Type.Literal("revision"), Type.Literal("variant"), Type.Literal("batch_item"),
  ]),
  status: OrderStatusSchema,
  currentVersion: Type.Optional(VersionIdSchema),
  candidateVersions: Type.Array(VersionIdSchema),
  assetType: Type.String({ minLength: 1 }),
  priority: Type.Union([Type.Literal("low"), Type.Literal("normal"), Type.Literal("high")]),
  templateId: Type.Optional(Type.String()),
  references: Type.Array(OrderReferenceSchema),
  brief: BriefSchema,
  deliverables: Type.Array(DeliverableSchema),
  acceptanceCriteria: Type.Array(Type.String()),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  notes: Type.Optional(Type.String()),
  revisions: Type.Optional(Type.Array(OrderRevisionSchema)),
}, { additionalProperties: false });

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
  status: Type.Optional(Type.Union([
    Type.Literal("draft"),
    Type.Literal("approved"),
    Type.Literal("in_progress"),
    Type.Literal("needs_revision"),
    Type.Literal("cancelled"),
  ])),
  priority: Type.Optional(Type.Union([Type.Literal("low"), Type.Literal("normal"), Type.Literal("high")])),
  templateId: Type.Optional(Type.String()),
  references: Type.Optional(Type.Array(OrderReferenceSchema)),
  notes: Type.Optional(Type.String()),
}, { additionalProperties: false });

export const OrderCreateParamsSchema = Type.Object({
  order: Type.Optional(SingleOrderSchema),
  orders: Type.Optional(Type.Array(SingleOrderSchema)),
  overwrite: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

export const OrderUpdateParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  overwrite: Type.Boolean({ description: "Must be true — order.update requires explicit approval." }),
  patch: Type.Object({
    batchId: Type.Optional(Type.String()),
    requestType: Type.Optional(Type.Union([
      Type.Literal("new_asset"), Type.Literal("revision"), Type.Literal("variant"), Type.Literal("batch_item"),
    ])),
    assetType: Type.Optional(Type.String({ minLength: 1 })),
    priority: Type.Optional(Type.Union([Type.Literal("low"), Type.Literal("normal"), Type.Literal("high")])),
    templateId: Type.Optional(Type.String()),
    references: Type.Optional(Type.Array(OrderReferenceSchema)),
    brief: Type.Optional(Type.Object({
      intent: Type.Optional(Type.String()),
      mustInclude: Type.Optional(Type.Array(Type.String())),
      avoid: Type.Optional(Type.Array(Type.String())),
      creativeFreedom: Type.Optional(Type.Array(Type.String())),
      audience: Type.Optional(Type.String()),
      emotionalGoal: Type.Optional(Type.String()),
      composition: Type.Optional(Type.String()),
      revisionRequest: Type.Optional(Type.String()),
    }, { additionalProperties: false })),
    deliverables: Type.Optional(Type.Array(DeliverableSchema)),
    acceptanceCriteria: Type.Optional(Type.Array(Type.String())),
    notes: Type.Optional(Type.String()),
  }, { additionalProperties: false }),
}, { additionalProperties: false });

export const OrderSetStatusParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  status: OrderStatusSchema,
}, { additionalProperties: false });

export const OrderAddRevisionParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  revisionRequest: Type.String({ minLength: 1, description: "Non-empty revision request text." }),
}, { additionalProperties: false });

export const OrderCreateResultParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  files: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  versionId: Type.Optional(VersionIdSchema),
  tool: Type.Optional(Type.String()),
  promptBrief: Type.Optional(Type.String()),
  generationPrompt: Type.Optional(Type.String()),
  revisedPrompt: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  meta: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
  provenance: Type.Optional(ProvenanceSchema),
}, { additionalProperties: false });

// ── Candidate ──

/**
 * Create a candidate draft version. Same payload shape as create_result, but
 * its id is appended to candidateVersions. It does NOT become currentVersion
 * and does NOT mark the order delivered. Used when the user wants multiple
 * parallel drafts to choose from before promoting one.
 */
export const OrderCreateCandidateParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  files: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  versionId: Type.Optional(VersionIdSchema),
  tool: Type.Optional(Type.String()),
  promptBrief: Type.Optional(Type.String()),
  generationPrompt: Type.Optional(Type.String()),
  revisedPrompt: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  meta: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
  provenance: Type.Optional(ProvenanceSchema),
}, { additionalProperties: false });

/** Promote a candidate version to current; previous results remain immutable history. */
export const OrderPromoteCandidateParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  versionId: VersionIdSchema,
}, { additionalProperties: false });

// ── Analysis ──

export const AnalysisRunParamsSchema = Type.Object({
  overwrite: Type.Optional(Type.Boolean()),
  versionPrevious: Type.Optional(Type.Boolean()),
  // AnalyzeInput fields (from schema.ts) — defined loosely since the analysis
  // engine itself does deeper validation. We only gate on the write-relevant
  // params here.
  corePaths: Type.Optional(Type.Array(Type.String())),
  focusAreas: Type.Optional(Type.Array(Type.String())),
  includeSections: Type.Optional(Type.Array(Type.String())),
  maxSampleFiles: Type.Optional(Type.Number()),
  maxSampleChars: Type.Optional(Type.Number()),
  perFileSampleChars: Type.Optional(Type.Number()),
  colorScanLimit: Type.Optional(Type.Number()),
  includeFileLists: Type.Optional(Type.Boolean()),
}, { additionalProperties: false, description: "analysis.run params." });

export const AnalysisUpdateParamsSchema = Type.Object({
  overwrite: Type.Boolean({ description: "Must be true — analysis.update requires explicit approval." }),
  patch: Type.Record(Type.String(), JsonValueSchema, { description: "Patch object to deep-merge into current analysis." }),
  versionPrevious: Type.Optional(Type.Boolean()),
  reason: Type.Optional(Type.String()),
}, { additionalProperties: false });

export const AnalysisEnrichParamsSchema = Type.Object({
  preAnalysis: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
  abstract: Type.Optional(Type.Record(Type.String(), JsonValueSchema)),
}, { additionalProperties: false, minProperties: 1 });

// ── Interview ──

const InterviewOptionSchema = Type.Object({
  label: Type.String({ description: "1-5 words, ≤60 chars." }),
  description: Type.String({ description: "Explains the choice / its trade-off." }),
}, { additionalProperties: false });

const InterviewQuestionSchema = Type.Object({
  id: Type.String({ description: "Stable id within this report, e.g. \"q1\"." }),
  question: Type.String({ description: "Full question text, ends with \"?\"." }),
  category: Type.Union([
    Type.Literal("tone"),
    Type.Literal("audience"),
    Type.Literal("weight"),
    Type.Literal("world"),
    Type.Literal("style"),
    Type.Literal("reference"),
    Type.Literal("naming"),
    Type.Literal("constraints"),
    Type.Literal("custom"),
  ]),
  rationale: Type.String({ description: "Which analysis signal prompted this question." }),
  options: Type.Optional(Type.Array(InterviewOptionSchema)),
  header: Type.Optional(Type.String({ description: "Short chip label ≤16 chars." })),
  multiSelect: Type.Optional(Type.Boolean()),
  optional: Type.Boolean(),
}, { additionalProperties: false });

const InterviewResponseSchema = Type.Object({
  questionId: Type.String(),
  kind: Type.Union([
    Type.Literal("option"),
    Type.Literal("custom"),
    Type.Literal("multi"),
    Type.Literal("skipped"),
  ]),
  answer: Type.Union([Type.String(), Type.Null()]),
  selected: Type.Optional(Type.Array(Type.String())),
  notes: Type.Optional(Type.String()),
}, { additionalProperties: false });

/**
 * Interview artifact — the output of the Interviewer role.
 */
export const InterviewDataSchema = Type.Object({
  summary: Type.String({ description: "One-paragraph summary of user intent." }),
  keyConstraints: Type.Array(Type.String(), { description: "Hard constraints — must be respected by downstream." }),
  preferences: Type.Optional(Type.Array(Type.String(), { description: "Soft preferences — honor when possible." })),
  avoidList: Type.Optional(Type.Array(Type.String(), { description: "Things the user explicitly does not want." })),
  questions: Type.Optional(Type.Array(InterviewQuestionSchema)),
  responses: Type.Optional(Type.Array(InterviewResponseSchema)),
  provenance: Type.Optional(ProvenanceSchema),
}, { additionalProperties: false, description: "RepoChan interview report content." });

export const InterviewArtifactSchema = Type.Object({
  ...InterviewDataSchema.properties,
  schemaVersion: Type.Literal("repochan.interview.v1"),
    generatedAt: TimestampSchema,
  provenance: ProvenanceSchema,
}, { additionalProperties: false });

export const InterviewCreateParamsSchema = Type.Object({
  interview: InterviewDataSchema,
  overwrite: Type.Optional(Type.Boolean()),
  versionPrevious: Type.Optional(Type.Boolean()),
  slug: Type.Optional(Type.String({ pattern: "^[a-z0-9-]+$" })),
  provenance: Type.Optional(ProvenanceSchema),
}, { additionalProperties: false });

export const InterviewAppendParamsSchema = Type.Object({
  questions: Type.Optional(Type.Array(InterviewQuestionSchema)),
  responses: Type.Optional(Type.Array(InterviewResponseSchema)),
  summary: Type.String({ description: "Updated summary synthesizing all answers so far." }),
  keyConstraints: Type.Optional(Type.Array(Type.String())),
  preferences: Type.Optional(Type.Array(Type.String())),
  avoidList: Type.Optional(Type.Array(Type.String())),
  slug: Type.Optional(Type.String({ pattern: "^[a-z0-9-]+$" })),
  provenance: Type.Optional(ProvenanceSchema),
}, { additionalProperties: false });

// ── Review ──

export const ReviewVerdictSchema = Type.Union([
  Type.Literal("pass"),
  Type.Literal("revise"),
  Type.Literal("reject"),
]);

const CriterionResultSchema = Type.Object({
  criterion: Type.String({ description: "The criterion text (typically from order.acceptanceCriteria)." }),
  passed: Type.Boolean(),
  note: Type.Optional(Type.String()),
}, { additionalProperties: false });

/**
 * Review artifact — a post-hoc evaluation of a delivered order result version.
 *
 * Stored at `.repochan/orders/<orderId>/reviews/<versionId>.json`. Reviews are
 * non-blocking: they are created AFTER delivery, never before. A `revise` or
 * `reject` verdict pushes a `delivered` order back to `needs_revision`.
 */
export const ReviewArtifactSchema = Type.Object({
  orderId: OrderIdSchema,
  versionId: VersionIdSchema,
  verdict: ReviewVerdictSchema,
  criteriaResults: Type.Optional(Type.Array(CriterionResultSchema)),
  notes: Type.Optional(Type.String()),
  reviewerRole: Type.Optional(Type.String({ description: "Who/what produced this review, e.g. 'art-director', 'user'." })),
  schemaVersion: Type.Literal("repochan.review.v1"),
  generatedAt: TimestampSchema,
  provenance: ProvenanceSchema,
}, { additionalProperties: false, description: "RepoChan review artifact — post-hoc evaluation of a delivered order result." });

export const ReviewCreateParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  versionId: VersionIdSchema,
  verdict: ReviewVerdictSchema,
  criteriaResults: Type.Optional(Type.Array(CriterionResultSchema)),
  notes: Type.Optional(Type.String()),
  reviewerRole: Type.Optional(Type.String()),
  provenance: Type.Optional(ProvenanceSchema),
  overwrite: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

// ── Persona review ──

export const PersonaReviewVerdictSchema = Type.Union([
  Type.Literal("pass"),
  Type.Literal("revise"),
]);

export const PersonaReviewArtifactSchema = Type.Object({
  verdict: PersonaReviewVerdictSchema,
  notes: Type.String({ description: "Re-generation guidance for the creative team." }),
  reviewerRole: Type.Optional(Type.String()),
  schemaVersion: Type.Literal("repochan.persona-review.v1"),
  generatedAt: TimestampSchema,
  provenance: ProvenanceSchema,
}, { additionalProperties: false, description: "RepoChan persona review artifact — feedback on the current persona." });

export const PersonaReviewCreateParamsSchema = Type.Object({
  verdict: PersonaReviewVerdictSchema,
  notes: Type.String({ minLength: 1, description: "Non-empty feedback / re-generation guidance." }),
  reviewerRole: Type.Optional(Type.String()),
  provenance: Type.Optional(ProvenanceSchema),
  overwrite: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

// ── Persona candidate ──

/** Create a persona candidate draft — a parallel persona that is NOT promoted to current. */
export const PersonaCandidateCreateParamsSchema = Type.Object({
  persona: PersonaDataSchema,
  slug: Type.String({ pattern: "^[a-z0-9-]+$", description: "Candidate slug, e.g. 'mature', 'playful'." }),
  provenance: Type.Optional(ProvenanceSchema),
  overwrite: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

/** Promote a persona candidate to current — copies it to persona/current.json, archives the old current, deletes the candidate. */
export const PersonaCandidatePromoteParamsSchema = Type.Object({
  slug: Type.String({ pattern: "^[a-z0-9-]+$" }),
}, { additionalProperties: false });

// ── Order derived archive ──

/** One archived file produced by a postprocess step: its declared output path and where the audit copy lives (relative to the order dir). */
export const OrderDerivedArtifactSchema = Type.Object({
  out: Type.String({ minLength: 1 }),
  stored: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

/** Audit record of one postprocess step. `keep: false` steps are recorded with empty artifacts. */
export const OrderDerivedStepSchema = Type.Object({
  op: Type.Union([
    Type.Literal("compress"),
    Type.Literal("slice"),
    Type.Literal("extract-stickers"),
    Type.Literal("chroma-key"),
    Type.Literal("bg-remove"),
    Type.Literal("resize"),
    Type.Literal("favicon"),
    Type.Literal("gif-from-frames"),
    Type.Literal("extract-grid"),
  ]),
  args: Type.Optional(Type.Record(Type.String(), Type.Any())),
  out: Type.String({ minLength: 1 }),
  keep: Type.Optional(Type.Boolean()),
  artifacts: Type.Array(OrderDerivedArtifactSchema),
}, { additionalProperties: false });

/** One asset-apply run against an order result version. Append-only audit history — re-applies add new entries. */
export const OrderDerivedEntrySchema = Type.Object({
  slot: Type.String({ minLength: 1 }),
  starter: Type.String({ minLength: 1 }),
  resultVersion: VersionIdSchema,
  appliedAt: TimestampSchema,
  archiveDir: Type.String({ minLength: 1, pattern: "^derived/" }),
  steps: Type.Array(OrderDerivedStepSchema),
}, { additionalProperties: false });

/** Derived-artifact archive index at `.repochan/orders/<orderId>/derived.json`. */
export const OrderDerivedIndexSchema = Type.Object({
  schemaVersion: Type.Literal("repochan.order-derived.v1"),
  orderId: OrderIdSchema,
  entries: Type.Array(OrderDerivedEntrySchema),
}, { additionalProperties: false });

// ---------------------------------------------------------------------------
// Schema registry (for consumers that need the full list)
// ---------------------------------------------------------------------------

export const WriteOpSchemas = {
  "persona.create": PersonaCreateParamsSchema,
  "persona.update": PersonaUpdateParamsSchema,
  "interview.create": InterviewCreateParamsSchema,
  "interview.append": InterviewAppendParamsSchema,
  "order.create": OrderCreateParamsSchema,
  "order.update": OrderUpdateParamsSchema,
  "order.set_status": OrderSetStatusParamsSchema,
  "order.add_revision": OrderAddRevisionParamsSchema,
  "order.create_result": OrderCreateResultParamsSchema,
  "order.create_candidate": OrderCreateCandidateParamsSchema,
  "order.promote_candidate": OrderPromoteCandidateParamsSchema,
  "analysis.run": AnalysisRunParamsSchema,
  "analysis.update": AnalysisUpdateParamsSchema,
  "analysis.enrich": AnalysisEnrichParamsSchema,
  "review.create": ReviewCreateParamsSchema,
  "persona.review": PersonaReviewCreateParamsSchema,
  "persona.create_candidate": PersonaCandidateCreateParamsSchema,
  "persona.promote_candidate": PersonaCandidatePromoteParamsSchema,
} satisfies Record<string, TSchema>;

export type StoredAnalysisArtifact = Static<typeof AnalysisArtifactSchema>;
export type StoredPersonaArtifact = Static<typeof PersonaArtifactSchema>;
export type StoredInterviewArtifact = Static<typeof InterviewArtifactSchema>;
export type StoredReviewArtifact = Static<typeof ReviewArtifactSchema>;
export type StoredPersonaReviewArtifact = Static<typeof PersonaReviewArtifactSchema>;

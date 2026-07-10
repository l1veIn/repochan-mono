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

export const VersionRoleSchema = Type.Union([
  Type.Literal("current"),
  Type.Literal("candidate"),
  Type.Literal("snapshot"),
]);

export const OrderResultVersionSchema = Type.Object({
  versionId: VersionIdSchema,
  createdAt: Type.String(),
  tool: Type.Optional(Type.String()),
  files: Type.Array(Type.String()),
  promptBrief: Type.Optional(Type.String()),
  generationPrompt: Type.Optional(Type.String()),
  revisedPrompt: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  role: Type.Optional(VersionRoleSchema),
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
  artStyle: Type.Optional(Type.String({ description: "Selected art style (e.g. 'cyberpunk neon', 'ghibli watercolor', 'thick paint', 'minimalist flat'). Drives poster and other artistic assets. Always within the anime/2D framework — this is a sub-style, not a switch to realistic/oil painting." })),
  proposedArtStyles: Type.Optional(Type.Array(Type.Object({
    style: Type.String({ description: "Art style name, e.g. 'cyberpunk neon'." }),
    reason: Type.String({ description: "Why this style fits the project (1 sentence, derived from repo signals)." }),
  }), { description: "Art style proposals from the World Architect (upstream). The Character Designer selects one as artStyle." })),

  // ── Optional visual — brand extensions ──
  signaturePatterns: Type.Optional(Type.Array(Type.String(), { description: "Brand-specific seamless texture/pattern concepts derived from the character's motifs and color palette (e.g. 'botanical specimen fragments in a 2×2 tileable grid for section backgrounds'). Each entry is one pattern idea, ideally noting its intended use (section bg / border / social OG / merch). Drives visual_pattern asset generation and page/merch background design." })),
  signatureScenes: Type.Optional(Type.Array(Type.String(), { description: "Signature background/worldview scenes that carry the character's world mood (e.g. 'misty botanical library atrium with pressed-flower light', 'stormfront cliffside with bioluminescent rain'). Each entry is one scene concept. Drives poster/background asset generation." })),

  // ── Meta ──
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

// ── Candidate ──

/**
 * Create a candidate draft version. Same payload shape as create_result, but
 * the version is written with role="candidate" — it does NOT become currentVersion
 * and does NOT mark the order delivered. Used when the user wants multiple
 * parallel drafts to choose from before promoting one.
 */
export const OrderCreateCandidateParamsSchema = Type.Object({
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
  overwrite: Type.Optional(Type.Boolean()),
  allowUnapprovedOrder: Type.Optional(Type.Boolean()),
});

/** Promote a candidate version to current. The previous current (if any) is demoted to snapshot. */
export const OrderPromoteCandidateParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  versionId: VersionIdSchema,
});

// ── Slicing ──

/**
 * Compute slicing coordinates for a grid image's result version and write them
 * into meta.json.tiles. Does NOT generate per-cell image files — it only
 * records the {rows, cols, cells} geometry so renderers can crop via CSS.
 *
 * rows/cols are required here because core never parses templates; the pi
 * layer resolves templateId → grid.rows/grid.cols before calling this.
 * versionId is optional (defaults to currentVersion, else latest version dir).
 */
export const OrderSliceParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  versionId: Type.Optional(VersionIdSchema),
  rows: Type.Integer({ minimum: 1, description: "Grid row count (e.g. 4 for a 4×4 sheet)." }),
  cols: Type.Integer({ minimum: 1, description: "Grid column count (e.g. 4 for a 4×4 sheet)." }),
});

/**
 * Extract transparent-background sticker PNGs from a grid image via ML
 * matting. Runs ISNet (@imgly/background-removal-node) on the WHOLE grid
 * once, then slices the transparent result into rows×cols cells. Works on
 * any background (not just plain) because ISNet is a general foreground
 * segmenter. Produces <versionDir>/stickers/sNN.png and records meta.stickers.
 */
export const OrderExtractStickersParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  versionId: Type.Optional(VersionIdSchema),
  rows: Type.Integer({ minimum: 1, description: "Grid row count." }),
  cols: Type.Integer({ minimum: 1, description: "Grid column count." }),
  model: Type.Optional(Type.Union([Type.Literal("small"), Type.Literal("medium"), Type.Literal("large")], { description: "ISNet model size. small (~40MB) by default; larger = slower but higher quality." })),
  overwrite: Type.Optional(Type.Boolean({ description: "Replace existing stickers/ dir if present." })),
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

// ── Interview ──

const InterviewOptionSchema = Type.Object({
  label: Type.String({ description: "1-5 words, ≤60 chars." }),
  description: Type.String({ description: "Explains the choice / its trade-off." }),
});

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
});

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
});

/**
 * Interview artifact — the output of the Interviewer role.
 */
export const InterviewArtifactSchema = Type.Object({
  summary: Type.String({ description: "One-paragraph summary of user intent." }),
  keyConstraints: Type.Array(Type.String(), { description: "Hard constraints — must be respected by downstream." }),
  preferences: Type.Optional(Type.Array(Type.String(), { description: "Soft preferences — honor when possible." })),
  avoidList: Type.Optional(Type.Array(Type.String(), { description: "Things the user explicitly does not want." })),
  questions: Type.Optional(Type.Array(InterviewQuestionSchema)),
  responses: Type.Optional(Type.Array(InterviewResponseSchema)),
  schemaVersion: Type.Optional(Type.String()),
  generatedAt: Type.Optional(Type.String()),
  provenance: Type.Optional(ProvenanceSchema),
}, { description: "RepoChan interview report artifact." });

export const InterviewCreateParamsSchema = Type.Object({
  interview: InterviewArtifactSchema,
  overwrite: Type.Optional(Type.Boolean()),
  versionPrevious: Type.Optional(Type.Boolean()),
  slug: Type.Optional(Type.String({ pattern: "^[a-z0-9-]+$" })),
  provenance: Type.Optional(ProvenanceSchema),
});

export const InterviewAppendParamsSchema = Type.Object({
  questions: Type.Optional(Type.Array(InterviewQuestionSchema)),
  responses: Type.Optional(Type.Array(InterviewResponseSchema)),
  summary: Type.String({ description: "Updated summary synthesizing all answers so far." }),
  keyConstraints: Type.Optional(Type.Array(Type.String())),
  preferences: Type.Optional(Type.Array(Type.String())),
  avoidList: Type.Optional(Type.Array(Type.String())),
  slug: Type.Optional(Type.String({ pattern: "^[a-z0-9-]+$" })),
  provenance: Type.Optional(ProvenanceSchema),
});

// ── Page ──

export const AssetRefSchema = Type.Object({
  orderId: OrderIdSchema,
  file: Type.String({ description: "Filename within the version directory." }),
  versionId: Type.Optional(VersionIdSchema),
  alt: Type.Optional(Type.String()),
});

export const PageLinkSchema = Type.Object({
  label: Type.String(),
  href: Type.String(),
});

export const PageThemeSchema = Type.Object({
  primary: Type.String({ description: "Hex color, e.g. #3B82F6." }),
  secondary: Type.String(),
  accent: Type.String(),
  background: Type.String(),
  style: Type.Union([
    Type.Literal("modern"),
    Type.Literal("playful"),
    Type.Literal("minimal"),
    Type.Literal("techy"),
    Type.Literal("elegant"),
  ]),
  darkMode: Type.Optional(Type.Boolean()),
  fontFamily: Type.Optional(Type.String()),
});

export const NavbarContentSchema = Type.Object({
  brand: Type.String(),
  links: Type.Optional(Type.Array(PageLinkSchema)),
  cta: Type.Optional(PageLinkSchema),
});

export const HeroContentSchema = Type.Object({
  headline: Type.String(),
  subheadline: Type.String(),
  primaryCta: PageLinkSchema,
  secondaryCta: Type.Optional(PageLinkSchema),
  image: Type.Optional(AssetRefSchema),
});

export const FeaturesContentSchema = Type.Object({
  heading: Type.Optional(Type.String()),
  subheading: Type.Optional(Type.String()),
  items: Type.Array(Type.Object({
    icon: Type.Optional(Type.String()),
    title: Type.String(),
    description: Type.String(),
    image: Type.Optional(AssetRefSchema),
  })),
});

export const StatsContentSchema = Type.Object({
  items: Type.Array(Type.Object({
    value: Type.String(),
    label: Type.String(),
  })),
});

export const GalleryContentSchema = Type.Object({
  heading: Type.Optional(Type.String()),
  images: Type.Array(AssetRefSchema),
});

export const CtaContentSchema = Type.Object({
  heading: Type.String(),
  subheading: Type.Optional(Type.String()),
  buttonText: Type.String(),
  buttonHref: Type.String(),
});

export const FooterContentSchema = Type.Object({
  brand: Type.String(),
  copyright: Type.Optional(Type.String()),
  links: Type.Optional(Type.Array(PageLinkSchema)),
  socials: Type.Optional(Type.Array(Type.Object({
    platform: Type.String(),
    href: Type.String(),
  }))),
  logo: Type.Optional(AssetRefSchema),
});

export const PageSectionSchema = Type.Union([
  Type.Object({
    type: Type.Literal("navbar"),
    variant: Type.Union([Type.Literal("simple"), Type.Literal("with-cta")]),
    content: NavbarContentSchema,
  }),
  Type.Object({
    type: Type.Literal("hero"),
    variant: Type.Union([Type.Literal("centered"), Type.Literal("split-right"), Type.Literal("split-left"), Type.Literal("full-bg")]),
    content: HeroContentSchema,
  }),
  Type.Object({
    type: Type.Literal("features"),
    variant: Type.Union([Type.Literal("grid-2"), Type.Literal("grid-3"), Type.Literal("grid-4")]),
    content: FeaturesContentSchema,
  }),
  Type.Object({
    type: Type.Literal("stats"),
    variant: Type.Union([Type.Literal("row"), Type.Literal("grid")]),
    content: StatsContentSchema,
  }),
  Type.Object({
    type: Type.Literal("gallery"),
    variant: Type.Union([Type.Literal("grid"), Type.Literal("masonry")]),
    content: GalleryContentSchema,
  }),
  Type.Object({
    type: Type.Literal("cta"),
    variant: Type.Union([Type.Literal("centered"), Type.Literal("banner")]),
    content: CtaContentSchema,
  }),
  Type.Object({
    type: Type.Literal("footer"),
    variant: Type.Union([Type.Literal("standard"), Type.Literal("minimal")]),
    content: FooterContentSchema,
  }),
]);

export const PageArtifactSchema = Type.Object({
  title: Type.String(),
  description: Type.String(),
  theme: PageThemeSchema,
  sections: Type.Array(PageSectionSchema),
  schemaVersion: Type.Optional(Type.String()),
  generatedAt: Type.Optional(Type.String()),
  provenance: Type.Optional(ProvenanceSchema),
}, { description: "RepoChan static page artifact." });

export const PageCreateParamsSchema = Type.Object({
  page: PageArtifactSchema,
  overwrite: Type.Optional(Type.Boolean()),
  versionPrevious: Type.Optional(Type.Boolean()),
  slug: Type.Optional(Type.String({ pattern: "^[a-z0-9-]+$" })),
  provenance: Type.Optional(ProvenanceSchema),
});

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
});

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
  schemaVersion: Type.Optional(Type.String()),
  generatedAt: Type.Optional(Type.String()),
  provenance: Type.Optional(ProvenanceSchema),
}, { description: "RepoChan review artifact — post-hoc evaluation of a delivered order result." });

export const ReviewCreateParamsSchema = Type.Object({
  orderId: OrderIdSchema,
  versionId: VersionIdSchema,
  verdict: ReviewVerdictSchema,
  criteriaResults: Type.Optional(Type.Array(CriterionResultSchema)),
  notes: Type.Optional(Type.String()),
  reviewerRole: Type.Optional(Type.String()),
  provenance: Type.Optional(ProvenanceSchema),
  overwrite: Type.Optional(Type.Boolean()),
});

// ── Persona review ──

export const PersonaReviewVerdictSchema = Type.Union([
  Type.Literal("pass"),
  Type.Literal("revise"),
]);

export const PersonaReviewArtifactSchema = Type.Object({
  verdict: PersonaReviewVerdictSchema,
  notes: Type.String({ description: "Re-generation guidance for the creative team." }),
  reviewerRole: Type.Optional(Type.String()),
  schemaVersion: Type.Optional(Type.String()),
  generatedAt: Type.Optional(Type.String()),
  provenance: Type.Optional(ProvenanceSchema),
}, { description: "RepoChan persona review artifact — feedback on the current persona." });

export const PersonaReviewCreateParamsSchema = Type.Object({
  verdict: PersonaReviewVerdictSchema,
  notes: Type.String({ minLength: 1, description: "Non-empty feedback / re-generation guidance." }),
  reviewerRole: Type.Optional(Type.String()),
  provenance: Type.Optional(ProvenanceSchema),
  overwrite: Type.Optional(Type.Boolean()),
});

// ── Persona candidate ──

/** Create a persona candidate draft — a parallel persona that is NOT promoted to current. */
export const PersonaCandidateCreateParamsSchema = Type.Object({
  persona: PersonaArtifactSchema,
  slug: Type.String({ pattern: "^[a-z0-9-]+$", description: "Candidate slug, e.g. 'mature', 'playful'." }),
  provenance: Type.Optional(ProvenanceSchema),
  overwrite: Type.Optional(Type.Boolean()),
});

/** Promote a persona candidate to current — copies it to persona/current.json, archives the old current, deletes the candidate. */
export const PersonaCandidatePromoteParamsSchema = Type.Object({
  slug: Type.String({ pattern: "^[a-z0-9-]+$" }),
});

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
  "order.set_current_result": OrderSetCurrentResultParamsSchema,
  "order.create_candidate": OrderCreateCandidateParamsSchema,
  "order.promote_candidate": OrderPromoteCandidateParamsSchema,
  "order.slice": OrderSliceParamsSchema,
  "order.extract_stickers": OrderExtractStickersParamsSchema,
  "analysis.run": AnalysisRunParamsSchema,
  "analysis.update": AnalysisUpdateParamsSchema,
  "page.create": PageCreateParamsSchema,
  "review.create": ReviewCreateParamsSchema,
  "persona.review": PersonaReviewCreateParamsSchema,
  "persona.create_candidate": PersonaCandidateCreateParamsSchema,
  "persona.promote_candidate": PersonaCandidatePromoteParamsSchema,
} satisfies Record<string, TSchema>;

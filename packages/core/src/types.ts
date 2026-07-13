export type JsonObject = Record<string, any>;
export type JsonValue = any;

export type OrderStatus = "draft" | "approved" | "in_progress" | "delivered" | "needs_revision" | "cancelled";
export type OrderPriority = "low" | "normal" | "high";

/** Reference role: how a referenced order result constrains generation. */
export type ReferenceRole = "character" | "style" | "composition";

/**
 * A reference to a visual anchor for generation.
 *
 * Two variants:
 * - **order** (default when `type` is omitted): references another order's
 *   currentVersion (or explicit `versionId`) result. The historical
 *   `{orderId, role}` shape stays valid — `type` is optional for it.
 * - **file**: references an arbitrary image file by path (relative to
 *   `projectRoot`, or absolute). Used for starter reference images and other
 *   out-of-protocol anchors.
 */
export type OrderReference =
  | {
      /** Discriminator. Omitted or `"order"` → reference an order's result. */
      type?: "order";
      /** The orderId to reference (e.g. "ord-foundation-001"). */
      orderId: string;
      /** Specific version to use. If omitted, uses the order's currentVersion. */
      versionId?: string;
      /** How this reference constrains the generation. */
      role: ReferenceRole;
    }
  | {
      /** Discriminator. `"file"` → reference an arbitrary image file path. */
      type: "file";
      /**
       * File path (relative to projectRoot or absolute). Resolved by the
       * resolver, not normalized here — existence is checked at resolve time.
       */
      path: string;
      /** How this reference constrains the generation. */
      role: ReferenceRole;
    };

/** Asset types that serve as the project's visual foundation (anchor for all downstream orders). */
export const FOUNDATION_ASSET_TYPES = ["foundation_sheet", "cover_sheet"] as const;
export type FoundationAssetType = (typeof FOUNDATION_ASSET_TYPES)[number];

/**
 * Structured persona data — the repository's living mascot.
 *
 * Design principles:
 * - `rolePrompt` is ALWAYS English (for image models). All other narrative
 *   fields use the artifact's document language (`language` field).
 * - NO `negativeTraits` field — content safety constraints are built into the
 *   Painter and Creative Writer skills, not stored per-persona.
 * - `characterFlaws` replaces v1's `negativeTraits`: these are personality
 *   quirks that make the character feel alive (clumsy, gluttonous, shy, etc.),
 *   not content-safety boundaries.
 * - Fields are flat for easy template consumption: `{rolePrompt}`, `{hairColor}`,
 *   `{signaturePose}`, etc.
 */
export type PersonaData = {
  // ── Identity ──────────────────────────────────────────────
  /** Primary name. */
  name: string;
  /** Japanese name (optional). */
  nameJa?: string;
  /** Chinese name (optional). */
  nameZh?: string;
  /** Apparent age (e.g., "18", "22"). Not actual age. */
  ageAppearance?: string;
  /** Birthday in MM-DD format. Derived from first git commit when possible. */
  birthday?: string;
  /** Source of birthday: "git_first_commit", "earliest_file", "llm_generated", "manual". */
  birthdaySource?: string;
  /** Occupation / identity — life-like, symbolic, not a software job title. */
  occupation?: string;

  // ── Character (narrative — in user's language) ────────────
  /** Vivid personality description — a real human, not a tech-stack cosplay. */
  personality?: string;
  /** Hobbies — ordinary human interests, not work tasks. */
  hobbies?: string[];
  /**
   * Character flaws / moe points — the things that make her human and lovable.
   * Examples: clumsy, gluttonous, socially anxious, low-energy, scatterbrained,
   * directionally challenged, chronically late, secretly sentimental.
   * These are NOT content-safety constraints. They are personality texture.
   */
  characterFlaws?: string[];
  /** Catchphrase — natural, not cringe. */
  catchphrase?: string;
  /** Backstory tied to repository history/emotional arc (not mechanical tech timeline). */
  backstory?: string;

  // ── Visual — colors ───────────────────────────────────────
  mainColor?: string;
  secondaryColor?: string;
  accentColors?: string[];

  // ── Visual — appearance ───────────────────────────────────
  /** Overall appearance description (in user's language). */
  appearance?: string;
  /** Hair color — specific, with gradient/material if applicable. */
  hairColor?: string;
  /** Eye color — specific. */
  eyeColor?: string;
  /** Outfit — layered description, materials, key pieces. */
  outfit?: string;
  /** Accessories — 3-5 items, each with material/detail. */
  accessories?: string[];
  /** Key visual motifs — 3-5 signature symbols derived from the project. */
  keyMotifs?: string[];

  // ── Visual — posing ───────────────────────────────────────
  /** Signature pose — limb-level precision for the main illustration. */
  signaturePose?: string;
  /** Signature action — a narrative action reflecting project capability. */
  signatureAction?: string;

  // ── Visual — design ───────────────────────────────────────
  /** Abilities — 3-5 items with ACG/fantasy naming style. */
  abilities?: string[];
  /** Design notes — visual guidelines for downstream asset reuse. */
  designNotes?: string;
  /**
   * Selected art style (e.g. 'cyberpunk neon', 'ghibli watercolor', 'thick
   * paint', 'minimalist flat'). REQUIRED — drives downstream template selection
   * (Art Director) and material/rendering style (Painter). Always within the
   * anime/2D framework — this is a sub-style, not a switch to realistic.
   */
  artStyle: string;

  // ── Visual — brand extensions ─────────────────────────────
  /** Brand-specific seamless texture/pattern concepts (2-4), each noting intended use (section bg / border / social OG / merch). */
  signaturePatterns?: string[];
  /** Signature background/worldview scenes (2-3) carrying the character's world mood. */
  signatureScenes?: string[];

  // ── v2 narrative extensions ───────────────────────────────
  /** World setting designed by the World Architect. */
  world?: {
    name: string;
    coreRule: string;
    atmosphere: string;
    relationshipToCharacter: string;
  };
  /** Character book entries for RAG-style context injection. */
  character_book?: {
    name: string;
    entries: Array<{ keys: string[]; content: string }>;
  };
  /** Example dialogue lines for the character. */
  mes_example?: string[];
  /** Design provenance: which repo signals drove the character concept. */
  sourceSignals?: {
    primarySignal: string;
    supportingSignals: string[];
  };
  /** How the creative direction was decided (interview, yolo, etc.). */
  userIntentSummary?: {
    source: string;
    summary: string;
  };

  // ── For image generation ──────────────────────────────────
  /**
   * ALWAYS English. Comma-separated tag phrases, 80–150 words.
   * Order: appearance → outfit → accessories → signature pose.
   * Do NOT include quality tags (masterpiece, best quality) — templates add those.
   * Do NOT describe scene/background/lighting — templates handle that.
   * Only describe the character's own visual features.
   */
  rolePrompt: string;

  // ── Meta ──────────────────────────────────────────────────
  generatedAt?: string;
  provenance?: JsonObject;
};

/** Role of a result version within its order. `current` = the active/promoted version; `candidate` = a parallel draft awaiting selection; `snapshot` = a retired former current. */
export type VersionRole = "current" | "candidate" | "snapshot";

export type OrderResultVersion = JsonObject & {
  versionId: string;
  createdAt: string;
  tool?: string;
  files: string[];
  promptBrief?: string;
  generationPrompt?: string;
  revisedPrompt?: string;
  notes?: string;
  /** Distinguishes parallel candidates from the promoted current and retired snapshots. Omitted on legacy data is treated as "current". */
  role?: VersionRole;
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
  /** Template ID (e.g. "official/foundation-sheet") defining output structure. */
  templateId?: string;
  /** References to other orders' results, used as visual anchors for generation. */
  references?: OrderReference[];
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

// ---------------------------------------------------------------------------
// Interview report
// ---------------------------------------------------------------------------

/**
 * One question in an interview report.
 *
 * Designed to map 1:1 to the `ask_user_question` tool from rpiv-ask-user-question.
 * Each question has structured options (when the LLM pre-designs them) and
 * carries a `rationale` explaining which analysis signal prompted it.
 */
export type InterviewQuestion = {
  /** Stable id within this report, e.g. "q1", "q2-tone". */
  id: string;
  /** Full question text, ends with "?". */
  question: string;
  /** Short chip label for UI display (≤16 chars). */
  header?: string;
  /** Category for downstream consumption. */
  category: "tone" | "audience" | "weight" | "world" | "style" | "reference" | "naming" | "constraints" | "custom";
  /** Why this question was asked — which analysis signal it derives from. */
  rationale: string;
  /** Pre-designed options. When omitted, the question is free-text only. */
  options?: Array<{
    /** 1-5 words, ≤60 chars. */
    label: string;
    /** Explains the choice / its trade-off. */
    description: string;
  }>;
  multiSelect?: boolean;
  /** If true, the user may skip this question. */
  optional: boolean;
};

/**
 * One user response in an interview report.
 * Maps to the `details.answers` shape returned by `ask_user_question`.
 */
export type InterviewResponse = {
  questionId: string;
  kind: "option" | "custom" | "multi" | "skipped";
  /** The primary answer text. Null when the user skipped. */
  answer: string | null;
  /** For multiSelect: the list of selected labels. */
  selected?: string[];
  /** Free-text note attached by the user. */
  notes?: string;
};

/**
 * Interview report — the output of the Interviewer role.
 *
 * Consumed by the Creative Writer (Persona) as **soft** input:
 * `keyConstraints` are treated as hard creative constraints,
 * `preferences` as things to honor when possible,
 * `avoidList` as things the user explicitly does not want.
 *
 * On-disk protocol path: `.repochan/interview/current.json`
 *                        `.repochan/interview/versions/<slug>.json`
 */
export type InterviewReport = JsonObject & {
  schemaVersion?: "repochan.interview.v1";
  generatedAt?: string;
  provenance?: JsonObject;

  questions: InterviewQuestion[];
  responses: InterviewResponse[];

  /** One-paragraph summary of user intent, synthesized by the Interviewer LLM. */
  summary: string;
  /** Hard constraints extracted from the interview — must be respected. */
  keyConstraints: string[];
  /** Soft preferences — honor when possible. */
  preferences: string[];
  /** Things the user explicitly does not want. */
  avoidList: string[];
};

// ── Review ──

/** Outcome of a review. `pass` leaves order status unchanged; `revise`/`reject` push a delivered order back to needs_revision. */
export type ReviewVerdict = "pass" | "revise" | "reject";

/** A single criterion evaluation within a review. Maps to an order's acceptanceCriteria entry. */
export type CriterionResult = {
  /** The criterion text (typically from order.acceptanceCriteria[i]). */
  criterion: string;
  /** Whether this criterion was met. */
  passed: boolean;
  /** Optional reviewer note explaining the judgment. */
  note?: string;
};

/**
 * Review artifact — a post-hoc evaluation of a delivered order result version.
 *
 * Stored at `.repochan/orders/<orderId>/reviews/<versionId>.json`. Reviews are
 * non-blocking: they are created AFTER delivery, never before. A `revise` or
 * `reject` verdict pushes a `delivered` order back to `needs_revision`.
 */
export type ReviewArtifact = JsonObject & {
  /** The order being reviewed. */
  orderId: string;
  /** The specific result version being reviewed. */
  versionId: string;
  /** The review outcome. */
  verdict: ReviewVerdict;
  /** Optional per-criterion evaluation, mapping to the order's acceptanceCriteria. */
  criteriaResults?: CriterionResult[];
  /** Free-form reviewer notes. */
  notes?: string;
  /** Who/what produced this review, e.g. "art-director", "user". */
  reviewerRole?: string;
  schemaVersion?: "repochan.review.v1";
  generatedAt?: string;
  provenance?: JsonObject;
};

// ── Persona review ──

/**
 * Outcome of a persona review. Persona has no state machine, so a `revise`
 * verdict does NOT trigger a status transition — it is a feedback record that
 * the creative team reads and acts on by re-running persona generation.
 */
export type PersonaReviewVerdict = "pass" | "revise";

/**
 * Persona review artifact — feedback on the current persona, stored at
 * `.repochan/persona/reviews/current.json`. When verdict is `revise`, the
 * creative team reads `notes` as re-generation guidance and produces a new
 * persona via persona.create (overwrite=true) or persona.update.
 */
export type PersonaReviewArtifact = JsonObject & {
  /** The review outcome. `pass` = satisfied; `revise` = redo with adjustments. */
  verdict: PersonaReviewVerdict;
  /** Re-generation guidance for the creative team (e.g. "make the character feel more mature"). */
  notes: string;
  /** Who/what produced this review, e.g. "user", "art-director". */
  reviewerRole?: string;
  schemaVersion?: "repochan.persona-review.v1";
  generatedAt?: string;
  provenance?: JsonObject;
};

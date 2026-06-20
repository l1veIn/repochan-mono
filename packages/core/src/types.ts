export type JsonObject = Record<string, any>;
export type JsonValue = any;

export type OrderStatus = "draft" | "approved" | "in_progress" | "delivered" | "needs_revision" | "cancelled";
export type OrderPriority = "low" | "normal" | "high";

/** Reference role: how a referenced order result constrains generation. */
export type ReferenceRole = "character" | "style" | "composition";

/** A reference to another order's result, used as a visual anchor for generation. */
export type OrderReference = {
  /** The orderId to reference (e.g. "ord-foundation-001"). */
  orderId: string;
  /** Specific version to use. If omitted, uses the order's currentVersion. */
  versionId?: string;
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
 *   fields use the user's selected language (`language` field).
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
  /** Language used for narrative fields. rolePrompt is always English. */
  language?: "zh" | "en";
  generatedAt?: string;
  provenance?: JsonObject;
};

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

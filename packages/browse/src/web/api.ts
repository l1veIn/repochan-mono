// API client + shared types for the browse SPA. Shapes mirror packages/browse/src/server.

export type Health = {
  ok: boolean;
  projectRoot: string;
  protocol: { exists: boolean; analysis: boolean; persona: boolean; interview: boolean; orderCount: number };
  starters: { source: { kind: string; dir: string; version?: string | null } | null; starters: Array<{ id: string }> };
};

export type OrderSummary = {
  orderId: string;
  status?: string;
  assetType?: string;
  priority?: string;
  currentVersion?: string;
  resultCount?: number;
  cover?: string | null;
  title?: string | null;
  unreadable?: boolean;
};

export type VersionFile = { name: string; path: string; image: boolean };
export type OrderVersion = {
  versionId: string;
  createdAt: string;
  tool?: string;
  promptBrief?: string;
  generationPrompt?: string;
  notes?: string;
  files: VersionFile[];
};

export type ResolvedReference = {
  type: "order" | "file";
  role: string;
  orderId?: string;
  versionId?: string | null;
  path?: string;
  files: Array<{ path: string | null; external: boolean; name: string }>;
  error: string | null;
};

export type OrderDetail = {
  order: {
    orderId: string;
    status: string;
    assetType: string;
    priority: string;
    templateId?: string;
    requestType: string;
    createdAt: string;
    updatedAt: string;
    notes?: string;
    brief?: { intent?: string; mustInclude?: string[]; avoid?: string[]; creativeFreedom?: string[]; audience?: string; emotionalGoal?: string; composition?: string };
    deliverables?: Array<{ name: string; format: string; width?: number; height?: number }>;
    acceptanceCriteria?: string[];
    references?: unknown[];
  };
  currentVersion: string | null;
  candidateVersions: string[];
  versions: OrderVersion[];
  references: ResolvedReference[];
  derivedAvailable: boolean;
};

export type DerivedEntry = {
  slot: string;
  starter: string;
  resultVersion: string;
  appliedAt: string;
  archiveDir: string;
  artifactCount: number;
  steps: Array<{ op: string; out: string; keep: boolean; artifactCount: number }>;
  artifacts: Array<{ op: string; out: string; stored: string; path: string; image: boolean }>;
};

export type DerivedTimeline = { orderId: string; entries: DerivedEntry[] };

export type PersonaResponse = {
  current: Record<string, unknown> | null;
  versions: Array<{ file: string; generatedAt: string | null; name: string | null; nameZh: string | null }>;
  candidates: Array<{ slug: string; generatedAt: string | null; name: string | null; nameZh: string | null }>;
};

export type GraphNode = {
  id: string;
  kind: "order" | "persona" | "analysis" | "interview" | "derived";
  label: string;
  thumb?: string | null;
  status?: string;
  assetType?: string;
  foundation?: boolean;
};
export type GraphEdge = { from: string; to: string; kind: "reference" | "foundation-anchor" | "derived-from"; role?: string };
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function fileUrl(protocolPath: string): string {
  return `/api/file?path=${encodeURIComponent(protocolPath)}`;
}

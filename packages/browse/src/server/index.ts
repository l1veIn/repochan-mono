import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertNoProtocolSymlinkPath,
  exists,
  findFoundationSheet,
  hasInterview,
  listJsonFiles,
  listOrderResults,
  listOrders,
  listPersonaCandidates,
  orderDerivedJsonPath,
  orderDir,
  personaCandidatePath,
  protocolRoot,
  readJsonIfExists,
  readOrder,
  readOrderDerived,
  relativeProtocolPath,
  resolveOrderReferences,
  safeProtocolPath,
  validateOrderId,
  type OrderDerivedIndex,
  type OrderReference,
} from "@repochan/core";

/** Image extensions the viewer will serve / use as covers (mirrors core shared). */
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
/** Extensions servable through /api/file (protocol files only, after sandbox checks). */
const SERVABLE_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ".ico", ".json", ".txt", ".md"]);

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

/** Starter-source summary injected by the CLI (starter resolution lives in the CLI's starter-loader). */
export type BrowseStartersInfo = {
  source: { kind: string; dir: string; version?: string | null; via?: string } | null;
  starters: Array<{ id: string; version?: string; default?: boolean; tags?: string[] }>;
};

export type BrowseServerOptions = {
  projectRoot: string;
  starters?: BrowseStartersInfo;
};

/** Absolute path of the built SPA directory (vite build output). */
export function webDistDir(): string {
  return fileURLToPath(new URL("../web/", import.meta.url));
}

function sendJson(res: http.ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" });
  res.end(body);
}

function toPosix(rel: string) {
  return rel.split(path.sep).join("/");
}

/** Protocol-root-relative posix path for an absolute path inside .repochan, else null. */
function protocolRelative(projectRoot: string, abs: string): string | null {
  const root = path.resolve(protocolRoot(projectRoot));
  const resolved = path.resolve(abs);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return toPosix(path.relative(root, resolved));
}

async function readJsonTolerant(file: string): Promise<unknown | undefined> {
  try {
    return await readJsonIfExists(file);
  } catch {
    return undefined;
  }
}

async function artifactMeta(file: string): Promise<{ generatedAt?: string } | undefined> {
  const data = (await readJsonTolerant(file)) as { generatedAt?: string } | undefined;
  return data ? { generatedAt: data.generatedAt } : undefined;
}

// ---------------------------------------------------------------------------
// API handlers
// ---------------------------------------------------------------------------

async function handleHealth(projectRoot: string, starters: BrowseStartersInfo | undefined) {
  const root = protocolRoot(projectRoot);
  const protocolExists = await exists(root);
  const { orders } = protocolExists ? await listOrders(projectRoot) : { orders: [] };
  return {
    ok: true,
    projectRoot,
    protocol: {
      exists: protocolExists,
      analysis: await exists(path.join(root, "analysis", "current.json")),
      persona: await exists(path.join(root, "persona", "current.json")),
      interview: await exists(path.join(root, "interview", "current.json")),
      orderCount: orders.length,
    },
    starters: starters ?? { source: null, starters: [] },
  };
}

async function handleTree(projectRoot: string) {
  const root = protocolRoot(projectRoot);
  const { orders } = await listOrders(projectRoot);
  const versionFiles = async (dir: string) => listJsonFiles(dir);
  return {
    projectRoot,
    analysis: {
      exists: await exists(path.join(root, "analysis", "current.json")),
      meta: await artifactMeta(path.join(root, "analysis", "current.json")),
      versions: await versionFiles(path.join(root, "analysis", "versions")),
    },
    persona: {
      exists: await exists(path.join(root, "persona", "current.json")),
      meta: await artifactMeta(path.join(root, "persona", "current.json")),
      versions: await versionFiles(path.join(root, "persona", "versions")),
      candidates: await listPersonaCandidates(projectRoot),
    },
    interview: {
      exists: await hasInterview(projectRoot).catch(() => false),
      meta: await artifactMeta(path.join(root, "interview", "current.json")),
      versions: await versionFiles(path.join(root, "interview", "versions")),
    },
    orders,
  };
}

async function handlePersona(projectRoot: string) {
  const root = protocolRoot(projectRoot);
  const current = await readJsonTolerant(path.join(root, "persona", "current.json"));
  const versionFiles = await listJsonFiles(path.join(root, "persona", "versions"));
  const versions = [];
  for (const file of versionFiles) {
    const data = (await readJsonTolerant(path.join(root, "persona", "versions", file))) as
      | { generatedAt?: string; name?: string; nameZh?: string }
      | undefined;
    versions.push({ file, generatedAt: data?.generatedAt ?? null, name: data?.name ?? null, nameZh: data?.nameZh ?? null });
  }
  const candidates = [];
  for (const slug of await listPersonaCandidates(projectRoot)) {
    const data = (await readJsonTolerant(personaCandidatePath(projectRoot, slug))) as
      | { generatedAt?: string; name?: string; nameZh?: string }
      | undefined;
    candidates.push({ slug, generatedAt: data?.generatedAt ?? null, name: data?.name ?? null, nameZh: data?.nameZh ?? null });
  }
  return { current: current ?? null, versions, candidates };
}

async function handleAnalysis(projectRoot: string) {
  const root = protocolRoot(projectRoot);
  const current = await readJsonTolerant(path.join(root, "analysis", "current.json"));
  const versionFiles = await listJsonFiles(path.join(root, "analysis", "versions"));
  const versions = [];
  for (const file of versionFiles) {
    const data = (await readJsonTolerant(path.join(root, "analysis", "versions", file))) as { generatedAt?: string } | undefined;
    versions.push({ file, generatedAt: data?.generatedAt ?? null });
  }
  return { current: current ?? null, versions };
}

async function handleInterview(projectRoot: string) {
  const root = protocolRoot(projectRoot);
  const current = await readJsonTolerant(path.join(root, "interview", "current.json"));
  const versionFiles = await listJsonFiles(path.join(root, "interview", "versions"));
  const versions = [];
  for (const file of versionFiles) {
    const data = (await readJsonTolerant(path.join(root, "interview", "versions", file))) as { generatedAt?: string } | undefined;
    versions.push({ file, generatedAt: data?.generatedAt ?? null });
  }
  return { current: current ?? null, versions };
}

type OrderListEntry = {
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

async function orderCover(projectRoot: string, orderId: string, currentVersion?: string): Promise<string | null> {
  if (!currentVersion) return null;
  try {
    const { results } = await listOrderResults(projectRoot, orderId);
    const version = results.find((r) => r.versionId === currentVersion);
    const image = version?.files.find((f) => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()));
    return image ? `orders/${orderId}/versions/${currentVersion}/${image}` : null;
  } catch {
    return null;
  }
}

async function handleOrders(projectRoot: string) {
  const { orders } = await listOrders(projectRoot);
  const enriched: OrderListEntry[] = [];
  for (const summary of orders) {
    if (summary.unreadable || !summary.orderId) {
      enriched.push({ orderId: summary.orderId ?? summary.file, unreadable: true });
      continue;
    }
    const cover = await orderCover(projectRoot, summary.orderId, summary.currentVersion);
    let title: string | null = null;
    try {
      const order = await readOrder(projectRoot, summary.orderId);
      title = order.brief?.intent ? String(order.brief.intent).slice(0, 80) : null;
    } catch {
      /* tolerate */
    }
    enriched.push({ ...summary, orderId: summary.orderId, cover, title });
  }
  return { orders: enriched };
}

async function resolveReferenceTolerant(projectRoot: string, ownerOrderId: string, ref: OrderReference) {
  const base = ref.type === "order"
    ? { type: "order" as const, role: ref.role, orderId: ref.orderId, versionId: ref.versionId ?? null }
    : { type: "file" as const, role: ref.role, path: ref.path };
  try {
    const [resolved] = await resolveOrderReferences(projectRoot, [ref], ownerOrderId);
    const files = (resolved?.files ?? []).map((abs) => ({
      path: protocolRelative(projectRoot, abs),
      external: protocolRelative(projectRoot, abs) === null,
      name: path.basename(abs),
    }));
    return { ...base, versionId: resolved?.versionId ?? base.versionId ?? null, files, error: null };
  } catch (error) {
    return { ...base, files: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function handleOrderDetail(projectRoot: string, orderId: string) {
  const order = await readOrder(projectRoot, orderId);
  const { results, currentVersion, candidateVersions } = await listOrderResults(projectRoot, orderId).catch(() => ({
    results: [] as Awaited<ReturnType<typeof listOrderResults>>["results"],
    currentVersion: order.currentVersion,
    candidateVersions: order.candidateVersions ?? [],
  }));
  const versions = results.map((version) => ({
    ...version,
    files: version.files.map((name) => ({
      name,
      path: `orders/${orderId}/versions/${version.versionId}/${name}`,
      image: IMAGE_EXTENSIONS.includes(path.extname(name).toLowerCase()),
    })),
  }));
  const references = [];
  for (const ref of order.references ?? []) {
    references.push(await resolveReferenceTolerant(projectRoot, orderId, ref));
  }
  return {
    order,
    currentVersion: currentVersion ?? null,
    candidateVersions: candidateVersions ?? [],
    versions,
    references,
    derivedAvailable: await exists(orderDerivedJsonPath(projectRoot, orderId)),
  };
}

function derivedTimeline(index: OrderDerivedIndex) {
  return {
    orderId: index.orderId,
    entries: index.entries.map((entry) => ({
      slot: entry.slot,
      starter: entry.starter,
      resultVersion: entry.resultVersion,
      appliedAt: entry.appliedAt,
      archiveDir: entry.archiveDir,
      artifactCount: entry.steps.reduce((sum, step) => sum + step.artifacts.length, 0),
      steps: entry.steps.map((step) => ({
        op: step.op,
        out: step.out,
        keep: step.keep !== false,
        args: step.args ?? {},
        artifactCount: step.artifacts.length,
      })),
      artifacts: entry.steps.flatMap((step) =>
        step.artifacts.map((artifact) => ({
          op: step.op,
          out: artifact.out,
          stored: artifact.stored,
          path: `orders/${index.orderId}/${artifact.stored}`,
          image: IMAGE_EXTENSIONS.includes(path.extname(artifact.stored).toLowerCase()),
        })),
      ),
    })),
  };
}

async function handleOrderDerived(projectRoot: string, orderId: string) {
  const index = await readOrderDerived(projectRoot, orderId);
  if (!index) return undefined;
  return derivedTimeline(index);
}

type GraphNode = {
  id: string;
  kind: "order" | "persona" | "analysis" | "interview" | "derived";
  label: string;
  thumb?: string | null;
  status?: string;
  assetType?: string;
  foundation?: boolean;
};
type GraphEdge = { from: string; to: string; kind: "reference" | "foundation-anchor" | "derived-from"; role?: string };

async function handleGraph(projectRoot: string) {
  const root = protocolRoot(projectRoot);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const foundation = await findFoundationSheet(projectRoot).catch(() => null);

  if (await exists(path.join(root, "persona", "current.json"))) {
    const persona = (await readJsonTolerant(path.join(root, "persona", "current.json"))) as { name?: string } | undefined;
    nodes.push({ id: "persona:current", kind: "persona", label: persona?.name ? `Persona · ${persona.name}` : "Persona" });
  }
  if (await exists(path.join(root, "analysis", "current.json"))) {
    nodes.push({ id: "analysis:current", kind: "analysis", label: "Analysis" });
  }
  if (await exists(path.join(root, "interview", "current.json"))) {
    nodes.push({ id: "interview:current", kind: "interview", label: "Interview" });
  }

  const { orders } = await listOrders(projectRoot);
  const orderIds = new Set<string>();
  for (const summary of orders) {
    if (summary.unreadable || !summary.orderId) continue;
    orderIds.add(summary.orderId);
    nodes.push({
      id: `order:${summary.orderId}`,
      kind: "order",
      label: summary.orderId,
      thumb: await orderCover(projectRoot, summary.orderId, summary.currentVersion),
      status: summary.status,
      assetType: summary.assetType,
      foundation: foundation?.orderId === summary.orderId,
    });
  }

  for (const orderId of orderIds) {
    const order = await readOrder(projectRoot, orderId).catch(() => null);
    if (!order) continue;
    for (const ref of order.references ?? []) {
      if (ref.type !== "order") continue;
      if (!orderIds.has(ref.orderId)) continue;
      edges.push({
        from: `order:${orderId}`,
        to: `order:${ref.orderId}`,
        kind: foundation?.orderId === ref.orderId ? "foundation-anchor" : "reference",
        role: ref.role,
      });
    }
    const derived = await readOrderDerived(projectRoot, orderId).catch(() => undefined);
    if (derived && derived.entries.length > 0) {
      const derivedNodeId = `derived:${orderId}`;
      nodes.push({ id: derivedNodeId, kind: "derived", label: `Derived · ${orderId}` });
      edges.push({ from: derivedNodeId, to: `order:${orderId}`, kind: "derived-from" });
    }
  }

  return { nodes, edges };
}

async function handleFile(projectRoot: string, rawPath: string, res: http.ServerResponse) {
  let abs: string;
  try {
    abs = safeProtocolPath(projectRoot, rawPath);
  } catch {
    sendJson(res, 403, { error: "path escapes .repochan protocol root" });
    return;
  }
  try {
    await assertNoProtocolSymlinkPath(abs);
  } catch {
    sendJson(res, 403, { error: "refusing symlink path" });
    return;
  }
  const ext = path.extname(abs).toLowerCase();
  if (!SERVABLE_EXTENSIONS.has(ext)) {
    sendJson(res, 403, { error: `extension '${ext}' is not servable` });
    return;
  }
  const stat = await fs.stat(abs).catch(() => undefined);
  if (!stat?.isFile()) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  res.writeHead(200, {
    "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
    "content-length": stat.size,
    "cache-control": "no-cache",
  });
  res.end(await fs.readFile(abs));
}

// ---------------------------------------------------------------------------
// Static SPA
// ---------------------------------------------------------------------------

async function serveStatic(webDir: string, urlPath: string, res: http.ServerResponse): Promise<boolean> {
  const clean = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const rel = clean.replace(/^\/+/, "");
  const resolved = path.resolve(webDir, rel);
  const rootResolved = path.resolve(webDir);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) return false;
  const tryFiles = [resolved, path.join(resolved, "index.html")];
  for (const file of tryFiles) {
    const stat = await fs.stat(file).catch(() => undefined);
    if (stat?.isFile()) {
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream", "cache-control": "no-cache" });
      res.end(await fs.readFile(file));
      return true;
    }
  }
  // SPA fallback: extension-less paths render the app shell.
  if (!path.extname(clean)) {
    const index = path.join(webDir, "index.html");
    const stat = await fs.stat(index).catch(() => undefined);
    if (stat?.isFile()) {
      res.writeHead(200, { "content-type": CONTENT_TYPES[".html"], "cache-control": "no-cache" });
      res.end(await fs.readFile(index));
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export function createBrowseServer(options: BrowseServerOptions): http.Server {
  const projectRoot = path.resolve(options.projectRoot);
  const webDir = webDistDir();

  return http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const pathname = url.pathname;

      if (pathname === "/api/health") return sendJson(res, 200, await handleHealth(projectRoot, options.starters));
      if (pathname === "/api/tree") return sendJson(res, 200, await handleTree(projectRoot));
      if (pathname === "/api/persona") return sendJson(res, 200, await handlePersona(projectRoot));
      if (pathname === "/api/analysis") return sendJson(res, 200, await handleAnalysis(projectRoot));
      if (pathname === "/api/interview") return sendJson(res, 200, await handleInterview(projectRoot));
      if (pathname === "/api/orders") return sendJson(res, 200, await handleOrders(projectRoot));
      if (pathname === "/api/graph") return sendJson(res, 200, await handleGraph(projectRoot));
      if (pathname === "/api/file") return await handleFile(projectRoot, url.searchParams.get("path") ?? "", res);

      const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)(\/derived)?$/);
      if (orderMatch) {
        let orderId: string;
        try {
          orderId = validateOrderId(decodeURIComponent(orderMatch[1]));
        } catch {
          return sendJson(res, 400, { error: "invalid order id" });
        }
        if (orderMatch[2] === "/derived") {
          const derived = await handleOrderDerived(projectRoot, orderId);
          if (!derived) return sendJson(res, 404, { error: `order ${orderId} has no derived.json` });
          return sendJson(res, 200, derived);
        }
        return sendJson(res, 200, await handleOrderDetail(projectRoot, orderId));
      }

      if (pathname.startsWith("/api/")) return sendJson(res, 404, { error: "unknown api route" });

      if (req.method === "GET" && (await serveStatic(webDir, pathname, res))) return;
      sendJson(res, 404, { error: "not found" });
    })().catch((error) => {
      if (!res.headersSent) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      } else {
        res.end();
      }
    });
  });
}

/** Convenience: start listening on 127.0.0.1. Returns the bound port. */
export async function listenBrowseServer(server: http.Server, port: number): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  return typeof address === "object" && address ? address.port : port;
}

// Re-export for the CLI's health check convenience.
export { protocolRoot, orderDir, relativeProtocolPath };

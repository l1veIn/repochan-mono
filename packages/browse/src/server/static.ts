import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";

/** Minimal content-type map for static site serving (SPA + astro dist). */
export const STATIC_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export type StaticServerOptions = {
  rootDir: string;
  /** Fall back to index.html for extension-less paths (SPA mode). */
  spaFallback?: boolean;
};

export async function serveStaticPath(rootDir: string, urlPath: string, res: http.ServerResponse, spaFallback: boolean): Promise<boolean> {
  let clean: string;
  try {
    clean = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  } catch {
    return false;
  }
  const rel = clean.replace(/^\/+/, "");
  const resolved = path.resolve(rootDir, rel);
  const rootResolved = path.resolve(rootDir);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) return false;

  const candidates = [resolved, path.join(resolved, "index.html")];
  // Astro builds pretty URLs as <route>/index.html; also try <route>.html.
  if (!path.extname(resolved)) candidates.push(`${resolved}.html`);
  for (const file of candidates) {
    const stat = await fs.stat(file).catch(() => undefined);
    if (stat?.isFile()) {
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        "content-type": STATIC_CONTENT_TYPES[ext] ?? "application/octet-stream",
        "content-length": stat.size,
        "cache-control": "no-cache",
      });
      res.end(await fs.readFile(file));
      return true;
    }
  }
  if (spaFallback && !path.extname(clean)) {
    const index = path.join(rootDir, "index.html");
    const stat = await fs.stat(index).catch(() => undefined);
    if (stat?.isFile()) {
      res.writeHead(200, { "content-type": STATIC_CONTENT_TYPES[".html"], "cache-control": "no-cache" });
      res.end(await fs.readFile(index));
      return true;
    }
  }
  return false;
}

/**
 * Thin static file server bound by the caller to 127.0.0.1. Used both for the
 * browse SPA (spaFallback) and for starter preview dists.
 */
export function createStaticFileServer(options: StaticServerOptions): http.Server {
  const rootDir = path.resolve(options.rootDir);
  return http.createServer((req, res) => {
    void (async () => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "method not allowed" }));
        return;
      }
      const served = await serveStaticPath(rootDir, req.url ?? "/", res, options.spaFallback === true);
      if (!served) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
      }
    })().catch((error) => {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      } else {
        res.end();
      }
    });
  });
}

/** Listen on 127.0.0.1; returns the bound port. */
export async function listenStaticServer(server: http.Server, port: number): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  return typeof address === "object" && address ? address.port : port;
}

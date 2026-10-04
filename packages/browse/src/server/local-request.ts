import type http from "node:http";

/** Loopback binding alone does not prevent browser DNS rebinding or cross-site writes. */
export function allowLocalRequest(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const host = req.headers.host;
  let authority: URL | undefined;
  try {
    if (host) authority = new URL(`http://${host}`);
  } catch { /* invalid Host is rejected below */ }
  let error: string | undefined;
  if (!host || !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host)
    || !authority || !["127.0.0.1", "localhost", "[::1]"].includes(authority.hostname)
    || authority.username || authority.password || authority.pathname !== "/" || authority.search || authority.hash) {
    error = "local Host required";
  } else if (!["GET", "HEAD", "OPTIONS"].includes(req.method ?? "")) {
    const origin = req.headers.origin;
    if (origin && origin !== authority.origin) error = "same-origin writes required";
  }
  if (!error) return true;
  res.writeHead(403, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" });
  res.end(JSON.stringify({ error }));
  return false;
}

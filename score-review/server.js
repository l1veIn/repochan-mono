/**
 * RepoChan Score Review — local web app for human scoring of batch test archives.
 *
 * Scans monorepo `test-results/` for folders named test-*
 * (e.g. test-results/test-repos-archive-20260711-round5), walks project orders + images,
 * serves a review UI, and persists scores as scores.json inside each archive folder.
 *
 * Usage (from this directory):
 *   npm install && npm start
 * Then open http://127.0.0.1:3847
 */

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, ".."); // monorepo root
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

/** Independent local review tool; callers may provide an owned fixture root. */
export function createScoreReviewApp({ root = DEFAULT_ROOT } = {}) {
  const ROOT = fs.realpathSync(path.resolve(root));
  /** Batch archives live under test-results/ (not monorepo root). */
  const ARCHIVES_DIR = path.join(ROOT, "test-results");

  const app = express();
  app.use((req, res, next) => {
    const host = req.get("Host");
    let hostname;
    try { hostname = new URL(`http://${host}`).hostname; } catch { /* rejected below */ }
    if (!["127.0.0.1", "localhost", "[::1]"].includes(hostname)) {
      return res.status(403).json({ error: "local Host required" });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("Origin");
      if (origin && origin !== `http://${host}`) {
        return res.status(403).json({ error: "same-origin writes required" });
      }
    }
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.use(express.static(path.join(__dirname, "public")));
  // Viewer.js (image zoom lightbox)
  app.use(
    "/vendor/viewerjs",
    express.static(path.join(__dirname, "node_modules/viewerjs/dist"))
  );

  // ─── filesystem helpers ──────────────────────────────────────────────────────

  /** Reject symlinks at every archive component, including the archive root. */
  function assertArchivePath(target, allowMissing = false) {
    const resolved = path.resolve(target);
    const relative = path.relative(ARCHIVES_DIR, resolved);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
      throw httpError(400, "path outside archives");
    }
    const parts = ["", ...relative.split(path.sep).filter(Boolean)];
    let current = ARCHIVES_DIR;
    for (const [index, part] of parts.entries()) {
      current = path.join(current, part);
      let stat;
      try { stat = fs.lstatSync(current); }
      catch (error) {
        if (allowMissing && error.code === "ENOENT" && index === parts.length - 1) return resolved;
        if (error.code === "ENOENT") throw httpError(404, "archive path not found");
        throw error;
      }
      if (stat.isSymbolicLink()) throw httpError(403, "archive symlinks are not supported");
      if (index < parts.length - 1 && !stat.isDirectory()) throw httpError(404, "archive directory not found");
    }
    return resolved;
  }

  function isDir(p) {
    try {
      assertArchivePath(p);
      const stat = fs.lstatSync(p);
      return !stat.isSymbolicLink() && stat.isDirectory();
    } catch {
      return false;
    }
  }

  function isFile(p) {
    try {
      assertArchivePath(p);
      const stat = fs.lstatSync(p);
      return !stat.isSymbolicLink() && stat.isFile() && stat.size > 0;
    } catch {
      return false;
    }
  }

  function safeReadJson(p) {
    try {
      if (!isFile(p)) return null;
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }

  function listDirs(dir) {
    if (!isDir(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort();
  }

  /** Resolve the canonical protocol root for a project. */
  function resolveRepochanRoot(projectPath) {
    const nested = path.join(projectPath, ".repochan");
    if (isDir(path.join(nested, "orders")) || isDir(path.join(nested, "persona"))) {
      return nested;
    }
    return null;
  }

  function findImagesInDir(dir) {
    if (!isDir(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .map((f) => path.join(dir, f))
      .sort();
  }

  /**
   * Resolve the canonical current version folder for an order.
   */
  function pickVersionDir(orderDir, orderJson) {
    const versionsRoot = path.join(orderDir, "versions");
    if (!isDir(versionsRoot)) return null;

    const preferred = orderJson?.currentVersion;
    if (typeof preferred !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(preferred)) return null;
    const resolved = path.join(versionsRoot, preferred);
    return isDir(resolved) ? resolved : null;
  }

  function orderRank(orderId) {
    const order = [
      "foundation",
      "found",
      "threeview",
      "banner",
      "readme-banner",
      "poster",
      "icon",
      "chibi",
      "sticker",
      "sticker-grid",
    ];
    const lower = orderId.toLowerCase();
    const idx = order.findIndex((k) => lower.includes(k));
    return idx === -1 ? 50 : idx;
  }

  function loadOrderItem(archiveName, projectName, orderId, orderDir) {
    const orderJson = safeReadJson(path.join(orderDir, "order.json")) || {};
    const versionDir = pickVersionDir(orderDir, orderJson);
    if (!versionDir) return null;

    const metaPath = path.join(versionDir, "meta.json");
    const meta = safeReadJson(metaPath);

    if (!meta || meta.versionId !== path.basename(versionDir) || !Array.isArray(meta.files) || meta.files.length === 0
      || meta.files.some((file) => typeof file !== "string")) return null;
    const imageFiles = meta.files
      .filter((file) => typeof file === "string" && file === path.basename(file) && IMAGE_EXTS.has(path.extname(file).toLowerCase()))
      .map((file) => path.join(versionDir, file))
      .filter(isFile);
    if (imageFiles.length !== meta.files.filter((file) => IMAGE_EXTS.has(path.extname(file).toLowerCase())).length) return null;
    if (imageFiles.length === 0) return null;

    const versionId = meta.versionId;

    const relImages = imageFiles.map((abs) =>
      path.relative(ROOT, abs).split(path.sep).join("/")
    );

    return {
      id: `${projectName}/${orderId}`,
      archive: archiveName,
      project: projectName,
      orderId,
      versionId,
      assetType: orderJson.assetType || null,
      templateId: orderJson.templateId || null,
      status: orderJson.status || null,
      brief: orderJson.brief || null,
      promptBrief: meta.promptBrief || null,
      generationPrompt: meta.generationPrompt || null,
      tool: meta?.tool || null,
      notes: meta?.notes || null,
      createdAt: meta?.createdAt || orderJson.createdAt || null,
      images: relImages,
      primaryImage: relImages[0],
      meta,
      order: {
        orderId: orderJson.orderId || orderId,
        assetType: orderJson.assetType,
        templateId: orderJson.templateId,
        status: orderJson.status,
        brief: orderJson.brief,
        acceptanceCriteria: orderJson.acceptanceCriteria,
        deliverables: orderJson.deliverables,
        references: orderJson.references,
      },
    };
  }

  function scanArchive(archiveName) {
    const archivePath = path.join(ARCHIVES_DIR, archiveName);
    if (!isDir(archivePath)) return null;

    const projects = [];
    const items = [];

    for (const name of listDirs(archivePath)) {
      if (name.startsWith("_") || name === "node_modules") continue;

      const projectPath = path.join(archivePath, name);
      const rcRoot = resolveRepochanRoot(projectPath);
      if (!rcRoot) continue;

      const persona = safeReadJson(path.join(rcRoot, "persona", "current.json"));
      const analysis = safeReadJson(path.join(rcRoot, "analysis", "current.json"));

      const ordersDir = path.join(rcRoot, "orders");
      const orderIds = isDir(ordersDir) ? listDirs(ordersDir) : [];

      const projectOrders = [];
      for (const orderId of orderIds) {
        const item = loadOrderItem(
          archiveName,
          name,
          orderId,
          path.join(ordersDir, orderId)
        );
        if (item) {
          projectOrders.push(item);
          items.push(item);
        }
      }

      projectOrders.sort(
        (a, b) => orderRank(a.orderId) - orderRank(b.orderId) || a.orderId.localeCompare(b.orderId)
      );

      projects.push({
        name,
        orderCount: projectOrders.length,
        personaName: persona?.name || persona?.nameZh || null,
        personaNameZh: persona?.nameZh || null,
        projectTitle:
          analysis?.context?.basic?.project_name ||
          analysis?.basic?.project_name ||
          name,
        hasPersona: !!persona,
        hasAnalysis: !!analysis,
      });
    }

    items.sort((a, b) => {
      if (a.project !== b.project) return a.project.localeCompare(b.project);
      return orderRank(a.orderId) - orderRank(b.orderId) || a.orderId.localeCompare(b.orderId);
    });

    return { name: archiveName, projects, items, itemCount: items.length };
  }

  function scoresPath(archiveName) {
    return path.join(ARCHIVES_DIR, archiveName, "scores.json");
  }

  function loadScores(archiveName) {
    const p = scoresPath(archiveName);
    assertArchivePath(p, true);
    if (!fs.existsSync(p)) {
      return {
        schemaVersion: "repochan.score-review.v1",
        archive: archiveName,
        updatedAt: null,
        currentIndex: 0,
        scores: {},
      };
    }
    let data;
    try { data = JSON.parse(fs.readFileSync(p, "utf8")); }
    catch { throw httpError(422, "scores.json is unreadable; repair it before saving"); }
    if (!isPlainObject(data) || !isPlainObject(data.scores)
      || !Number.isInteger(data.currentIndex ?? 0) || (data.currentIndex ?? 0) < 0) {
      throw httpError(422, "scores.json has invalid review data; repair it before saving");
    }
    for (const [id, entry] of Object.entries(data.scores)) validateEntry(id, entry, 422);
    return data;
  }

  function saveScores(archiveName, data) {
    const p = scoresPath(archiveName);
    data.updatedAt = new Date().toISOString();
    data.archive = archiveName;
    data.schemaVersion = data.schemaVersion || "repochan.score-review.v1";
    assertArchivePath(p, true);
    if (fs.existsSync(p) && !fs.lstatSync(p).isFile()) throw httpError(422, "scores.json must be a regular file");
    const temporary = path.join(path.dirname(p), `.scores-${process.pid}-${randomUUID()}.json`);
    try {
      fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
      assertArchivePath(p, true);
      fs.renameSync(temporary, p);
    } finally {
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    return data;
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function validateEntry(id, entry, status = 400) {
    if (typeof id !== "string" || !id || ["__proto__", "constructor", "prototype"].includes(id) || !isPlainObject(entry)) {
      throw httpError(status, "invalid score entry");
    }
    if (entry.score != null && (!Number.isInteger(entry.score) || entry.score < 1 || entry.score > 10)) {
      throw httpError(status, "score must be an integer from 1 to 10, or null");
    }
    for (const key of ["comment", "rater", "ratedAt"]) {
      if (entry[key] != null && typeof entry[key] !== "string") throw httpError(status, `${key} must be text`);
    }
  }

  function isValidArchiveName(name) {
    return (
      typeof name === "string" &&
      name.startsWith("test-") &&
      !name.includes("..") &&
      !name.includes("/") &&
      !name.includes("\\")
    );
  }

  // ─── API ─────────────────────────────────────────────────────────────────────

  app.get("/api/archives", (_req, res) => {
    if (!isDir(ARCHIVES_DIR)) {
      return res.json({ archives: [], root: ARCHIVES_DIR });
    }

    const all = fs
      .readdirSync(ARCHIVES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith("test-"))
      .map((d) => d.name)
      .sort()
      .reverse();

    const archives = all.map((name) => {
      const scanned = scanArchive(name);
      const scores = loadScores(name);
      const scoredCount = Object.keys(scores.scores || {}).filter((k) => {
        const e = scores.scores[k];
        return e && (e.score != null || (e.comment && String(e.comment).trim()));
      }).length;
      return {
        name,
        itemCount: scanned?.itemCount ?? 0,
        projectCount: scanned?.projects?.length ?? 0,
        scoredCount,
        currentIndex: scores.currentIndex ?? 0,
        updatedAt: scores.updatedAt,
      };
    });

    res.json({ archives, root: ARCHIVES_DIR });
  });

  app.get("/api/archives/:name", (req, res) => {
    const name = req.params.name;
    if (!isValidArchiveName(name)) {
      return res.status(400).json({ error: "invalid archive name" });
    }
    const scanned = scanArchive(name);
    if (!scanned) return res.status(404).json({ error: "archive not found" });
    const scores = loadScores(name);
    res.json({ ...scanned, scores });
  });

  app.get("/api/archives/:name/project/:project", (req, res) => {
    const { name, project } = req.params;
    if (!isValidArchiveName(name) || !project || project.includes("..") || /[\\/:\0]/.test(project)) {
      return res.status(400).json({ error: "invalid path" });
    }
    const projectPath = path.join(ARCHIVES_DIR, name, project);
    const rcRoot = resolveRepochanRoot(projectPath);
    if (!rcRoot) return res.status(404).json({ error: "project not found" });

    const persona = safeReadJson(path.join(rcRoot, "persona", "current.json"));
    const analysis = safeReadJson(path.join(rcRoot, "analysis", "current.json"));

    const basic = analysis?.context?.basic || analysis?.basic || null;
    const identity = analysis?.context?.identity || analysis?.identity || null;

    res.json({
      project,
      persona,
      analysisSummary: basic
        ? {
            project_name: basic.project_name,
            total_files: basic.total_files,
            total_lines: basic.total_lines,
            total_dirs: basic.total_dirs,
            readme_exists: basic.readme_exists,
            first_commit_date: basic.first_commit_date,
            namingSeeds: identity?.namingSeeds?.primary || null,
          }
        : null,
    });
  });

  app.get("/api/archives/:name/scores", (req, res) => {
    const name = req.params.name;
    if (!isValidArchiveName(name)) {
      return res.status(400).json({ error: "invalid archive name" });
    }
    if (!isDir(path.join(ARCHIVES_DIR, name))) return res.status(404).json({ error: "archive not found" });
    res.json(loadScores(name));
  });

  app.put("/api/archives/:name/scores", (req, res) => {
    const name = req.params.name;
    if (!isValidArchiveName(name)) {
      return res.status(400).json({ error: "invalid archive name" });
    }
    if (!isDir(path.join(ARCHIVES_DIR, name))) {
      return res.status(404).json({ error: "archive not found" });
    }
    const body = req.body || {};
    if (!isPlainObject(body)) throw httpError(400, "review update must be an object");
    if (body.currentIndex !== undefined && (!Number.isInteger(body.currentIndex) || body.currentIndex < 0)) {
      throw httpError(400, "currentIndex must be a non-negative integer");
    }
    if (body.itemId !== undefined || body.entry !== undefined) validateEntry(body.itemId, body.entry);
    if (body.scores !== undefined) {
      if (!isPlainObject(body.scores)) throw httpError(400, "scores must be an object");
      for (const [id, entry] of Object.entries(body.scores)) validateEntry(id, entry);
    }
    const existing = loadScores(name);
    const next = {
      ...existing,
      currentIndex:
        typeof body.currentIndex === "number" ? body.currentIndex : existing.currentIndex,
      scores: { ...(existing.scores || {}) },
    };

    if (body.itemId && body.entry) {
      const prev = existing.scores?.[body.itemId] || {};
      next.scores[body.itemId] = {
        ...prev,
        ...body.entry,
        ratedAt: new Date().toISOString(),
      };
    } else if (body.scores && typeof body.scores === "object") {
      next.scores = { ...next.scores, ...body.scores };
    }

    const saved = saveScores(name, next);
    res.json(saved);
  });

  /** Serve archive images safely under test-results/ */
  app.get("/api/file/*", (req, res) => {
    const rel = req.params[0];
    if (!rel || /[\\\0]/.test(rel) || rel.includes("..") || !rel.startsWith("test-results/")
      || !IMAGE_EXTS.has(path.extname(rel).toLowerCase())) {
      return res.status(400).send("bad path");
    }
    const abs = path.join(ROOT, rel);
    const resolved = path.resolve(abs);
    if (!resolved.startsWith(ARCHIVES_DIR + path.sep) && resolved !== ARCHIVES_DIR) {
      return res.status(400).send("bad path");
    }
    if (!isFile(resolved)) {
      return res.status(404).send("not found");
    }
    res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.set("X-Content-Type-Options", "nosniff");
    res.sendFile(resolved);
  });

  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ error: error.message || "review request failed" });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const PORT = Number(process.env.PORT) || 3847;
  createScoreReviewApp().listen(PORT, "127.0.0.1", () => {
    console.log(`\n  RepoChan Score Review`);
    console.log(`  → http://127.0.0.1:${PORT}`);
    console.log(`  scanning archives under: ${path.join(DEFAULT_ROOT, "test-results")}\n`);
  });
}

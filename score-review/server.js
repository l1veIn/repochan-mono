/**
 * RepoChan Score Review — local web app for human scoring of batch test archives.
 *
 * Scans monorepo `test-results/` for folders named test-*
 * (e.g. test-results/test-repos-archive-20260711-round5), walks project orders + images,
 * serves a review UI, and persists scores as scores.json inside each archive folder.
 *
 * Usage (from this directory):
 *   npm install && npm start
 * Then open http://localhost:3847
 */

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // monorepo root
/** Batch archives live under test-results/ (not monorepo root). */
const ARCHIVES_DIR = path.join(ROOT, "test-results");
const PORT = Number(process.env.PORT) || 3847;
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));
// Viewer.js (image zoom lightbox)
app.use(
  "/vendor/viewerjs",
  express.static(path.join(__dirname, "node_modules/viewerjs/dist"))
);

// ─── filesystem helpers ──────────────────────────────────────────────────────

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function safeReadJson(p) {
  try {
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

/** Resolve repochan root for a project: either project/ or project/.repochan/ */
function resolveRepochanRoot(projectPath) {
  const nested = path.join(projectPath, ".repochan");
  if (isDir(path.join(nested, "orders")) || isDir(path.join(nested, "persona"))) {
    return nested;
  }
  // flat layout (round5+): project itself is the repochan root
  if (isDir(path.join(projectPath, "orders")) || isDir(path.join(projectPath, "persona"))) {
    return projectPath;
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
 * Pick the best version folder for an order (prefer currentVersion from order.json,
 * else newest by name).
 */
function pickVersionDir(orderDir, orderJson) {
  const versionsRoot = path.join(orderDir, "versions");
  if (!isDir(versionsRoot)) return null;

  const preferred = orderJson?.currentVersion || orderJson?.orderAsset?.currentVersion;
  if (preferred) {
    const p = path.join(versionsRoot, preferred);
    if (isDir(p)) return p;
  }

  const dirs = fs
    .readdirSync(versionsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  if (dirs.length === 0) {
    // sometimes images sit directly under versions/
    return versionsRoot;
  }
  return path.join(versionsRoot, dirs[dirs.length - 1]);
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

  let imageFiles = [];
  if (meta?.files?.length) {
    imageFiles = meta.files.map((f) => path.join(versionDir, f)).filter(isFile);
  }
  if (imageFiles.length === 0) {
    imageFiles = findImagesInDir(versionDir);
  }
  // also check loose images under versions/ (e.g. foundation_sheet.png)
  if (imageFiles.length === 0) {
    imageFiles = findImagesInDir(path.join(orderDir, "versions"));
  }
  if (imageFiles.length === 0) return null;

  const lastVersion = orderJson.orderAsset?.versions?.at(-1);
  const versionId =
    meta?.versionId || orderJson.currentVersion || path.basename(versionDir);

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
    promptBrief: meta?.promptBrief || lastVersion?.promptBrief || null,
    generationPrompt: meta?.generationPrompt || lastVersion?.generationPrompt || null,
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
  const data = safeReadJson(p);
  if (!data) {
    return {
      schemaVersion: "repochan.score-review.v1",
      archive: archiveName,
      updatedAt: null,
      currentIndex: 0,
      scores: {},
    };
  }
  return data;
}

function saveScores(archiveName, data) {
  const p = scoresPath(archiveName);
  data.updatedAt = new Date().toISOString();
  data.archive = archiveName;
  data.schemaVersion = data.schemaVersion || "repochan.score-review.v1";
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
  return data;
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
  if (!isValidArchiveName(name) || project.includes("..") || project.includes("/")) {
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
  if (!rel || rel.includes("..") || !rel.startsWith("test-results/")) {
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
  res.sendFile(resolved);
});

app.listen(PORT, () => {
  console.log(`\n  RepoChan Score Review`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  scanning archives under: ${ARCHIVES_DIR}\n`);
});

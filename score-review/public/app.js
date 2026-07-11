/**
 * RepoChan Score Review — frontend
 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  archive: null,
  items: [],
  scores: {},
  currentIndex: 0,
  projectCache: {},
  dirty: false,
  saving: false,
  saveTimer: null,
  imageIndex: 0,
  viewer: null,
  viewerOpen: false,
  imageUrls: [],
};

// ── helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fileUrl(rel) {
  return `/api/file/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

function isRated(entry) {
  if (!entry) return false;
  return entry.score != null || (entry.comment && String(entry.comment).trim());
}

function getRater() {
  return ($("#rater-name").value || "").trim() || undefined;
}

function setSaveStatus(kind, text) {
  const el = $("#save-status");
  el.className = `save-status ${kind || ""}`;
  el.textContent = text || "";
}

function prettyJson(obj) {
  if (obj == null || obj === "") return "—";
  if (typeof obj === "string") return obj;
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

// ── API ──────────────────────────────────────────────────────────────────────

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`${res.status} ${t || res.statusText}`);
  }
  return res.json();
}

async function saveCurrent({ silent = false } = {}) {
  if (!state.archive || !state.items.length) return;
  const item = state.items[state.currentIndex];
  if (!item) return;

  const scoreBtn = $(".score-buttons button.active");
  const comment = $("#comment").value;

  const prev = state.scores[item.id] || {};
  const entry = {
    score: scoreBtn ? Number(scoreBtn.dataset.score) : null,
    comment,
    rater: getRater() || prev.rater,
  };

  // skip network if nothing meaningful changed vs last known
  const same =
    (prev.score ?? null) === (entry.score ?? null) &&
    (prev.comment || "") === (entry.comment || "") &&
    (prev.rater || "") === (entry.rater || "");

  state.scores[item.id] = { ...prev, ...entry };

  if (same && !state.dirty) {
    // still persist currentIndex when navigating
    try {
      await api(`/api/archives/${encodeURIComponent(state.archive)}/scores`, {
        method: "PUT",
        body: JSON.stringify({ currentIndex: state.currentIndex }),
      });
    } catch {
      /* ignore index-only failures quietly */
    }
    return;
  }

  state.saving = true;
  if (!silent) setSaveStatus("saving", "保存中…");

  try {
    const saved = await api(`/api/archives/${encodeURIComponent(state.archive)}/scores`, {
      method: "PUT",
      body: JSON.stringify({
        currentIndex: state.currentIndex,
        itemId: item.id,
        entry,
      }),
    });
    state.scores = saved.scores || state.scores;
    state.dirty = false;
    setSaveStatus("saved", "已保存");
    updateScoreMeta(item.id);
    renderQueue();
  } catch (err) {
    setSaveStatus("error", "保存失败");
    console.error(err);
  } finally {
    state.saving = false;
  }
}

function scheduleSave() {
  state.dirty = true;
  setSaveStatus("saving", "…");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => saveCurrent(), 400);
}

async function flushSave() {
  clearTimeout(state.saveTimer);
  if (state.dirty || state.items.length) {
    await saveCurrent({ silent: false });
  }
}

// ── home ─────────────────────────────────────────────────────────────────────

async function loadHome() {
  const data = await api("/api/archives");
  const list = $("#archive-list");
  if (!data.archives?.length) {
    list.innerHTML = `<p class="muted">未找到 test-* 归档目录。<br/>请确认 monorepo 下 <code>test-results/</code> 中存在如 test-repos-archive-… 的文件夹。</p>`;
    return;
  }

  list.innerHTML = data.archives
    .map((a) => {
      const pct = a.itemCount ? Math.round((a.scoredCount / a.itemCount) * 100) : 0;
      const updated = a.updatedAt
        ? `上次保存 ${new Date(a.updatedAt).toLocaleString()}`
        : "尚未评分";
      return `
        <article class="archive-card" data-name="${escapeHtml(a.name)}">
          <h3>${escapeHtml(a.name)}</h3>
          <div class="stats">
            <span>${a.projectCount} 项目</span>
            <span>${a.itemCount} 张图</span>
            <span>${a.scoredCount}/${a.itemCount} 已评</span>
          </div>
          <div class="bar"><span style="width:${pct}%"></span></div>
          <div class="meta-line">${escapeHtml(updated)} · 续评索引 #${(a.currentIndex ?? 0) + 1}</div>
        </article>
      `;
    })
    .join("");

  list.querySelectorAll(".archive-card").forEach((card) => {
    card.addEventListener("click", () => openArchive(card.dataset.name));
  });
}

// ── review ───────────────────────────────────────────────────────────────────

async function openArchive(name) {
  setSaveStatus("", "加载中…");
  const data = await api(`/api/archives/${encodeURIComponent(name)}`);
  state.archive = name;
  state.items = data.items || [];
  state.scores = data.scores?.scores || {};
  state.projectCache = {};
  state.dirty = false;

  let idx = data.scores?.currentIndex ?? 0;
  if (idx < 0 || idx >= state.items.length) idx = 0;
  state.currentIndex = idx;

  $("#home").classList.add("hidden");
  $("#review").classList.remove("hidden");
  $("#archive-label").textContent = name;
  $("#jump-index").max = String(state.items.length || 1);

  buildScoreButtons();
  renderQueue();
  await showItem(state.currentIndex, { skipSave: true });
  setSaveStatus("saved", state.items.length ? "就绪" : "无图片");
}

async function backHome() {
  await flushSave();
  state.archive = null;
  state.items = [];
  $("#review").classList.add("hidden");
  $("#home").classList.remove("hidden");
  await loadHome();
}

function buildScoreButtons() {
  const wrap = $("#score-buttons");
  wrap.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.score = String(i);
    btn.textContent = String(i);
    btn.title = `打 ${i} 分（快捷键 ${i === 10 ? "0" : i}）`;
    btn.addEventListener("click", () => {
      setScore(i);
      scheduleSave();
    });
    wrap.appendChild(btn);
  }
}

function setScore(n) {
  $$(".score-buttons button").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.score) === n);
  });
  updateScoreBadge();
}

function clearScore() {
  $$(".score-buttons button").forEach((b) => b.classList.remove("active"));
  updateScoreBadge();
  scheduleSave();
}

function updateScoreBadge() {
  const item = state.items[state.currentIndex];
  const entry = item ? state.scores[item.id] : null;
  const active = $(".score-buttons button.active");
  const badge = $("#score-badge");
  if (active || isRated(entry)) {
    badge.textContent = active ? `已评 ${active.dataset.score}` : "已评";
    badge.classList.add("show");
  } else {
    badge.classList.remove("show");
  }
}

function updateScoreMeta(itemId) {
  const entry = state.scores[itemId];
  const el = $("#score-rated-at");
  if (entry?.ratedAt) {
    const who = entry.rater ? ` · ${entry.rater}` : "";
    el.textContent = `上次 ${new Date(entry.ratedAt).toLocaleString()}${who}`;
  } else {
    el.textContent = "";
  }
  updateScoreBadge();
}

async function showItem(index, { skipSave = false } = {}) {
  if (!skipSave) await flushSave();

  if (index < 0 || index >= state.items.length) return;
  state.currentIndex = index;
  state.imageIndex = 0;
  state.dirty = false;

  const item = state.items[index];
  const total = state.items.length;

  $("#progress-label").textContent = `${index + 1} / ${total}`;
  $("#jump-index").value = String(index + 1);
  $("#item-title").textContent = `${item.project} / ${item.orderId}`;

  const chips = [];
  if (item.assetType) chips.push(item.assetType);
  if (item.templateId) chips.push(item.templateId);
  if (item.versionId) chips.push(item.versionId);
  if (item.status) chips.push(item.status);
  if (item.tool) chips.push(item.tool);
  $("#item-meta-chips").innerHTML = chips
    .map((c) => `<span class="chip">${escapeHtml(c)}</span>`)
    .join("");

  // images
  const imgs = item.images || [];
  const main = $("#main-image");
  const noImg = $("#no-image");
  const zoomHint = $("#zoom-hint");
  const urls = imgs.map((src) => fileUrl(src));
  state.imageUrls = urls;
  state.imageIndex = 0;

  if (urls.length) {
    main.src = urls[0];
    main.classList.remove("hidden");
    noImg.classList.add("hidden");
    zoomHint.classList.remove("hidden");
  } else {
    main.removeAttribute("src");
    main.classList.add("hidden");
    noImg.classList.remove("hidden");
    zoomHint.classList.add("hidden");
  }

  setupImageViewer(urls, 0);

  const thumbs = $("#thumb-row");
  if (urls.length > 1) {
    thumbs.innerHTML = urls
      .map(
        (src, i) =>
          `<button type="button" class="${i === 0 ? "active" : ""}" data-i="${i}">
            <img src="${src}" alt="thumb ${i + 1}" />
          </button>`
      )
      .join("");
    thumbs.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.imageIndex = Number(btn.dataset.i);
        main.src = urls[state.imageIndex];
        thumbs.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  } else {
    thumbs.innerHTML = "";
  }

  // score form
  const entry = state.scores[item.id] || {};
  clearScoreSilent();
  if (entry.score != null) setScore(Number(entry.score));
  $("#comment").value = entry.comment || "";
  updateScoreMeta(item.id);

  // prompt / order tabs
  $("#prompt-brief").textContent = item.promptBrief || "—";
  $("#generation-prompt").textContent = item.generationPrompt || "—";
  const metaExtra = { ...(item.meta || {}) };
  delete metaExtra.generationPrompt;
  delete metaExtra.promptBrief;
  delete metaExtra.files;
  $("#meta-extra").textContent = prettyJson(
    Object.keys(metaExtra).length ? metaExtra : { notes: item.notes || null, tool: item.tool }
  );

  $("#order-brief").textContent = prettyJson(item.order?.brief || item.brief || "—");
  $("#order-extra").textContent = prettyJson({
    acceptanceCriteria: item.order?.acceptanceCriteria,
    deliverables: item.order?.deliverables,
    references: item.order?.references,
  });

  // nav buttons
  $("#btn-prev").disabled = index <= 0;
  $("#btn-next").disabled = index >= total - 1;

  renderQueue();
  await loadProjectContext(item.project);

  // persist index even without score change
  try {
    await api(`/api/archives/${encodeURIComponent(state.archive)}/scores`, {
      method: "PUT",
      body: JSON.stringify({ currentIndex: state.currentIndex }),
    });
  } catch {
    /* non-fatal */
  }
}

function clearScoreSilent() {
  $$(".score-buttons button").forEach((b) => b.classList.remove("active"));
}

async function loadProjectContext(project) {
  if (!state.projectCache[project]) {
    $("#persona-content").innerHTML = `<p class="muted">加载中…</p>`;
    $("#project-content").textContent = "加载中…";
    try {
      state.projectCache[project] = await api(
        `/api/archives/${encodeURIComponent(state.archive)}/project/${encodeURIComponent(project)}`
      );
    } catch (err) {
      state.projectCache[project] = { error: String(err) };
    }
  }
  renderPersona(state.projectCache[project]);
  renderProject(state.projectCache[project]);
}

function renderPersona(data) {
  const el = $("#persona-content");
  if (!data || data.error) {
    el.innerHTML = `<p class="muted">无法加载 persona${data?.error ? ": " + escapeHtml(data.error) : ""}</p>`;
    return;
  }
  const p = data.persona;
  if (!p) {
    el.innerHTML = `<p class="muted">无 persona/current.json</p>`;
    return;
  }

  const colors = [p.mainColor, p.secondaryColor, ...(p.accentColors || [])].filter(Boolean);
  const fields = [
    ["世界观", p.world ? `${p.world.name || ""}\n${p.world.coreRule || ""}\n${p.world.atmosphere || ""}` : null],
    ["性格", p.personality],
    ["外貌", p.appearance],
    ["发型 / 瞳色", [p.hairColor, p.eyeColor].filter(Boolean).join("\n")],
    ["服装", p.outfit],
    ["配饰", Array.isArray(p.accessories) ? p.accessories.join("\n") : p.accessories],
    ["关键母题", Array.isArray(p.keyMotifs) ? p.keyMotifs.join("\n") : p.keyMotifs],
    ["签名姿势", p.signaturePose],
    ["签名动作", p.signatureAction],
    ["画风", p.artStyle],
    ["设计备注", p.designNotes],
    ["rolePrompt", p.rolePrompt, true],
  ];

  el.innerHTML = `
    <div class="persona-header">
      <span class="name">${escapeHtml(p.name || "—")}</span>
      ${p.nameZh ? `<span class="name-zh">${escapeHtml(p.nameZh)}</span>` : ""}
      ${p.ageAppearance ? `<span class="muted">外观 ${escapeHtml(p.ageAppearance)}</span>` : ""}
      ${p.occupation ? `<span class="muted">${escapeHtml(p.occupation)}</span>` : ""}
    </div>
    ${
      colors.length
        ? `<div class="color-swatches">${colors
            .map(
              (c) =>
                `<div class="swatch" style="background:${escapeHtml(c)}" title="${escapeHtml(c)}"></div>`
            )
            .join("")}</div>`
        : ""
    }
    ${
      p.catchphrase
        ? `<div class="persona-field"><div class="label">口头禅</div><div class="value">「${escapeHtml(p.catchphrase)}」</div></div>`
        : ""
    }
    ${fields
      .filter(([, v]) => v)
      .map(
        ([label, v, mono]) => `
      <div class="persona-field">
        <div class="label">${escapeHtml(label)}</div>
        <div class="value${mono ? " mono" : ""}">${escapeHtml(v)}</div>
      </div>`
      )
      .join("")}
  `;
}

function renderProject(data) {
  const el = $("#project-content");
  if (!data || data.error) {
    el.textContent = data?.error || "—";
    return;
  }
  el.textContent = prettyJson({
    project: data.project,
    analysis: data.analysisSummary,
    persona: data.persona
      ? {
          name: data.persona.name,
          nameZh: data.persona.nameZh,
          artStyle: data.persona.artStyle,
          mainColor: data.persona.mainColor,
          secondaryColor: data.persona.secondaryColor,
          accentColors: data.persona.accentColors,
        }
      : null,
  });
}

function renderQueue() {
  const list = $("#queue-list");
  if (!state.items.length) {
    list.innerHTML = `<p class="muted">无条目</p>`;
    return;
  }
  list.innerHTML = state.items
    .map((item, i) => {
      const entry = state.scores[item.id];
      const rated = isRated(entry);
      const current = i === state.currentIndex;
      return `
        <button type="button" class="queue-item${rated ? " rated" : ""}${current ? " current" : ""}" data-i="${i}">
          <span class="idx">${i + 1}</span>
          <span class="label">${escapeHtml(item.project)} / ${escapeHtml(item.orderId)}</span>
          <span class="score-pill">${entry?.score != null ? entry.score : ""}</span>
        </button>
      `;
    })
    .join("");

  list.querySelectorAll(".queue-item").forEach((btn) => {
    btn.addEventListener("click", () => showItem(Number(btn.dataset.i)));
  });
}

function findUnrated(from, dir) {
  const n = state.items.length;
  if (!n) return -1;
  let i = from;
  for (let step = 0; step < n; step++) {
    i = (i + dir + n) % n;
    if (!isRated(state.scores[state.items[i].id])) return i;
  }
  return -1;
}

// ── Viewer.js image zoom ─────────────────────────────────────────────────────

function destroyViewer() {
  if (state.viewer) {
    try {
      state.viewer.destroy();
    } catch {
      /* ignore */
    }
    state.viewer = null;
  }
  state.viewerOpen = false;
}

/**
 * Attach Viewer.js to a hidden multi-image gallery.
 * Clicking the main preview opens lightbox with zoom / pan / rotate.
 */
function setupImageViewer(urls, startIndex = 0) {
  destroyViewer();
  const gallery = $("#viewer-gallery");
  const main = $("#main-image");

  if (!gallery || typeof Viewer === "undefined") {
    if (main) {
      main.onclick = null;
      main.style.cursor = urls.length ? "zoom-in" : "default";
    }
    return;
  }

  gallery.innerHTML = urls
    .map(
      (src, i) =>
        `<li><img src="${src}" alt="preview ${i + 1}" data-original="${src}"></li>`
    )
    .join("");

  if (!urls.length) {
    main.onclick = null;
    main.style.cursor = "default";
    return;
  }

  state.viewer = new Viewer(gallery, {
    url: "src",
    initialViewIndex: startIndex,
    backdrop: true,
    button: true,
    focus: true,
    fullscreen: true,
    keyboard: true,
    loading: true,
    loop: true,
    movable: true,
    navbar: urls.length > 1,
    rotatable: true,
    scalable: true,
    slideOnTouch: true,
    title: true,
    toggleOnDblclick: true,
    toolbar: {
      zoomIn: 1,
      zoomOut: 1,
      oneToOne: 1,
      reset: 1,
      prev: urls.length > 1 ? 1 : 0,
      play: 0,
      next: urls.length > 1 ? 1 : 0,
      rotateLeft: 1,
      rotateRight: 1,
      flipHorizontal: 1,
      flipVertical: 1,
    },
    tooltip: true,
    transition: true,
    zoomable: true,
    zoomOnTouch: true,
    zoomOnWheel: true,
    zoomRatio: 0.15,
    minZoomRatio: 0.1,
    maxZoomRatio: 20,
    show() {
      state.viewerOpen = true;
    },
    hidden() {
      state.viewerOpen = false;
    },
  });

  main.style.cursor = "zoom-in";
  main.onclick = () => {
    if (!state.viewer || !state.imageUrls.length) return;
    const idx = Math.min(state.imageIndex, state.imageUrls.length - 1);
    state.viewer.view(idx);
  };
}

// ── events ───────────────────────────────────────────────────────────────────

function bindEvents() {
  $("#btn-back").addEventListener("click", () => backHome());
  $("#btn-prev").addEventListener("click", () => showItem(state.currentIndex - 1));
  $("#btn-next").addEventListener("click", () => showItem(state.currentIndex + 1));
  $("#btn-jump").addEventListener("click", () => {
    const n = Number($("#jump-index").value) - 1;
    if (!Number.isNaN(n)) showItem(n);
  });
  $("#jump-index").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const n = Number($("#jump-index").value) - 1;
      if (!Number.isNaN(n)) showItem(n);
    }
  });
  $("#btn-prev-unrated").addEventListener("click", async () => {
    const i = findUnrated(state.currentIndex, -1);
    if (i >= 0) await showItem(i);
  });
  $("#btn-next-unrated").addEventListener("click", async () => {
    const i = findUnrated(state.currentIndex, 1);
    if (i >= 0) await showItem(i);
  });
  $("#btn-clear-score").addEventListener("click", () => clearScore());
  $("#comment").addEventListener("input", () => scheduleSave());
  $("#rater-name").addEventListener("change", () => {
    localStorage.setItem("score-review-rater", $("#rater-name").value);
    scheduleSave();
  });

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.remove("active"));
      $$(".tab-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      $(`#tab-${tab.dataset.tab}`).classList.add("active");
    });
  });

  document.addEventListener("keydown", (e) => {
    if (!state.archive) return;
    // Let Viewer.js own keyboard while lightbox is open
    if (state.viewerOpen) return;

    const tag = (e.target && e.target.tagName) || "";
    const typing = tag === "TEXTAREA" || tag === "INPUT";

    if (!typing) {
      if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") {
        e.preventDefault();
        if (state.currentIndex > 0) showItem(state.currentIndex - 1);
      } else if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") {
        e.preventDefault();
        if (state.currentIndex < state.items.length - 1) showItem(state.currentIndex + 1);
      } else if (e.key >= "1" && e.key <= "9") {
        setScore(Number(e.key));
        scheduleSave();
      } else if (e.key === "0") {
        setScore(10);
        scheduleSave();
      }
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

// ── boot ─────────────────────────────────────────────────────────────────────

bindEvents();
const savedRater = localStorage.getItem("score-review-rater");
if (savedRater) $("#rater-name").value = savedRater;
loadHome().catch((err) => {
  $("#archive-list").innerHTML = `<p class="muted">加载失败: ${escapeHtml(err.message)}</p>`;
});

/**
 * 滚动渲染引擎 —— Wireframe Metamorphosis 的签名动效。
 *
 * - 顶部 RENDER 0–100% 进度条（文档级滚动进度）
 * - 每个 .morph section 写入局部进度 --lp（0..1），驱动线稿扫入、
 *   颜色通道逐个打开、线框→实体 crossfade（全部由 CSS var 消费）
 * - 进度 >85% 时 rail 品牌标从线框 icon 切换为彩色 icon
 * - 图层开关（Protocol/Line/Color/Texture/Motion）切 body class
 * - prefers-reduced-motion：不写 --lp（CSS 兜底为 1），不动进度动画，
 *   阶段快照锚点接管导航
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const railFill = document.querySelector<HTMLElement>("[data-rail-fill]");
const railPct = document.querySelector<HTMLElement>("[data-rail-pct]");
const sections = Array.from(document.querySelectorAll<HTMLElement>(".morph"));
const dots = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-rail-dot]"));

let ticking = false;

function update() {
  ticking = false;
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;

  if (railFill) railFill.style.transform = `scaleX(${p})`;
  if (railPct) railPct.textContent = `${Math.round(p * 100)}%`;
  document.body.classList.toggle("is-live", p > 0.85);

  // 当前阶段（用于 rail 导航高亮）
  const idx = Math.min(sections.length - 1, Math.floor(p * sections.length));
  dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));

  if (reduceMotion) return;

  // 局部进度：section 高度 > 视口，sticky 内层消费 --lp
  const vh = window.innerHeight;
  for (const sec of sections) {
    const r = sec.getBoundingClientRect();
    const range = r.height - vh;
    const lp = range > 0 ? Math.min(1, Math.max(0, -r.top / range)) : 1;
    sec.style.setProperty("--lp", lp.toFixed(4));
  }
}

function onScroll() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(update);
  }
}

if (!reduceMotion) {
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
}
update();

// ── 图层开关（桌面加分项） ──
for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-layer]")) {
  const layer = btn.dataset.layer!;
  btn.addEventListener("click", () => {
    const off = document.body.classList.toggle(`lyr-off-${layer}`);
    btn.setAttribute("aria-pressed", String(!off));
  });
}

// ── 复制安装命令 ──
for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
  btn.addEventListener("click", async () => {
    const text = btn.dataset.copy!;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    const label = btn.querySelector<HTMLElement>("[data-copy-label]");
    if (label) {
      const original = label.textContent;
      label.textContent = btn.dataset.copied ?? original;
      setTimeout(() => (label.textContent = original), 1600);
    }
  });
}

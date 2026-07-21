/**
 * 资产城交互：建筑热点 → 详情面板切换 + 镜头轻 zoom。
 * 渐进增强：无 JS 时所有面板顺序堆叠可读，建筑链接退化为页内锚点。
 */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const stageIds = ["gate", "tower", "cafe", "studio", "hall", "shed", "shop", "dock"] as const;
type StageId = (typeof stageIds)[number];

const camera = document.getElementById("cityCamera");
const svg = document.getElementById("citySvg");
let current: StageId = "gate";

function selectStage(id: StageId, opts: { focusPanel?: boolean; zoom?: boolean } = {}) {
  current = id;

  for (const sid of stageIds) {
    const active = sid === id;
    document.querySelectorAll<HTMLElement>(`[data-stage="${sid}"]`).forEach((el) => {
      el.classList.toggle("is-active", active);
      if (el.tagName === "A" || el.tagName === "BUTTON") {
        el.setAttribute("aria-pressed", String(active));
      }
    });
    document.querySelectorAll<HTMLElement>(`[data-panel="${sid}"]`).forEach((el) => {
      el.toggleAttribute("hidden", !active);
    });
  }

  // 镜头平移/轻 zoom 至建筑（签名动效；reduced-motion 下跳过）
  if (camera && opts.zoom !== false && !reduceMotion && window.innerWidth >= 900) {
    const target = document.querySelector<SVGGElement>(`#citySvg [data-stage="${id}"][data-cx]`);
    if (target) {
      const cx = Number(target.dataset.cx);
      const cy = Number(target.dataset.cy);
      const scale = 1.22;
      const vw = 1200;
      const vh = 760;
      const tx = vw / 2 - cx * scale;
      const ty = vh / 2 - cy * scale + 40;
      camera.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }
  } else if (camera && opts.zoom === false) {
    camera.style.transform = "";
  }

  if (opts.focusPanel) {
    const panel = document.querySelector<HTMLElement>(`[data-panel="${id}"]`);
    panel?.focus({ preventScroll: false });
  }
}

// 建筑热点 + 站点 chips + 下一站按钮（事件委托）
document.addEventListener("click", (event) => {
  const trigger = (event.target as HTMLElement).closest<HTMLElement>("[data-goto]");
  if (!trigger) return;
  const id = trigger.dataset.goto as StageId;
  if (!stageIds.includes(id)) return;
  event.preventDefault();
  selectStage(id, { focusPanel: trigger.dataset.gotoFocus === "true" });
  const panel = document.querySelector<HTMLElement>(`[data-panel="${id}"]`);
  panel?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
});

// 重置镜头（点地图空白处）
svg?.addEventListener("click", (event) => {
  if ((event.target as Element).closest("[data-goto]")) return;
  if (camera) camera.style.transform = "";
});

// 复制命令按钮（渐进增强）
document.addEventListener("click", async (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-copy]");
  if (!btn) return;
  const text = btn.dataset.copy ?? "";
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  const label = btn.querySelector("span");
  if (label && btn.dataset.copied) {
    const original = label.textContent;
    label.textContent = btn.dataset.copied;
    window.setTimeout(() => {
      label.textContent = original;
    }, 1600);
  }
});

// 初始状态：车站（不 zoom，保持全景）
selectStage(current, { zoom: false });

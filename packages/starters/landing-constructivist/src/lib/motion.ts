/**
 * 渐进增强交互。全部在 prefers-reduced-motion 下自动失效；
 * 无 JS 时所有海报完整可读（内容本身就在 DOM 里，initial state 由 no-js 守卫放开）。
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// 标记 JS 可用：入场隐藏态只在 .js 下生效，无 JS 时所有海报立即可读。
document.documentElement.classList.add("js");

/** 海报入场：IntersectionObserver 打 .is-in，口号块砸入 + 斜向 clip 擦除。 */
function initPosterReveal(): void {
  const posters = document.querySelectorAll<HTMLElement>("[data-poster]");
  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    posters.forEach((p) => p.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15 },
  );
  posters.forEach((p) => io.observe(p));
}

/** 底部几何进度条：当前海报对应色段高亮。 */
function initProgress(): void {
  const bar = document.querySelector<HTMLElement>("[data-progress]");
  if (!bar) return;
  const segments = Array.from(bar.querySelectorAll<HTMLElement>("[data-segment]"));
  const posters = Array.from(document.querySelectorAll<HTMLElement>("[data-poster]"));
  if (!segments.length || !posters.length || !("IntersectionObserver" in window)) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const idx = posters.indexOf(entry.target as HTMLElement);
        segments.forEach((seg, i) => seg.classList.toggle("is-active", i === idx));
      }
    },
    { threshold: 0.25 },
  );
  posters.forEach((p) => io.observe(p));
}

/** 命令一键复制：按钮 data-copy 指向要复制的文本。 */
function initCopyButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") ?? "";
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const range = document.createRange();
        const code = btn.parentElement?.querySelector("code");
        if (code) {
          range.selectNodeContents(code);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
        return;
      }
      const label = btn.textContent;
      btn.textContent = btn.getAttribute("data-copied") ?? label;
      btn.classList.add("is-copied");
      window.setTimeout(() => {
        btn.textContent = label;
        btn.classList.remove("is-copied");
      }, 1600);
    });
  });
}

initShotMode();
initPosterReveal();
initProgress();
initCopyButtons();

/**
 * QA 截图模式（?shot=p-04）：把目标海报之前的海报隐藏，使目标位于文档顶部，
 * 规避 headless 截图「只栅格化视口却从文档原点读取」的空白伪影。生产无影响。
 */
function initShotMode(): void {
  const m = location.search.match(/[?&]shot=(p-\d+)/);
  if (!m) return;
  const posters = Array.from(document.querySelectorAll<HTMLElement>("[data-poster]"));
  for (const p of posters) {
    if (p.id === m[1]) break;
    p.style.display = "none";
  }
}

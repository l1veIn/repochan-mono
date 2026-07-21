/**
 * 渐进增强交互。全部在 prefers-reduced-motion 下保持静态；
 * 无 JS 时页面信息完整可读（展品、展签、命令文本本身就在 DOM 里）。
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

document.documentElement.classList.add("js");

/** 入场 fade：IntersectionObserver 触发，--d 级联延迟。reduced-motion 下直接落位。 */
function initReveal(): void {
  const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("revealed"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  els.forEach((el) => io.observe(el));
}

/** 命令一键复制：按钮 data-copy 指向要复制的文本。 */
function initCopyButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") ?? "";
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const code = btn.parentElement?.querySelector("code");
        if (code) {
          const range = document.createRange();
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

/** Lightbox：点击展品看大图；←/→ 切换，Esc 关闭。静态 DOM 已含全部控件文案。 */
function initLightbox(): void {
  const root = document.getElementById("lightbox");
  if (!root) return;
  const img = root.querySelector<HTMLImageElement>("[data-lb-img]");
  const caption = root.querySelector<HTMLElement>("[data-lb-caption]");
  const order = root.querySelector<HTMLElement>("[data-lb-order]");
  const triggers = Array.from(document.querySelectorAll<HTMLElement>("[data-lightbox]"));
  if (!img || !caption || !order || triggers.length === 0) return;

  let current = 0;
  let lastFocus: HTMLElement | null = null;

  const show = (index: number): void => {
    current = (index + triggers.length) % triggers.length;
    const t = triggers[current];
    img.src = t.getAttribute("data-lb-src") ?? "";
    img.alt = t.getAttribute("data-lb-alt") ?? "";
    caption.textContent = t.getAttribute("data-lb-caption") ?? "";
    order.textContent = t.getAttribute("data-lb-order") ?? "";
  };

  const open = (index: number): void => {
    lastFocus = document.activeElement as HTMLElement | null;
    show(index);
    root.classList.add("open");
    document.body.style.overflow = "hidden";
    root.querySelector<HTMLButtonElement>(".lightbox-close")?.focus();
  };

  const close = (): void => {
    root.classList.remove("open");
    document.body.style.overflow = "";
    lastFocus?.focus();
  };

  triggers.forEach((t, i) => {
    t.addEventListener("click", () => open(i));
    t.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open(i);
      }
    });
  });

  root.querySelector(".lightbox-close")?.addEventListener("click", close);
  root.querySelector(".lightbox-prev")?.addEventListener("click", () => show(current - 1));
  root.querySelector(".lightbox-next")?.addEventListener("click", () => show(current + 1));
  root.addEventListener("click", (ev) => {
    if (ev.target === root) close();
  });

  document.addEventListener("keydown", (ev) => {
    if (!root.classList.contains("open")) return;
    if (ev.key === "Escape") close();
    if (ev.key === "ArrowLeft") show(current - 1);
    if (ev.key === "ArrowRight") show(current + 1);
  });
}

initReveal();
initCopyButtons();
initLightbox();

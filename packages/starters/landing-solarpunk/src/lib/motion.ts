/**
 * 渐进增强交互。全部在 prefers-reduced-motion 下自动失效；
 * 无 JS 时页面信息完整可读（命令文本本身就在 DOM 里）。
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** 签名动效①：滚动驱动「枝叶展开」——[data-grow] 元素进入视口时展开。 */
function initGrowReveal(): void {
  const targets = document.querySelectorAll<HTMLElement>("[data-grow]");
  if (!targets.length) return;
  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-grown"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-grown");
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
  );
  targets.forEach((el) => io.observe(el));
}

/** 签名动效②：Hero 三层视差（场景 / 近景草叶），滚动时不同速率位移。 */
function initHeroParallax(): void {
  const layers = document.querySelectorAll<HTMLElement>("[data-parallax]");
  if (!layers.length || reduceMotion.matches) return;

  let ticking = false;
  const update = (): void => {
    ticking = false;
    const y = window.scrollY;
    layers.forEach((el) => {
      const speed = Number(el.getAttribute("data-parallax") ?? "0");
      el.style.transform = `translate3d(0, ${(y * speed).toFixed(1)}px, 0)`;
    });
  };
  const onScroll = (): void => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  update();
  window.addEventListener("scroll", onScroll, { passive: true });
}

/** 命令一键复制：按钮 data-copy 指向要复制的文本。 */
function initCopyButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") ?? "";
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // 剪贴板不可用时退化为选中文本
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

initGrowReveal();
initHeroParallax();
initCopyButtons();

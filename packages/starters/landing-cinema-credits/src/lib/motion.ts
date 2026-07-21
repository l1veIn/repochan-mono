/**
 * 渐进增强交互。全部在 prefers-reduced-motion 下自动失效；
 * 无 JS 时页面信息完整可读（字幕卡与命令文本本身就在 DOM 里）。
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** 字幕卡淡入：进入视口的 .reveal 元素获得 .is-in。reduced-motion 下 CSS 已默认全部可见。 */
function initReveal(): void {
  if (reduceMotion.matches) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
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
    { threshold: 0.25 },
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
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

initReveal();
initCopyButtons();

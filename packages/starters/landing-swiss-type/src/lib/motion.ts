/**
 * 渐进增强交互。全部在 prefers-reduced-motion 下自动失效；
 * 无 JS 时页面信息完整可读（命令文本本身就在 DOM 里）。
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** 签名动效：变量字体字重随滚动变化（仅拉丁字形插值；中文字形为静态字重，自动忽略）。 */
function initScrollWeight(): void {
  const display = document.querySelector<HTMLElement>("[data-scroll-weight]");
  if (!display || reduceMotion.matches) return;

  let ticking = false;
  const update = (): void => {
    ticking = false;
    const vh = window.innerHeight || 1;
    // 滚动 0 → 60vh 映射字重 700 → 900
    const p = Math.min(1, Math.max(0, window.scrollY / (vh * 0.6)));
    const wght = Math.round(700 + p * 200);
    display.style.fontVariationSettings = `"wght" ${wght}`;
    // 字距微动：随字重收紧
    display.style.letterSpacing = `${(-0.02 - p * 0.02).toFixed(3)}em`;
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

initScrollWeight();
initCopyButtons();

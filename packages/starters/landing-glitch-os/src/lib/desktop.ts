/**
 * 渐进增强交互。全部在 prefers-reduced-motion 下自动失效或退化；
 * 无 JS 时页面信息完整可读（命令文本本身就在 DOM 里，boot splash 默认不显示）。
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Boot splash：仅 JS + 非 reduced-motion 时播放一次，1.8s 后淡出。 */
function initBoot(): void {
  const boot = document.querySelector<HTMLElement>("[data-boot]");
  if (!boot || reduceMotion.matches) return;
  boot.hidden = false;
  boot.classList.add("is-on");
  window.setTimeout(() => {
    boot.classList.add("is-off");
    boot.addEventListener("transitionend", () => boot.remove(), { once: true });
    // 兜底：transitionend 不触发时也移除
    window.setTimeout(() => boot.remove(), 1200);
  }, 1800);
}

/** 窗口打开缩放：进入视口时加 .is-open。 */
function initWindowOpen(): void {
  const wins = document.querySelectorAll<HTMLElement>(".win");
  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    wins.forEach((w) => w.classList.add("is-open"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-open");
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12 },
  );
  wins.forEach((w) => io.observe(w));
}

/** 窗口聚焦/悬停置顶（叠层隐喻；纯装饰，不影响阅读顺序）。 */
function initWindowRaise(): void {
  let top = 10;
  document.querySelectorAll<HTMLElement>(".win").forEach((w) => {
    const raise = (): void => {
      top += 1;
      w.style.zIndex = String(top);
    };
    w.addEventListener("pointerdown", raise);
    w.addEventListener("focusin", raise);
  });
}

/** 任务栏时钟：每秒更新；reduced-motion 下静态显示一次。 */
function initClock(): void {
  const clock = document.querySelector<HTMLElement>("[data-clock]");
  if (!clock) return;
  const tick = (): void => {
    const d = new Date();
    const p = (n: number): string => String(n).padStart(2, "0");
    clock.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  tick();
  if (!reduceMotion.matches) window.setInterval(tick, 1000);
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

initBoot();
initWindowOpen();
initWindowRaise();
initClock();
initCopyButtons();

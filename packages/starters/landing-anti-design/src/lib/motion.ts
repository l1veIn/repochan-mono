/**
 * 渐进增强交互。全部在 prefers-reduced-motion 下安全降级；
 * 无 JS 时页面信息完整可读（命令文本本身就在 DOM 里，弹窗保持 hidden）。
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

document.documentElement.classList.add("js");

/** 假错误弹窗：仅 JS 时显示；可关、可 Esc、关闭后焦点还给页面，不劫持任何导航。 */
function initDialog(): void {
  const overlay = document.querySelector<HTMLElement>("[data-dialog]");
  if (!overlay) return;
  overlay.hidden = false;
  const closers = overlay.querySelectorAll<HTMLButtonElement>("[data-dialog-close]");
  const close = (): void => {
    overlay.hidden = true;
  };
  closers.forEach((btn) => btn.addEventListener("click", close));
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) close();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !overlay.hidden) close();
  });
  // 初始焦点进入弹窗，键盘用户可立即操作
  if (!reduceMotion.matches) {
    closers[closers.length - 1]?.focus();
  }
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

/** 「给我正常版 / 恢复混乱」切换：html.readable + localStorage 持久化。 */
function initReadableToggle(): void {
  const btn = document.querySelector<HTMLButtonElement>("[data-readable-toggle]");
  if (!btn) return;
  const labelOn = btn.getAttribute("data-label-on") ?? "";
  const labelOff = btn.getAttribute("data-label-off") ?? "";
  const sync = (): void => {
    const on = document.documentElement.classList.contains("readable");
    btn.textContent = on ? labelOff : labelOn;
    btn.setAttribute("aria-pressed", String(on));
  };
  btn.addEventListener("click", () => {
    const on = document.documentElement.classList.toggle("readable");
    try {
      localStorage.setItem("chaos-readable", on ? "1" : "0");
    } catch {}
    sync();
  });
  sync();
}

initDialog();
initCopyButtons();
initReadableToggle();

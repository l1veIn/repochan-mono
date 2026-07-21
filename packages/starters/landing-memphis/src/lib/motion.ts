/**
 * 渐进增强交互。全部在 prefers-reduced-motion 下自动失效；
 * 无 JS 时页面信息完整可读（命令文本本身就在 DOM 里）。
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

document.documentElement.classList.add("js");

/** 签名动效 ①：形状弹性弹入（spring）。IntersectionObserver 触发，带 --d 级联延迟。 */
function initPopIn(): void {
  const els = document.querySelectorAll<HTMLElement>("[data-pop]");
  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("popped"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("popped");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
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
      btn.textContent = btn.getAttribute("data-copied") ?? btn.getAttribute("data-copied-label") ?? label;
      btn.classList.add("is-copied");
      window.setTimeout(() => {
        btn.textContent = label;
        btn.classList.remove("is-copied");
      }, 1600);
    });
  });
}

/** 签名动效 ②：点击大色块区域掉落一小把 confetti（克制：每次 ≤14 粒）。 */
function initConfetti(): void {
  if (reduceMotion.matches) return;
  const colors = ["--pink", "--cyan", "--yellow", "--violet", "--coral"];
  const shapes = ["50%", "50% 50% 0 0", "0 60% 60% 0", "30%"];
  document.querySelectorAll<HTMLElement>("[data-confetti-zone]").forEach((zone) => {
    zone.addEventListener("click", (ev) => {
      // 点在按钮/链接上不撒花，避免干扰真实交互
      if ((ev.target as HTMLElement).closest("a,button")) return;
      const rect = zone.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      for (let i = 0; i < 14; i++) {
        const bit = document.createElement("span");
        bit.className = "confetti-bit";
        const angle = Math.random() * Math.PI * 2;
        const dist = 40 + Math.random() * 110;
        bit.style.left = `${x}px`;
        bit.style.top = `${y}px`;
        bit.style.background = `var(${colors[i % colors.length]})`;
        bit.style.borderRadius = shapes[i % shapes.length];
        zone.appendChild(bit);
        bit.animate(
          [
            { transform: "translate(-50%,-50%) rotate(0deg)", opacity: 1 },
            {
              transform: `translate(${Math.cos(angle) * dist - 50}%, ${Math.sin(angle) * dist + 60}px) rotate(${160 + Math.random() * 220}deg)`,
              opacity: 0,
            },
          ],
          { duration: 700 + Math.random() * 500, easing: "cubic-bezier(0.22, 0.9, 0.32, 1)" }
        ).onfinish = () => bit.remove();
      }
    });
  });
}

/** 签名动效 ③：scroll 时 Hero 色块轻微重组（视差漂移）。 */
function initStageDrift(): void {
  if (reduceMotion.matches) return;
  const blocks = document.querySelectorAll<HTMLElement>(".stage-block");
  if (blocks.length === 0) return;
  let ticking = false;
  const update = (): void => {
    ticking = false;
    const p = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
    blocks.forEach((el, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      el.style.translate = `${dir * p * (6 + i * 3)}px ${p * (10 + i * 4)}px`;
    });
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true }
  );
}

initPopIn();
initCopyButtons();
initConfetti();
initStageDrift();

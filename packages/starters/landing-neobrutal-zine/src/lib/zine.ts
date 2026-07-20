/* REPO酱特刊 · zine 动效层
   GSAP + ScrollTrigger + Draggable（npm 依赖，构建期打包）
   prefers-reduced-motion 下全部跳过，页面保持静态可读。 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Draggable } from "gsap/Draggable";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- 跑马灯：复制内容保证无缝循环 ---------- */
document.querySelectorAll<HTMLElement>("[data-marquee]").forEach((track) => {
  const original = track.querySelector("span");
  if (!original) return;
  // 至少 2 份，且总宽超过视口 2 倍，translateX(-50%) 才无缝
  let copies = 2;
  track.appendChild(original.cloneNode(true));
  while (track.scrollWidth < window.innerWidth * 2 && copies < 12) {
    track.appendChild(original.cloneNode(true));
    track.appendChild(original.cloneNode(true));
    copies += 2;
  }
});

/* ---------- 剪报拼字（结构生成，动效无关，始终执行） ---------- */
/* 调色板取自注入的 CSS 变量（repochan/site.json），与页面其余部分保持同源 */
const rootVars = getComputedStyle(document.documentElement);
const ransomPalette = ["--pink", "--blue", "--yellow", "--purple", "--mint", "--card"].map((name) =>
  rootVars.getPropertyValue(name).trim(),
);
const ransomFonts = ['"Noto Serif SC", serif', '"Noto Sans SC", sans-serif', '"Zhi Mang Xing", "Caveat", cursive'];
document.querySelectorAll<HTMLElement>("[data-ransom]").forEach((line) => {
  const text = line.textContent ?? "";
  line.textContent = "";
  let i = 0;
  const makeChar = (ch: string) => {
    const span = document.createElement("span");
    span.className = "ransom-char";
    span.textContent = ch;
    span.style.background = ransomPalette[(i * 5 + 2) % ransomPalette.length];
    span.style.fontFamily = ransomFonts[i % ransomFonts.length];
    span.style.transform = `rotate(${((i * 37) % 13) - 6}deg) translateY(${((i * 23) % 9) - 4}px)`;
    i += 1;
    return span;
  };
  /* 分词：拉丁串（含其标点）整词不换行；CJK 字符逐字成词可换行。
     flex 容器不渲染纯空白文本节点，词距交给 .ransom-word 间隙。 */
  const CJK = /[\u2E80-\u9FFF\u3000-\u303F\uFF00-\uFFEF★—…「」]/;
  const words: string[][] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) words.push(current);
    current = [];
  };
  Array.from(text).forEach((ch) => {
    if (/\s/.test(ch)) {
      flush();
    } else if (CJK.test(ch)) {
      flush();
      words.push([ch]);
    } else {
      current.push(ch);
    }
  });
  flush();
  words.forEach((chars) => {
    const word = document.createElement("span");
    word.className = "ransom-word";
    chars.forEach((ch) => word.appendChild(makeChar(ch)));
    line.appendChild(word);
  });
});

/* ---------- 复制命令 ---------- */
const copyBtn = document.getElementById("copyBtn") as HTMLButtonElement | null;
if (copyBtn) {
  copyBtn.addEventListener("click", () => {
    const cmd = document.getElementById("installCmd")?.textContent ?? "";
    const label = copyBtn.dataset.label ?? "Copy";
    const copiedLabel = copyBtn.dataset.copiedLabel ?? "Copied ★";
    const done = () => {
      copyBtn.textContent = copiedLabel;
      copyBtn.classList.add("copied");
      setTimeout(() => {
        copyBtn.textContent = label;
        copyBtn.classList.remove("copied");
      }, 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(cmd).then(done, done);
    } else {
      const ta = document.createElement("textarea");
      ta.value = cmd;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
      done();
    }
  });
}

if (!reduced) {
  gsap.registerPlugin(ScrollTrigger, Draggable);

  /* ---------- 封面入场：主视觉从顶部砸落带旋转 ---------- */
  const cutout = document.getElementById("coverCutout");
  if (cutout) {
    gsap.from(cutout, {
      y: -560,
      rotation: 26,
      opacity: 0,
      duration: 1.1,
      ease: "bounce.out",
      delay: 0.25,
    });
  }
  gsap.from("[data-title]", {
    x: -90,
    opacity: 0,
    rotation: (i: number) => (i % 2 ? 8 : -8),
    duration: 0.7,
    ease: "back.out(2.2)",
    stagger: 0.14,
    delay: 0.1,
  });

  /* ---------- 通用 scroll reveal：错位弹入 ---------- */
  document.querySelectorAll("[data-reveal]").forEach((el, i) => {
    gsap.from(el, {
      y: 56,
      opacity: 0,
      rotation: i % 2 ? 2.5 : -2.5,
      duration: 0.65,
      ease: "back.out(1.8)",
      scrollTrigger: { trigger: el, start: "top 88%" },
    });
  });

  /* ---------- 连环漫画分镜：逐格砸下 ---------- */
  gsap.from("[data-panel]", {
    y: 120,
    opacity: 0,
    rotation: (i: number) => (i % 2 ? 6 : -6),
    duration: 0.6,
    ease: "back.out(1.6)",
    stagger: 0.16,
    scrollTrigger: { trigger: ".comic-strip", start: "top 82%" },
  });

  /* ---------- 贴纸掉落旋转入场 ---------- */
  document.querySelectorAll("[data-drop]").forEach((el, i) => {
    gsap.from(el, {
      y: -(160 + (i % 3) * 60),
      rotation: i % 2 ? 160 : -160,
      opacity: 0,
      duration: 0.9,
      ease: "bounce.out",
      delay: (i % 4) * 0.08,
      scrollTrigger: { trigger: el, start: "top 92%" },
    });
  });

  /* ---------- 贴纸 hover 弹性物理 ---------- */
  document.querySelectorAll<HTMLElement>(".wall-sticker, .mini-sticker").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      if (el.classList.contains("dragging")) return;
      gsap.to(el, {
        scale: 1.14,
        rotation: gsap.utils.random(-8, 8),
        duration: 0.55,
        ease: "elastic.out(1.1, 0.35)",
        overwrite: "auto",
      });
    });
    el.addEventListener("mouseleave", () => {
      if (el.classList.contains("dragging")) return;
      gsap.to(el, { scale: 1, rotation: 0, duration: 0.5, ease: "elastic.out(1, 0.4)", overwrite: "auto" });
    });
  });

  /* ---------- 贴纸墙拖拽（Draggable 自带触屏支持） ---------- */
  Draggable.create(".wall-sticker", {
    type: "x,y",
    bounds: "#wall",
    edgeResistance: 0.75,
    onPress() {
      this.target.classList.add("dragging");
    },
    onRelease() {
      this.target.classList.remove("dragging");
      gsap.to(this.target, {
        rotation: gsap.utils.random(-7, 7),
        duration: 0.5,
        ease: "elastic.out(1, 0.4)",
      });
    },
  });

  /* ---------- 红章砸下（滚到即盖，点击可重盖） ---------- */
  const stamp = document.getElementById("stamp");
  const stampZone = document.getElementById("stampZone");
  if (stamp && stampZone) {
    const slam = () => {
      gsap
        .timeline()
        .fromTo(
          stamp,
          { scale: 3.2, opacity: 0, rotation: -38 },
          { scale: 1, opacity: 1, rotation: -12, duration: 0.28, ease: "power4.in" },
        )
        .to(stampZone, {
          keyframes: [
            { x: -6, y: 3, duration: 0.05 },
            { x: 5, y: -2, duration: 0.05 },
            { x: -3, y: 1, duration: 0.05 },
            { x: 0, y: 0, duration: 0.06 },
          ],
        });
    };
    ScrollTrigger.create({ trigger: stampZone, start: "top 78%", once: true, onEnter: slam });
    stamp.style.cursor = "pointer";
    stamp.addEventListener("click", slam);
  }

  /* ---------- 剪报字符逐字蹦入 ---------- */
  document.querySelectorAll("[data-ransom]").forEach((line) => {
    gsap.from(line.querySelectorAll(".ransom-char"), {
      scale: 0,
      opacity: 0,
      rotation: () => gsap.utils.random(-40, 40),
      duration: 0.45,
      ease: "back.out(2.5)",
      stagger: 0.05,
      scrollTrigger: { trigger: line, start: "top 85%" },
    });
  });
}

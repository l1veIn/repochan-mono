import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { initCursor } from "./cursor";
import { runBoot } from "./boot";

const RM =
  document.documentElement.classList.contains("rm") ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOBILE_WORLD = window.matchMedia("(max-width: 820px)").matches;

/* ---------- toast ---------- */
const toast = document.getElementById("toast");
let toastT: ReturnType<typeof setTimeout> | undefined;
function showToast(msg: string): void {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => toast.classList.remove("show"), 1600);
}

/* ---------- copy hex (buttons are keyboard-focusable by default) ---------- */
document.querySelectorAll<HTMLElement>(".swatch").forEach((btn) => {
  btn.addEventListener("click", () => {
    const hex = btn.getAttribute("data-hex") ?? "";
    const name = btn.querySelector(".nm")?.textContent ?? "";
    const template = toast?.dataset.template ?? "Copied {hex} — {name}";
    const done = () => showToast(template.replace("{hex}", hex).replace("{name}", name));
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = hex;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        done();
      } catch {
        showToast(hex);
      }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(hex).then(done).catch(fallback);
    } else {
      fallback();
    }
  });
});

/* ---------- custom cursor ---------- */
initCursor();

/* ---------- marquee: duplicate for seamless loop (whole block is aria-hidden) ---------- */
const mt = document.getElementById("marqueeTrack");
if (mt) mt.innerHTML += mt.innerHTML;

/* ---------- world day/night state ---------- */
const nightLayer = document.getElementById("nightLayer");
const capDay = document.getElementById("capDay");
const capNight = document.getElementById("capNight");
const btnDay = document.getElementById("btnDay");
const btnNight = document.getElementById("btnNight");
const worldTime = document.getElementById("worldTime");
const worldLabel = document.getElementById("worldLabel");
const worldBar = document.getElementById("worldBar");
const worldSweep = document.getElementById("worldSweep");
const worldStage = document.getElementById("worldStage");
const labelDay = worldStage?.dataset.labelDay ?? "";
const labelNight = worldStage?.dataset.labelNight ?? "";

function fmtTime(p: number): string {
  const m = Math.round(932 + p * (1567 - 932)); // 15:32 -> 26:07 (=01:47 + 24h)
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${h < 10 ? "0" : ""}${h}:${mm < 10 ? "0" : ""}${mm}`;
}

/** p: 0 = full day, 1 = full night. Wipe (desktop pin) or cross-fade (mobile). */
function setWorld(p: number): void {
  if (nightLayer) {
    if (MOBILE_WORLD) {
      nightLayer.style.clipPath = "none";
      nightLayer.style.opacity = String(p);
    } else {
      nightLayer.style.opacity = "";
      nightLayer.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
    }
  }
  if (worldSweep) worldSweep.style.left = `${p * 100}%`;
  if (worldBar) worldBar.style.height = `${p * 100}%`;
  if (worldTime) worldTime.textContent = fmtTime(p);
  const night = p >= 0.5;
  if (worldLabel) worldLabel.textContent = night ? labelNight : labelDay;
  if (capDay) {
    capDay.style.opacity = night ? "0" : "1";
    capDay.style.visibility = night ? "hidden" : "visible";
  }
  if (capNight) {
    capNight.style.opacity = night ? "1" : "0";
    capNight.style.visibility = night ? "visible" : "hidden";
  }
  btnDay?.classList.toggle("on", !night);
  btnNight?.classList.toggle("on", night);
  btnDay?.setAttribute("aria-pressed", String(!night));
  btnNight?.setAttribute("aria-pressed", String(night));
}

const anchorLinks = document.querySelectorAll<HTMLAnchorElement>(".hud-nav a, .rail a, .hud-brand");

/* ================================================================
   REDUCED MOTION: static page, working toggles, no scroll effects
================================================================ */
if (RM) {
  document.getElementById("boot")?.remove();
  document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
    el.style.opacity = "1";
  });
  setWorld(0);
  btnDay?.addEventListener("click", () => setWorld(0));
  btnNight?.addEventListener("click", () => setWorld(1));
  anchorLinks.forEach((a) => {
    a.addEventListener("click", (e) => {
      const t = document.querySelector(a.getAttribute("href") ?? "");
      if (t) {
        e.preventDefault();
        t.scrollIntoView();
      }
    });
  });
} else {
  /* ================================================================
     FULL MOTION
  ================================================================ */
  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Lenis smooth scroll ---------- */
  const lenis = new Lenis({ duration: 1.15, smoothWheel: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => {
    lenis.raf(t * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  /* anchor scrolling */
  anchorLinks.forEach((a) => {
    a.addEventListener("click", (e) => {
      const t = document.querySelector(a.getAttribute("href") ?? "");
      if (t) {
        e.preventDefault();
        lenis.scrollTo(t as HTMLElement, { offset: 0 });
      }
    });
  });

  /* ---------- boot sequence (module) ---------- */
  runBoot();

  /* ---------- HUD state ---------- */
  const hud = document.getElementById("hud");
  ScrollTrigger.create({
    start: 80,
    end: "max",
    onEnter: () => hud?.classList.add("scrolled"),
    onLeaveBack: () => hud?.classList.remove("scrolled"),
  });

  /* ---------- rail active state ---------- */
  const railLinks = document.querySelectorAll(".rail a");
  ["hero", "profile", "index", "world", "voice", "facts"].forEach((id, i) => {
    ScrollTrigger.create({
      trigger: `#${id}`,
      start: "top 50%",
      end: "bottom 50%",
      onToggle: (self) => {
        if (self.isActive) {
          railLinks.forEach((l) => l.classList.remove("on"));
          railLinks[i]?.classList.add("on");
        }
      },
    });
  });

  /* ---------- generic reveals ---------- */
  gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
    if (el.closest("#hero")) return; // hero handled by boot timeline
    gsap.fromTo(
      el,
      { y: 44, opacity: 0, clipPath: "inset(0 0 18% 0)" },
      {
        y: 0,
        opacity: 1,
        clipPath: "inset(0 0 0% 0)",
        duration: 1.05,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 86%" },
      }
    );
  });

  /* ---------- hero mouse parallax + tilt ---------- */
  const hero = document.getElementById("hero");
  if (hero) {
    const layers = Array.from(hero.querySelectorAll<HTMLElement>("[data-depth]")).map((el) => ({
      d: parseFloat(el.getAttribute("data-depth") ?? "0"),
      x: gsap.quickTo(el, "x", { duration: 0.9, ease: "power3.out" }),
      y: gsap.quickTo(el, "y", { duration: 0.9, ease: "power3.out" }),
    }));
    const charRX = gsap.quickTo("#heroChar", "rotationY", { duration: 1.0, ease: "power3.out" });
    const charRY = gsap.quickTo("#heroChar", "rotationX", { duration: 1.0, ease: "power3.out" });
    gsap.set("#heroChar", { transformPerspective: 1100 });
    hero.addEventListener("mousemove", (e) => {
      const r = hero.getBoundingClientRect();
      const mx = (e.clientX - r.left) / r.width - 0.5;
      const my = (e.clientY - r.top) / r.height - 0.5;
      layers.forEach((L) => {
        L.x(mx * L.d * 160);
        L.y(my * L.d * 110);
      });
      charRX(mx * 7);
      charRY(-my * 5);
    });
    hero.addEventListener("mouseleave", () => {
      layers.forEach((L) => {
        L.x(0);
        L.y(0);
      });
      charRX(0);
      charRY(0);
    });

    /* hero scroll-out parallax */
    gsap.to("#heroChar", {
      yPercent: 12,
      ease: "none",
      scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
    });
    gsap.to(".hero-ghost", {
      yPercent: -30,
      opacity: 0,
      ease: "none",
      scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
    });
  }

  /* ---------- tilt cards ---------- */
  document.querySelectorAll<HTMLElement>(".tilt").forEach((card) => {
    gsap.set(card, { transformPerspective: 800 });
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      gsap.to(card, {
        rotationY: (px - 0.5) * 10,
        rotationX: (0.5 - py) * 8,
        duration: 0.5,
        ease: "power2.out",
      });
      const sh = card.querySelector<HTMLElement>(".shine");
      if (sh) {
        sh.style.setProperty("--mx", `${px * 100}%`);
        sh.style.setProperty("--my", `${py * 100}%`);
      }
    });
    card.addEventListener("mouseleave", () => {
      gsap.to(card, { rotationX: 0, rotationY: 0, duration: 0.8, ease: "elastic.out(1,0.5)" });
    });
  });

  /* ---------- WORLD: pinned day->night scrub (desktop) / cross-fade toggle (mobile) ---------- */
  if (MOBILE_WORLD) {
    // No pin on narrow screens: the stage stays in flow and DAY/NIGHT buttons
    // drive an animated cross-fade (see CSS: .world-layer.night opacity transition).
    const proxy = { p: 0 };
    const tweenTo = (target: number) =>
      gsap.to(proxy, {
        p: target,
        duration: 0.9,
        ease: "power2.inOut",
        overwrite: true,
        onUpdate: () => setWorld(proxy.p),
      });
    setWorld(0);
    btnDay?.addEventListener("click", () => tweenTo(0));
    btnNight?.addEventListener("click", () => tweenTo(1));
  } else {
    const worldST = ScrollTrigger.create({
      trigger: "#worldStage",
      start: "top top",
      end: "+=180%",
      pin: true,
      scrub: 0.6,
      onUpdate: (self) => setWorld(self.progress),
    });
    btnDay?.addEventListener("click", () => lenis.scrollTo(worldST.start + 10));
    btnNight?.addEventListener("click", () => lenis.scrollTo(worldST.end - 10));
  }

  /* ---------- VOICE: kinetic chars ---------- */
  const vl = document.getElementById("voiceLine");
  if (vl) {
    const out = document.createDocumentFragment();
    Array.from(vl.childNodes).forEach((n) => {
      const text = n.textContent ?? "";
      const accent = n.nodeType !== 3; // element nodes carry the .accent span
      text.split("").forEach((c) => {
        if (c.trim() === "" && accent) return;
        const s = document.createElement("span");
        s.className = accent ? "ch accent" : "ch";
        s.textContent = c;
        out.appendChild(s);
      });
    });
    vl.innerHTML = "";
    vl.appendChild(out);
    gsap.from("#voiceLine .ch", {
      yPercent: 120,
      opacity: 0,
      rotation: 8,
      duration: 0.9,
      ease: "back.out(1.6)",
      stagger: 0.045,
      scrollTrigger: { trigger: "#voice", start: "top 62%" },
    });
    gsap.to("#voiceLine", {
      yPercent: -14,
      ease: "none",
      scrollTrigger: { trigger: "#voice", start: "top bottom", end: "bottom top", scrub: true },
    });
  }

  /* ---------- profile visual parallax ---------- */
  gsap.to(".profile-visual", {
    y: -40,
    ease: "none",
    scrollTrigger: { trigger: ".profile-grid", start: "top bottom", end: "bottom top", scrub: true },
  });

  window.addEventListener("load", () => ScrollTrigger.refresh());
}

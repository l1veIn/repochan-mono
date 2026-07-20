import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

/**
 * Scroll choreography: Lenis smooth scroll + GSAP/ScrollTrigger reveals,
 * hero parallax, orb float/drift, cutout swim, aurora hue drift.
 * Progressive enhancement — content is visible by default and only hidden
 * (via body.anim) once GSAP is confirmed running. Honors reduced motion.
 */
export function initMotion(): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) document.body.classList.add("reduced");

  /* ---------- Lenis smooth scroll ---------- */
  let lenis: Lenis | null = null;
  if (!reduced) {
    lenis = new Lenis({
      duration: 1.35,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
    });
    const raf = (time: number) => {
      lenis!.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }

  /* ---------- GSAP setup ---------- */
  gsap.registerPlugin(ScrollTrigger);
  if (lenis) {
    lenis.on("scroll", ScrollTrigger.update);
  }

  if (reduced) {
    gsap.set(".reveal", { opacity: 1, y: 0 });
  } else {
    // hide reveals only now that GSAP is confirmed — no-JS stays visible
    document.body.classList.add("anim");

    // watery entrances: slow in, gentle overshoot
    gsap.utils.toArray<HTMLElement>(".reveal").forEach((el, i) => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 1.3,
        ease: "back.out(1.25)",
        delay: (i % 3) * 0.08,
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });
    });

    // hero photo parallax
    gsap.to(".hero-photo", {
      yPercent: 18,
      scale: 1.06,
      ease: "none",
      scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: 0.6 },
    });
    gsap.to(".hero-card", {
      yPercent: -14,
      opacity: 0.25,
      ease: "none",
      scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom 30%", scrub: 0.6 },
    });

    // floating orbs: continuous bob + scroll drift (multi-layer parallax)
    gsap.utils.toArray<HTMLElement>(".orb").forEach((orb) => {
      const f = parseFloat(orb.dataset.float || "1");
      const d = parseFloat(orb.dataset.drift || "1");
      gsap.to(orb, { y: -14 * f, duration: 2.6 + f, ease: "sine.inOut", yoyo: true, repeat: -1, delay: f * 0.7 });
      gsap.to(orb, {
        y: -70 * d,
        ease: "none",
        scrollTrigger: { trigger: "#assets", start: "top bottom", end: "bottom top", scrub: 1.2 },
      });
    });

    // cutout character: float + swim with scroll
    gsap.to("#cutout", { y: -18, rotation: 2.5, duration: 3.4, ease: "sine.inOut", yoyo: true, repeat: -1 });
    gsap.fromTo(
      "#cutout",
      { y: 90, rotation: -6 },
      {
        y: -40,
        rotation: 3,
        ease: "none",
        scrollTrigger: { trigger: "#persona", start: "top bottom", end: "bottom top", scrub: 1 },
      },
    );

    // states grid cells stagger pop
    gsap.from("#statesGrid .cell", {
      scale: 0.6,
      opacity: 0,
      duration: 1,
      ease: "back.out(1.6)",
      stagger: { each: 0.07, from: "random" },
      scrollTrigger: { trigger: "#statesGrid", start: "top 85%", once: true },
    });

    // aurora hue drift with overall scroll progress
    gsap.to("#aurora", {
      filter: "blur(40px) saturate(1.15) hue-rotate(70deg)",
      ease: "none",
      scrollTrigger: { trigger: document.body, start: "top top", end: "max", scrub: 1.5 },
    });
  }

  /* ---------- deep link: honor location.hash after Lenis/GSAP init ---------- */
  if (window.location.hash) {
    let deepTarget: Element | null = null;
    try {
      deepTarget = document.querySelector(window.location.hash);
    } catch {
      /* invalid selector in hash — ignore */
    }
    if (deepTarget) {
      requestAnimationFrame(() => {
        if (lenis) lenis.scrollTo(deepTarget as HTMLElement, { immediate: true, force: true });
        else (deepTarget as HTMLElement).scrollIntoView();
        ScrollTrigger.refresh();
      });
    }
  }

  /* ---------- anchor scrolling ---------- */
  document.querySelectorAll<HTMLAnchorElement>("[data-scroll]").forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      const target = id ? document.querySelector(id) : null;
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target as HTMLElement, { offset: -20, duration: 1.6 });
      else (target as HTMLElement).scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    });
  });

  /* ---------- copy install command ---------- */
  const copyBtn = document.getElementById("copyBtn") as HTMLButtonElement | null;
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const cmd = copyBtn.dataset.cmd || "npm install -g repochan";
      const copyLabel = copyBtn.dataset.copyLabel || "Copy";
      const copiedLabel = copyBtn.dataset.copiedLabel || "Copied ✓";
      const done = () => {
        copyBtn.textContent = copiedLabel;
        setTimeout(() => {
          copyBtn.textContent = copyLabel;
        }, 1600);
      };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(cmd).then(done, done);
      else done();
    });
  }
}

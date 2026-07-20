/**
 * Scroll choreography for the RepoChan scrollytelling landing.
 *
 * Faithful port of the approved prototype (web-design/prototypes/
 * landing-scrollytelling/index.html): Lenis smooth scroll, glow-cursor
 * journey, kinetic-type slam-ins, pinned scrub scenes on desktop
 * (analysis terminal typing, persona fragment assembly, foundation
 * sheet reveal, meta wire light-up, CTA typing) and the painter
 * parallax cascade.
 *
 * Degradation contract:
 *  - prefers-reduced-motion → no GSAP/Lenis at all; the `reduced`
 *    class (already applied inline in SiteLayout before paint) flattens
 *    pins into a static vertical flow and every wire cell lights up.
 *  - ≤860px viewports → pins are disabled via gsap.matchMedia; scenes
 *    become stacked blocks with entrance-only reveals.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

export function initScrolly(): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const narrow = window.matchMedia("(max-width: 860px)").matches;

  if (reduced) {
    document.documentElement.classList.add("reduced");
    // Reveal everything the choreography would have lit up.
    document.querySelectorAll(".wire .w").forEach((w) => w.classList.add("lit"));
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  // ---- smooth scroll ----
  const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => {
    lenis.raf(t * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  // ---- split kinetic headings into chars ----
  // Words stay unbreakable (.chw) so space-separated languages wrap at
  // word boundaries; chars inside each word animate individually (.ch).
  document.querySelectorAll<HTMLElement>(".kinetic").forEach((h) => {
    const walk = (node: Node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          (n.textContent ?? "").split(/(\s+)/).forEach((token) => {
            if (!token) return;
            if (/^\s+$/.test(token)) {
              frag.appendChild(document.createTextNode(" "));
              return;
            }
            const word = document.createElement("span");
            word.className = "chw";
            token.split("").forEach((c) => {
              const s = document.createElement("span");
              s.className = "ch";
              s.textContent = c;
              word.appendChild(s);
            });
            frag.appendChild(word);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && (n as HTMLElement).tagName !== "BR") {
          walk(n);
        }
      });
    };
    walk(h);
  });

  // ---- glow cursor journey + rail fill ----
  const cursor = document.getElementById("glow-cursor");
  const fill = document.getElementById("rail-fill");
  // Stage colors come from the rail dots, which GlowChrome renders from the
  // locale content (chrome.dots[].color) — never duplicated here.
  const stageColors = Array.from(document.querySelectorAll<HTMLElement>("#rail-dots .dot"))
    .map((dot) => dot.style.getPropertyValue("--dot-c").trim())
    .filter((color) => color.length > 0);
  if (cursor && fill) {
    ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: (self) => {
        const p = self.progress;
        const y = 8 + p * 84; // vh 8 -> 92
        const x = Math.sin(p * Math.PI * 5) * 26;
        gsap.set(cursor, { top: y + "vh", x: 14 + x, rotation: Math.sin(p * Math.PI * 10) * 24 });
        fill.style.height = p * 100 + "%";
        if (stageColors.length) {
          const color = stageColors[Math.min(stageColors.length - 1, Math.floor(p * stageColors.length))];
          cursor.style.filter = `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 18px ${color})`;
          const path = cursor.querySelector("path");
          if (path) (path as SVGPathElement).style.fill = color;
        }
      },
    });
  }

  // ---- rail dots active state ----
  document.querySelectorAll<HTMLElement>("#rail-dots .dot").forEach((dot) => {
    const sec = document.getElementById(dot.dataset.for ?? "");
    if (!sec) return;
    ScrollTrigger.create({
      trigger: sec,
      start: "top 55%",
      end: "bottom 55%",
      onToggle: (self) => dot.classList.toggle("on", self.isActive),
    });
  });

  // ---- kinetic headings slam in ----
  document.querySelectorAll<HTMLElement>(".kinetic").forEach((h) => {
    gsap.from(h.querySelectorAll(".ch"), {
      yPercent: 130,
      opacity: 0,
      rotation: 8,
      duration: 0.7,
      ease: "back.out(1.9)",
      stagger: 0.035,
      scrollTrigger: { trigger: h, start: "top 82%", toggleActions: "play none none reverse" },
    });
  });

  // ---- hero intro + parallax out ----
  gsap.from("#hero-girl", { x: 220, opacity: 0, rotation: 6, duration: 1.1, ease: "power3.out", delay: 0.35 });
  gsap.from("#hero-girl .bubble", { scale: 0, opacity: 0, duration: 0.5, ease: "back.out(2.2)", delay: 1.1 });
  gsap.from("#hero-sub, #hero-chips", { y: 40, opacity: 0, duration: 0.9, stagger: 0.12, delay: 0.55, ease: "power3.out" });
  gsap.to("#hero-girl", {
    yPercent: -18,
    rotation: -3,
    scrollTrigger: { trigger: "#s-hero", start: "top top", end: "bottom top", scrub: 0.8 },
  });
  gsap.to("#hero-bg", {
    yPercent: 14,
    scale: 1.06,
    scrollTrigger: { trigger: "#s-hero", start: "top top", end: "bottom top", scrub: 0.8 },
  });

  // ---- terminal lines: wipe-typing reveal (pinned, scrubbed) ----
  function typeLines(termSel: string, trigger: string, pinEnd: number) {
    const lines = document.querySelectorAll(termSel + " .tline");
    gsap.set(lines, { clipPath: "inset(0 100% 0 0)", opacity: 0.25 });
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger,
        start: "top top",
        end: "+=" + pinEnd + "%",
        pin: true,
        scrub: 0.6,
        anticipatePin: 1,
      },
    });
    lines.forEach((line) => {
      tl.to(line, { clipPath: "inset(0 0% 0 0)", opacity: 1, duration: 1, ease: "none" });
    });
    return tl;
  }

  const mm = gsap.matchMedia();
  mm.add("(min-width: 861px)", () => {
    // 01 analysis: pinned terminal typing
    const t1 = typeLines("#analysis-term", "#s-analysis .pin-wrap", 160);
    t1.from("#analysis-note", { opacity: 0.15, x: -30, duration: 2 }, 0);
    t1.from("#cameo-analysis", { x: 260, opacity: 0, rotation: 20, duration: 3, ease: "power2.out" }, 1);

    // 02 persona: fragments assemble
    const frags = document.querySelectorAll("#dossier .frag");
    const tl2 = gsap.timeline({
      scrollTrigger: {
        trigger: "#s-persona .pin-wrap",
        start: "top top",
        end: "+=170%",
        pin: true,
        scrub: 0.6,
        anticipatePin: 1,
      },
    });
    tl2.from("#dossier", { scale: 0.92, opacity: 0.4, duration: 2, ease: "power1.out" }, 0);
    frags.forEach((f, i) => {
      tl2.from(
        f,
        {
          x: gsap.utils.random(-360, 360),
          y: gsap.utils.random(-220, 260),
          rotation: gsap.utils.random(-70, 70),
          scale: 0.4,
          opacity: 0,
          duration: 2.2,
          ease: "power2.out",
        },
        0.6 + i * 0.55,
      );
    });
    tl2.from("#dossier .d-motto", { opacity: 0, y: 26, duration: 2 }, ">-1");
    tl2.from("#dossier .d-bday", { scale: 0, rotation: 30, duration: 1.5, ease: "back.out(2)" }, "<+0.5");

    // 03 foundation: sheet reveal
    const tl3 = gsap.timeline({
      scrollTrigger: {
        trigger: "#s-foundation .pin-wrap",
        start: "top top",
        end: "+=150%",
        pin: true,
        scrub: 0.6,
        anticipatePin: 1,
      },
    });
    tl3.fromTo(
      "#foundation-sheet",
      { clipPath: "inset(28% 28% 28% 28% round 40px)", scale: 0.82, rotation: -5 },
      { clipPath: "inset(0% 0% 0% 0% round 18px)", scale: 1, rotation: 0, duration: 4, ease: "power1.inOut" },
      0,
    );
    tl3.from("#foundation-stamp", { scale: 2.6, opacity: 0, rotation: 14, duration: 1.6, ease: "power3.out" }, 2.6);
    tl3.from(".sheet-meta span", { opacity: 0, y: 18, stagger: 0.5, duration: 1 }, 3);
    tl3.from(".mini-stack img", { opacity: 0, x: -30, stagger: 0.5, duration: 1 }, 3.6);

    // 05 page: wire boxes light up
    const tl5 = gsap.timeline({
      scrollTrigger: {
        trigger: "#s-page .pin-wrap",
        start: "top top",
        end: "+=130%",
        pin: true,
        scrub: 0.6,
        anticipatePin: 1,
      },
    });
    tl5.from("#meta-browser", { y: 90, opacity: 0, duration: 2, ease: "power2.out" }, 0);
    document.querySelectorAll(".wire .w").forEach((w, i) => {
      tl5.fromTo(
        w,
        { scale: 0.6 },
        {
          scale: 1,
          duration: 0.8,
          ease: "back.out(2)",
          onStart: () => w.classList.add("lit"),
        },
        1.2 + i * 0.9,
      );
    });
    tl5.from("#cameo-page", { x: -240, opacity: 0, rotation: -18, duration: 2.4, ease: "power2.out" }, 1);

    // 06 cta: terminal typing + button pulse
    const t6 = typeLines("#cta-term", "#s-cta .pin-wrap", 120);
    t6.from("#cta-btn", { scale: 0.6, opacity: 0, duration: 1.6, ease: "back.out(2)" }, ">-0.5");
    gsap.to("#cta-btn", {
      scale: 1.05,
      repeat: -1,
      yoyo: true,
      duration: 0.9,
      ease: "sine.inOut",
      scrollTrigger: { trigger: "#cta-btn", start: "top 90%", toggleActions: "play pause resume pause" },
    });
  });

  // ---- painter cascade (all sizes; light parallax on desktop only) ----
  gsap.utils.toArray<HTMLElement>(".p-item").forEach((el) => {
    const speed = parseFloat(el.dataset.speed || "1");
    gsap.from(el, {
      opacity: 0,
      y: 90,
      rotation: gsap.utils.random(-6, 6),
      duration: 1,
      ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 92%", toggleActions: "play none none reverse" },
    });
    if (!narrow) {
      gsap.to(el, {
        yPercent: -speed * 26,
        scrollTrigger: { trigger: "#painter-field", start: "top bottom", end: "bottom top", scrub: 1.2 },
      });
    }
  });
  if (!narrow) {
    gsap.to("#painter-pattern", {
      backgroundPosition: "0 -220px",
      scrollTrigger: { trigger: "#painter-field", start: "top bottom", end: "bottom top", scrub: 1 },
    });
  }

  // 05 page on narrow viewports: the pinned light-up scene is disabled,
  // so simply light every wire cell when the section scrolls into view.
  mm.add("(max-width: 860px)", () => {
    ScrollTrigger.create({
      trigger: "#s-page",
      start: "top 70%",
      onEnter: () => {
        document.querySelectorAll(".wire .w").forEach((w, i) => {
          gsap.delayedCall(0.12 * i, () => w.classList.add("lit"));
        });
      },
      once: true,
    });
  });

  // cursor "click" when reaching CTA
  if (cursor) {
    ScrollTrigger.create({
      trigger: "#s-cta",
      start: "top 60%",
      onEnter: () => {
        gsap.fromTo(cursor, { scale: 1 }, { scale: 1.6, duration: 0.18, yoyo: true, repeat: 3, ease: "power2.inOut" });
      },
      once: true,
    });
  }
}

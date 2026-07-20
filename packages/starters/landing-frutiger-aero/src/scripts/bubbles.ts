/**
 * Three-layer parallax bubble canvas + cursor bubble trail + click ripples.
 * Performance: pauses when the tab is hidden (visibilitychange) or the
 * canvas leaves the viewport (IntersectionObserver); caps DPR at 2;
 * halves bubble counts on narrow viewports. Fully disabled under
 * prefers-reduced-motion.
 *
 * Colors come from the CSS custom properties injected by SiteLayout
 * (repochan/site.json palette → --*-rgb channel triplets), so re-theming
 * the starter re-colors the canvas without touching this file.
 */

interface Layer {
  n: number;
  rMin: number;
  rMax: number;
  speed: number;
  alpha: number;
  par: number;
}

interface Bubble {
  layer: number;
  x: number;
  y: number;
  r: number;
  vx: number;
  wobble: number;
  wobbleSpd: number;
}

interface Trail {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  life: number;
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  life: number;
}

const LAYERS: Layer[] = [
  { n: 10, rMin: 26, rMax: 64, speed: 0.28, alpha: 0.3, par: 0.12 },
  { n: 12, rMin: 10, rMax: 26, speed: 0.55, alpha: 0.42, par: 0.3 },
  { n: 10, rMin: 3, rMax: 10, speed: 0.95, alpha: 0.55, par: 0.55 },
];

/** Fewer bubbles on phones — the canvas is the page's main GPU/CPU cost. */
const MOBILE_COUNT_SCALE = 0.5;
const MOBILE_BREAKPOINT = 640;

/** "r g b" CSS-channel triplet → "r,g,b" for rgba() composition. */
function rgbChannels(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? value.split(/\s+/).join(",") : fallback;
}

export function initBubbles(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.getElementById("bubbles") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const WHITE = rgbChannels("--white-rgb", "255,255,255");
  const SKY_200 = rgbChannels("--sky-200-rgb", "186,230,253");
  const SKY_300 = rgbChannels("--sky-300-rgb", "125,211,252");

  let W = 0;
  let H = 0;
  const resize = () => {
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  const scale = W < MOBILE_BREAKPOINT ? MOBILE_COUNT_SCALE : 1;
  const bubbles: Bubble[] = [];
  LAYERS.forEach((L, li) => {
    const n = Math.max(2, Math.round(L.n * scale));
    for (let i = 0; i < n; i++) {
      bubbles.push({
        layer: li,
        x: Math.random() * W,
        y: Math.random() * H,
        r: L.rMin + Math.random() * (L.rMax - L.rMin),
        vx: (Math.random() - 0.5) * 0.25,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpd: 0.004 + Math.random() * 0.01,
      });
    }
  });

  const trails: Trail[] = [];
  const ripples: Ripple[] = [];
  const mouse = { x: -999, y: -999, px: -999, py: -999 };

  window.addEventListener("pointermove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    const dx = mouse.x - mouse.px;
    const dy = mouse.y - mouse.py;
    if (dx * dx + dy * dy > 260 && trails.length < 40) {
      // cursor bubble trail
      trails.push({
        x: mouse.x,
        y: mouse.y,
        r: 2 + Math.random() * 5,
        life: 1,
        vy: -0.8 - Math.random() * 0.8,
        vx: (Math.random() - 0.5) * 0.6,
      });
      mouse.px = mouse.x;
      mouse.py = mouse.y;
    }
  });
  window.addEventListener("pointerdown", (e) => {
    ripples.push({ x: e.clientX, y: e.clientY, r: 4, life: 1 });
  });

  const drawBubble = (b: { x: number; y: number; r: number }, alpha: number) => {
    const g = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
    g.addColorStop(0, `rgba(${WHITE},${0.85 * alpha})`);
    g.addColorStop(0.25, `rgba(${SKY_200},${0.28 * alpha})`);
    g.addColorStop(0.8, `rgba(${SKY_300},${0.16 * alpha})`);
    g.addColorStop(1, `rgba(${WHITE},${0.45 * alpha})`);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // specular highlight
    ctx.beginPath();
    ctx.ellipse(b.x - b.r * 0.34, b.y - b.r * 0.42, b.r * 0.24, b.r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${WHITE},${0.9 * alpha})`;
    ctx.fill();
  };

  let scrollY = 0;
  window.addEventListener(
    "scroll",
    () => {
      scrollY = window.scrollY;
    },
    { passive: true },
  );

  /* ---------- run/pause plumbing (prototype perf debt) ---------- */
  let rafId = 0;
  let pageVisible = !document.hidden;
  let inViewport = true;

  const tick = () => {
    ctx.clearRect(0, 0, W, H);
    for (const b of bubbles) {
      const L = LAYERS[b.layer];
      b.wobble += b.wobbleSpd;
      b.y -= L.speed * (0.6 + (b.r / L.rMax) * 0.5);
      b.x += b.vx + Math.sin(b.wobble) * 0.3;
      // cursor repel — gentle watery push
      const dx = b.x - mouse.x;
      const dy = b.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 150 * 150 && d2 > 1) {
        const d = Math.sqrt(d2);
        const f = ((150 - d) / 150) * 0.9;
        b.x += (dx / d) * f;
        b.y += (dy / d) * f;
      }
      const drawY = b.y + scrollY * L.par * 0.35; // scroll parallax lift
      if (drawY < -b.r * 2) {
        b.y = H + b.r + scrollY * L.par * -0.35;
        b.x = Math.random() * W;
      }
      if (b.x < -b.r * 2) b.x = W + b.r;
      if (b.x > W + b.r * 2) b.x = -b.r;
      drawBubble({ x: b.x, y: drawY, r: b.r }, L.alpha);
    }
    // cursor trail bubbles
    for (let i = trails.length - 1; i >= 0; i--) {
      const t = trails[i];
      t.x += t.vx;
      t.y += t.vy;
      t.life -= 0.018;
      t.r += 0.06;
      if (t.life <= 0) {
        trails.splice(i, 1);
        continue;
      }
      drawBubble(t, 0.6 * t.life);
    }
    // click ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += 3.2;
      rp.life -= 0.03;
      if (rp.life <= 0) {
        ripples.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${WHITE},${0.55 * rp.life})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    rafId = requestAnimationFrame(tick);
  };

  const stop = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  };
  const sync = () => {
    if (pageVisible && inViewport) {
      if (!rafId) rafId = requestAnimationFrame(tick);
    } else {
      stop();
    }
  };

  document.addEventListener("visibilitychange", () => {
    pageVisible = !document.hidden;
    sync();
  });
  const io = new IntersectionObserver((entries) => {
    inViewport = entries[0]?.isIntersecting ?? true;
    sync();
  });
  io.observe(canvas);

  sync();
}

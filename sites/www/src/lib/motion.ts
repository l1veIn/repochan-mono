/**
 * Progressive enhancement.
 * - Reveal on scroll
 * - Copy-to-clipboard buttons
 * - Viewer.js for zoomable exhibit previews
 */

import Viewer from "viewerjs";
import "viewerjs/dist/viewer.css";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

document.documentElement.classList.add("js");

/** Entrance fade via IntersectionObserver. */
function initReveal(): void {
  const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("revealed"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );
  els.forEach((el) => io.observe(el));
}

/** Persist manual locale choice before navigating EN/ZH links. */
function initLocalePreference(): void {
  document.querySelectorAll<HTMLAnchorElement>("[data-set-locale]").forEach((a) => {
    a.addEventListener("click", () => {
      const loc = a.getAttribute("data-set-locale");
      if (loc === "zh" || loc === "en") {
        try {
          localStorage.setItem("repochan_locale", loc);
        } catch {
          /* ignore */
        }
      }
    });
  });
}

/** One-click copy for [data-copy] buttons. */
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

function resolveSrc(t: HTMLElement): string {
  const explicit = t.getAttribute("data-lb-src");
  if (explicit) return explicit;
  if (t instanceof HTMLImageElement) return t.currentSrc || t.src || "";
  const nested = t.querySelector("img");
  return nested?.currentSrc || nested?.src || "";
}

function resolveAlt(t: HTMLElement): string {
  return (
    t.getAttribute("data-lb-alt") ??
    t.getAttribute("data-lb-caption") ??
    t.querySelector("img")?.alt ??
    ""
  );
}

function resolveTitle(t: HTMLElement): string {
  const caption = t.getAttribute("data-lb-caption") ?? "";
  const order = t.getAttribute("data-lb-order") ?? "";
  if (caption && order) return `${caption} · ${order}`;
  return caption || order || "";
}

/**
 * Viewer.js gallery over every [data-lightbox] trigger.
 * Supports zoom, drag, rotate, fullscreen, keyboard.
 */
function initViewer(): void {
  const triggers = Array.from(document.querySelectorAll<HTMLElement>("[data-lightbox]"));
  if (triggers.length === 0) return;

  const gallery = document.createElement("div");
  gallery.id = "viewer-gallery";
  gallery.setAttribute("hidden", "");
  gallery.setAttribute("aria-hidden", "true");
  // Keep off-screen but measurable for Viewer
  gallery.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;";

  triggers.forEach((t) => {
    const src = resolveSrc(t);
    if (!src) return;
    const img = document.createElement("img");
    img.src = src;
    img.alt = resolveAlt(t);
    img.dataset.title = resolveTitle(t);
    gallery.appendChild(img);
  });

  if (gallery.childElementCount === 0) return;
  document.body.appendChild(gallery);

  const viewer = new Viewer(gallery, {
    url: "src",
    title: (image: HTMLImageElement) => image.dataset.title || image.alt || "",
    toolbar: {
      zoomIn: 1,
      zoomOut: 1,
      oneToOne: 1,
      reset: 1,
      prev: triggers.length > 1 ? 1 : 0,
      play: 0,
      next: triggers.length > 1 ? 1 : 0,
      rotateLeft: 1,
      rotateRight: 1,
      flipHorizontal: 0,
      flipVertical: 0,
    },
    navbar: triggers.length > 1,
    movable: true,
    zoomable: true,
    zoomOnTouch: true,
    zoomOnWheel: true,
    rotatable: true,
    scalable: false,
    transition: !reduceMotion.matches,
    fullscreen: true,
    keyboard: true,
    backdrop: true,
    focus: true,
    loading: true,
    loop: true,
    minZoomRatio: 0.1,
    maxZoomRatio: 8,
    viewed() {
      // Prefer fit-to-view then allow pinch/wheel zoom
    },
  });

  triggers.forEach((t, i) => {
    const open = (ev: Event) => {
      ev.preventDefault();
      viewer.view(i);
    };
    t.addEventListener("click", open);
    t.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        viewer.view(i);
      }
    });
    if (!t.hasAttribute("role")) t.setAttribute("role", "button");
    if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "0");
  });
}

initReveal();
initLocalePreference();
initCopyButtons();
initViewer();

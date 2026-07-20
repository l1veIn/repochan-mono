/**
 * Custom cursor (dot + trailing ring). Pointer-fine devices only;
 * decorative — both elements are aria-hidden in the markup.
 */
export function initCursor(): void {
  const dot = document.querySelector<HTMLElement>(".cursor-dot");
  const ring = document.querySelector<HTMLElement>(".cursor-ring");
  if (!dot || !ring) return;

  if (!window.matchMedia("(hover:hover)").matches) {
    dot.style.display = "none";
    ring.style.display = "none";
    return;
  }

  let cx = -100;
  let cy = -100;
  let rx = -100;
  let ry = -100;
  document.addEventListener("mousemove", (e) => {
    cx = e.clientX;
    cy = e.clientY;
  });

  const loop = () => {
    rx += (cx - rx) * 0.16;
    ry += (cy - ry) * 0.16;
    dot.style.transform = `translate(${cx - 3}px,${cy - 3}px)`;
    ring.style.transform = `translate(${rx - 17}px,${ry - 17}px)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  document.querySelectorAll("[data-hover]").forEach((el) => {
    el.addEventListener("mouseenter", () => document.body.classList.add("hovering"));
    el.addEventListener("mouseleave", () => document.body.classList.remove("hovering"));
  });
}

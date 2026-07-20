import { gsap } from "gsap";

/**
 * Boot sequence: fake loading bar -> localized "loaded" status ->
 * curtain lift -> hero entrance (info stagger, character rise, stickers pop).
 * The loaded-status string comes from the markup (i18n data-driven).
 */
export function runBoot(): gsap.core.Timeline {
  const boot = document.getElementById("boot");
  const tl = gsap.timeline();
  if (!boot) return tl;

  tl.to("#boot .boot-bar i", { scaleX: 1, duration: 1.0, ease: "power2.inOut" })
    .call(() => {
      const status = document.querySelector("#boot .boot-status");
      if (status && boot.dataset.statusLoaded) status.textContent = boot.dataset.statusLoaded;
    })
    .to(boot, { clipPath: "inset(0 0 100% 0)", duration: 0.9, ease: "power4.inOut", delay: 0.35 })
    .set(boot, { display: "none" })
    .fromTo(
      ".hero-info > *",
      { y: 46, opacity: 0 },
      { y: 0, opacity: 1, duration: 1.0, stagger: 0.09, ease: "power3.out" },
      "-=0.45"
    )
    .from("#heroChar", { y: 80, opacity: 0, scale: 0.96, duration: 1.3, ease: "power3.out" }, "<")
    .from(".sticker-float", { scale: 0, opacity: 0, duration: 0.8, stagger: 0.12, ease: "back.out(2)" }, "-=0.7");

  return tl;
}

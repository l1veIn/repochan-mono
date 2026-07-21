// build-hero.mjs — deterministic terminal-window hero for the terminal-corner README skin.
// The terminal chrome + transcript are hand-drawn SVG (no AI generation); the corner badge
// is a circle crop of the dogfood cutout (ord-cutout, via character-game-page hero-cutout.webp).
// Usage: node build-hero.mjs   (run from this directory; resolves sharp from the monorepo store)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require("/Users/yangchen/Desktop/repochan-mono/node_modules/.pnpm/sharp@0.34.5/node_modules/sharp");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const CUTOUT = path.join(ROOT, "packages/starters/character-game-page/public/assets/hero-cutout.webp");

const W = 2400, H = 1000;
const WIN = { x: 56, y: 40, w: 2088, h: 920, r: 22 };
const BAR = 84; // title-bar height

// ---- transcript: real repochan commands (decorative; copyable commands live in README body)
const C = {
  prompt: "#7EE0C3",   // mint (mascot streak)
  cmd: "#E6EDF3",      // near-white
  flag: "#79C0FF",     // cyan
  ok: "#3FB950",       // green check
  dim: "#8B949E",      // output gray
  warn: "#D29922",     // checkpoint amber
  path: "#A5D6FF",     // path cyan
  pink: "#F9A8D4",     // mascot pink
};
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FONT = `font-family="Menlo, 'SF Mono', monospace"`;
const FS = 32, LH = 48, X0 = WIN.x + 64, Y0 = WIN.y + BAR + 56;

// each line = array of [text, color] spans
const LINES = [
  [["$ ", C.prompt], ["npm install -g repochan && ", C.cmd], ["repochan setup", C.flag]],
  [["✔ ", C.ok], ["skills installed → claude · codex · cursor", C.dim]],
  [],
  [["$ ", C.prompt], ["repochan analysis run", C.cmd]],
  [["✔ ", C.ok], ["1,284 files scanned → ", C.dim], [".repochan/analysis/report.json", C.path]],
  [],
  [["$ ", C.prompt], ["repochan persona create ", C.cmd], ["--data-file", C.flag], [" persona.json", C.cmd]],
  [["✔ ", C.ok], ["仓库酱 · silver hair, heterochromia, REPO hoodie", C.dim]],
  [["⏸ ", C.warn], ["checkpoint 1/3 — waiting for your confirmation", C.warn]],
  [],
  [["$ ", C.prompt], ["repochan image gen ", C.cmd], ["--prompt", C.flag], [" \"foundation sheet…\" ", C.cmd], ["--size", C.flag], [" 4K", C.cmd]],
  [["✔ ", C.ok], ["ord-foundation-001 → ", C.dim], ["versions/v2026-07-19T13-53-01Z/", C.path]],
  [],
  [["$ ", C.prompt], ["repochan starter pull ", C.cmd], ["--starter", C.flag], [" landing-museum", C.cmd]],
  [["✔ ", C.ok], ["pulled → ", C.dim], [".repochan/web-starter/", C.path], [" · 20 starters available", C.dim]],
  [],
  [["$ ", C.prompt]],
];

function transcriptSvg() {
  let out = "";
  let y = Y0;
  for (const line of LINES) {
    if (line.length === 0) { y += LH * 0.5; continue; }
    let x = X0;
    out += `<text x="${x}" y="${y}" ${FONT} font-size="${FS}" xml:space="preserve">`;
    for (const [t, c] of line) out += `<tspan fill="${c}">${esc(t)}</tspan>`;
    out += `</text>`;
    y += LH;
  }
  // block cursor after the final prompt
  const cursorX = X0 + FS * 0.602 * 2; // after "$ "
  out += `<rect x="${cursorX}" y="${y - LH - FS + 6}" width="${FS * 0.6}" height="${FS * 1.15}" fill="${C.prompt}" opacity="0.9"/>`;
  return out;
}

function windowSvg() {
  const { x, y, w, h, r } = WIN;
  const dots = [
    ["#FF5F57", x + 52], ["#FEBC2E", x + 92], ["#28C840", x + 132],
  ].map(([c, cx]) => `<circle cx="${cx}" cy="${y + BAR / 2}" r="11" fill="${c}"/>`).join("");
  return `
  <defs>
    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#21262D"/><stop offset="1" stop-color="#161B22"/>
    </linearGradient>
    <clipPath id="winClip"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>
  </defs>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#0D1117" stroke="#30363D" stroke-width="2"/>
  <g clip-path="url(#winClip)">
    <rect x="${x}" y="${y}" width="${w}" height="${BAR}" fill="url(#barGrad)"/>
    <line x1="${x}" y1="${y + BAR}" x2="${x + w}" y2="${y + BAR}" stroke="#30363D" stroke-width="2"/>
  </g>
  ${dots}
  <text x="${x + w / 2}" y="${y + BAR / 2 + 10}" ${FONT} font-size="30" fill="#8B949E" text-anchor="middle">repochan — zsh</text>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${windowSvg()}
  ${transcriptSvg()}
</svg>`;

// ---- corner badge: circle-cropped mascot face with mint→pink ring
const BADGE = { d: 420, cx: 2150, cy: 760, ring: 14 };
async function badgeBuffers(diameter) {
  const inner = diameter - BADGE.ring * 2;
  const face = await sharp(CUTOUT)
    .extract({ left: 660, top: 50, width: 820, height: 820 })
    .resize(inner, inner)
    .png()
    .toBuffer();
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}"><circle cx="${inner / 2}" cy="${inner / 2}" r="${inner / 2}" fill="#fff"/></svg>`
  );
  const faceCircle = await sharp(face).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const r = diameter / 2;
  const ring = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#7EE0C3"/><stop offset="1" stop-color="#F9A8D4"/>
      </linearGradient></defs>
      <circle cx="${r}" cy="${r}" r="${r - 2}" fill="#0D1117"/>
      <circle cx="${r}" cy="${r}" r="${r - 4}" fill="none" stroke="url(#g)" stroke-width="${BADGE.ring}"/>
    </svg>`
  );
  return sharp(ring).composite([{ input: faceCircle, top: BADGE.ring, left: BADGE.ring }]).png().toBuffer();
}

const hero = await sharp(Buffer.from(svg))
  .composite([{ input: await badgeBuffers(BADGE.d), top: BADGE.cy - BADGE.d / 2, left: BADGE.cx - BADGE.d / 2 }])
  .webp({ quality: 84 })
  .toFile(path.join(HERE, "hero-terminal.webp"));

const badge = await sharp(await badgeBuffers(192)).webp({ quality: 88 }).toFile(path.join(HERE, "corner-badge.webp"));

console.log("hero-terminal.webp", hero.width + "x" + hero.height, (hero.size / 1024).toFixed(1) + "KB");
console.log("corner-badge.webp", badge.width + "x" + badge.height, (badge.size / 1024).toFixed(1) + "KB");

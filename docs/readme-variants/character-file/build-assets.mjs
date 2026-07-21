// Build script for the character-file README skin assets.
// Composites (not AI generation): cutout A + persona file-card -> hero light/dark,
// plus a sticker strip. Run from repo root: node docs/readme-variants/character-file/build-assets.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(root, 'package.json'));
const sharp = require(path.join(root, 'node_modules/.pnpm/sharp@0.34.5/node_modules/sharp'));

const OUT = path.join(root, 'docs/readme-variants/character-file/assets');
const CUTOUT = path.join(root, 'packages/starters/character-game-page/public/assets/hero-cutout.webp');
const STICKER_DIR = path.join(root, 'packages/starters/landing-neobrutal-zine/public/assets');

// Persona fields sourced from .repochan/persona/current.json
const FIELDS = [
  ['AGE', '16'],
  ['ROLE', 'Digital illustrator · HS freshman'],
  ['STUDIO', 'Sugar Riff'],
  ['HEIGHT', '158 cm'],
  ['BIRTHDAY', '06-13 — first commit'],
  ['FUEL', 'Iced cola + rock riffs'],
];
const CATCH = '「只要手里画笔在，到哪都是实力派。」';
const PALETTE = ['#38BDF8', '#F9A8D4', '#A78BFA', '#34D399', '#FACC15', '#111827'];

const MONO = 'Menlo, Monaco, monospace';
const SANS = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const CJK = 'PingFang SC, Hiragino Sans GB, sans-serif';

function theme(dark) {
  return dark
    ? { bg: '#10141D', grid: 'rgba(244,246,251,0.05)', ink: '#F4F6FB', sub: 'rgba(244,246,251,0.55)', card: 'rgba(27,33,48,0.92)', cardStroke: 'rgba(244,246,251,0.14)', glowO: 0.5, chipText: 'rgba(244,246,251,0.7)' }
    : { bg: '#F4F2EC', grid: 'rgba(26,26,26,0.05)', ink: '#1A1A1A', sub: 'rgba(26,26,26,0.55)', card: 'rgba(255,255,255,0.82)', cardStroke: 'rgba(26,26,26,0.14)', glowO: 0.38, chipText: 'rgba(26,26,26,0.6)' };
}

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

function backgroundSvg(t) {
  // grid lines every 80px
  let lines = '';
  for (let x = 80; x < 2400; x += 80) lines += `<line x1="${x}" y1="0" x2="${x}" y2="1000" stroke="${t.grid}" stroke-width="1"/>`;
  for (let y = 80; y < 1000; y += 80) lines += `<line x1="0" y1="${y}" x2="2400" y2="${y}" stroke="${t.grid}" stroke-width="1"/>`;
  return `<svg width="2400" height="1000" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="${t.glowO}"/>
      <stop offset="55%" stop-color="#A78BFA" stop-opacity="${t.glowO * 0.55}"/>
      <stop offset="100%" stop-color="#F9A8D4" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#38BDF8"/><stop offset="50%" stop-color="#A78BFA"/><stop offset="100%" stop-color="#F9A8D4"/>
    </linearGradient>
  </defs>
  <rect width="2400" height="1000" fill="${t.bg}"/>
  ${lines}
  <ellipse cx="520" cy="540" rx="480" ry="470" fill="url(#glow)"/>
  <rect x="0" y="0" width="2400" height="10" fill="url(#bar)"/>
  <rect x="0" y="990" width="2400" height="10" fill="url(#bar)"/>
  <text x="60" y="72" font-family="${MONO}" font-size="26" letter-spacing="6" fill="${t.sub}">REPOCHAN // PERSONA PIPELINE · DOGFOOD OUTPUT</text>
  <text x="2340" y="952" text-anchor="end" font-family="${MONO}" font-size="22" letter-spacing="4" fill="${t.sub}">.repochan/persona/current.json</text>
</svg>`;
}

function cardSvg(t) {
  const rows = FIELDS.map(([k, v], i) => {
    const y = 392 + i * 66;
    return `
    <text x="1160" y="${y}" font-family="${MONO}" font-size="25" letter-spacing="4" fill="${t.sub}">${k}</text>
    <text x="1460" y="${y}" font-family="${SANS}" font-size="33" font-weight="600" fill="${t.ink}">${esc(v)}</text>
    <line x1="1160" y1="${y + 22}" x2="2290" y2="${y + 22}" stroke="${t.grid}" stroke-width="2"/>`;
  }).join('');
  const chips = PALETTE.map((c, i) => {
    const x = 1160 + i * 190;
    return `
    <circle cx="${x + 14}" cy="852" r="14" fill="${c}" stroke="${t.cardStroke}" stroke-width="2"/>
    <text x="${x + 36}" y="860" font-family="${MONO}" font-size="20" fill="${t.chipText}">${c}</text>`;
  }).join('');
  return `<svg width="2400" height="1000" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bar2" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#38BDF8"/><stop offset="50%" stop-color="#A78BFA"/><stop offset="100%" stop-color="#F9A8D4"/>
    </linearGradient>
  </defs>
  <rect x="1100" y="96" width="1250" height="812" rx="26" fill="${t.card}" stroke="${t.cardStroke}" stroke-width="2"/>
  <rect x="1100" y="96" width="1250" height="8" rx="4" fill="url(#bar2)"/>
  <text x="1160" y="168" font-family="${MONO}" font-size="27" letter-spacing="7" fill="#38BDF8">CHARACTER FILE</text>
  <text x="2290" y="168" text-anchor="end" font-family="${MONO}" font-size="25" letter-spacing="3" fill="${t.sub}">No. REPO-001</text>
  <text x="1160" y="268" font-family="${SANS}" font-size="88" font-weight="800" fill="${t.ink}">RepoChan</text>
  <text x="1700" y="262" font-family="${CJK}" font-size="46" font-weight="600" fill="${t.sub}">仓库酱</text>
  <line x1="1160" y1="312" x2="2290" y2="312" stroke="url(#bar2)" stroke-width="4"/>
  ${rows}
  <rect x="1160" y="742" width="8" height="66" fill="#F9A8D4"/>
  <text x="1192" y="786" font-family="${CJK}" font-size="34" font-weight="600" fill="${t.ink}">${esc(CATCH)}</text>
  ${chips}
  <g transform="rotate(9 2150 250)" opacity="0.9">
    <rect x="2010" y="196" width="270" height="96" rx="10" fill="none" stroke="#F9A8D4" stroke-width="4"/>
    <text x="2145" y="238" text-anchor="middle" font-family="${MONO}" font-size="26" letter-spacing="3" fill="#F9A8D4">PERSONA</text>
    <text x="2145" y="272" text-anchor="middle" font-family="${MONO}" font-size="26" letter-spacing="3" fill="#F9A8D4">VERIFIED ✓</text>
  </g>
</svg>`;
}

async function buildHero(dark) {
  const t = theme(dark);
  const base = await sharp(Buffer.from(backgroundSvg(t))).png().toBuffer();
  const cutout = await sharp(CUTOUT).resize({ height: 972 }).png().toBuffer();
  const meta = await sharp(cutout).metadata();
  const left = Math.round(500 - meta.width / 2);
  const top = 1000 - 972 - 6;
  const card = await sharp(Buffer.from(cardSvg(t))).png().toBuffer();
  const out = path.join(OUT, dark ? 'hero-dark.webp' : 'hero-light.webp');
  await sharp(base)
    .composite([{ input: cutout, left, top }, { input: card, left: 0, top: 0 }])
    .webp({ quality: 84 })
    .toFile(out);
  console.log('wrote', out);
}

async function buildStickerStrip() {
  // 5 tiles 640 -> 5 x 400px cells on a neutral matte, 2000x440 strip
  const ids = ['stickers/sticker-0.webp', 'stickers/sticker-1.webp', 'stickers/sticker-5.webp', 'webstates/state-4.webp', 'webstates/state-8.webp'];
  const cell = 400, pad = 20, h = cell + pad * 2;
  const tiles = await Promise.all(ids.map(async (id, i) => ({
    input: await sharp(path.join(STICKER_DIR, id)).resize(cell, cell, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
    left: i * cell + pad, top: pad,
  })));
  const out = path.join(OUT, 'gallery/sticker-strip.webp');
  await sharp({ create: { width: cell * 5, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(tiles).webp({ quality: 82 }).toFile(out);
  console.log('wrote', out);
}

await buildHero(false);
await buildHero(true);
await buildStickerStrip();

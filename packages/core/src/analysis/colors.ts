import { promises as fs } from "node:fs";
import path from "node:path";
import { exists } from "../protocol/index.js";
import { rel } from "./walk.js";

export const IMAGE_EXTS = new Set([".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico"]);
export const STYLE_EXTS = new Set([".css", ".scss", ".less", ".sass"]);

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const RGB_RE = /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi;

export function normalizeHex(color: string) {
  const c = color.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return c;
}

export function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}

function isLightNeutral(c: string) {
  return /^#(?:f{6}|e{6}|d{6}|c{6}|b{6}|a{6}|9{6}|8{6}|7{6}|6{6})$/i.test(normalizeHex(c));
}

function isDarkNeutral(c: string) {
  return /^#(?:0{6}|1{6}|2{6}|3{6})$/i.test(normalizeHex(c));
}

export function extractColorsFromText(content: string) {
  const colors = [...content.matchAll(HEX_RE)].map((m) => normalizeHex(m[0]));
  for (const m of content.matchAll(RGB_RE)) colors.push(rgbToHex(Number(m[1]), Number(m[2]), Number(m[3])));
  return colors;
}

export async function extractThemeColors(projectRoot: string, files: string[], colorScanLimit = 120) {
  const all: string[] = [];
  const source = new Set<string>();
  const sourcesByColor = new Map<string, Set<string>>();
  const candidates = new Set([
    "tailwind.config.js",
    "tailwind.config.ts",
    "tailwind.config.mjs",
    "uno.config.ts",
    "uno.config.js",
    "unocss.config.ts",
    "theme.ts",
    "theme.js",
    "colors.ts",
    "palette.ts",
    "variables.css",
    "tokens.css",
    "design-tokens.json",
  ]);
  const visualFiles = files
    .filter((f) => STYLE_EXTS.has(path.extname(f).toLowerCase()) || IMAGE_EXTS.has(path.extname(f).toLowerCase()) || candidates.has(path.basename(f)))
    .sort((a, b) => rel(projectRoot, a).localeCompare(rel(projectRoot, b)))
    .slice(0, Math.max(1, colorScanLimit));
  for (const file of visualFiles) {
    try {
      const text = await fs.readFile(file, "utf8");
      const colors = extractColorsFromText(text);
      if (!colors.length) continue;
      const relFile = rel(projectRoot, file);
      source.add(relFile);
      for (const color of colors) {
        all.push(color);
        const set = sourcesByColor.get(color) ?? new Set<string>();
        set.add(relFile);
        sourcesByColor.set(color, set);
      }
    } catch {
      // binary/unreadable
    }
  }
  for (const envFile of [".env", ".env.example", ".env.local"]) {
    const file = path.join(projectRoot, envFile);
    if (!(await exists(file))) continue;
    try {
      for (const line of (await fs.readFile(file, "utf8")).split(/\r?\n/)) {
        const [key, value] = line.split("=", 2);
        if (key && value && /COLOR|COLOUR|THEME|PRIMARY|ACCENT/i.test(key)) {
          const match = value.trim().replace(/["']/g, "").match(/^#[0-9a-fA-F]{3,6}$/);
          if (match) all.push(normalizeHex(match[0]));
        }
      }
      source.add(envFile);
    } catch {
      // ignore
    }
  }
  if (!all.length) return { source_files: [], colors: [], primary_candidates: [], secondary_candidates: [], accent_candidates: [], total_extracted: 0, total_unique: 0 };
  const counts = new Map<string, number>();
  for (const c of all) counts.set(c, (counts.get(c) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const unique = ranked.map(([c]) => c);
  const visible = unique.filter((c) => !isLightNeutral(c) && !isDarkNeutral(c));
  const lights = unique.filter(isLightNeutral);
  const darks = unique.filter(isDarkNeutral);
  const primary = visible.length ? visible.slice(0, 3) : lights.slice(0, 1);
  const accent = visible.length > 3 ? visible.slice(3, 6) : visible.length > 1 ? visible.slice(1, 3) : darks.slice(0, 1);
  return {
    source_files: [...source].sort(),
    colors: unique,
    color_counts: Object.fromEntries(ranked.slice(0, 30)),
    top_colors: ranked.slice(0, 12).map(([color, count]) => ({ color, count, sources: [...(sourcesByColor.get(color) ?? [])].slice(0, 5) })),
    primary_candidates: primary,
    secondary_candidates: primary.length > 1 ? primary.slice(1, 2) : primary,
    accent_candidates: accent,
    neutral_candidates: { light: lights.slice(0, 5), dark: darks.slice(0, 5) },
    total_extracted: all.length,
    total_unique: unique.length,
    scanned_file_count: visualFiles.length,
  };
}

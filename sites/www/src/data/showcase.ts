/** Curated unofficial mascot demos for the public site. */

import personaById from "./showcase-personas.json";
import type { Locale } from "../lib/i18n/types";

export type ShowcaseTier = "featured" | "gallery";

export type LocalizedText = { zh: string; en: string };
export type LocalizedList = { zh: string[]; en: string[] };

export interface ShowcasePersona {
  name: string;
  nameZh?: string | null;
  nameJa?: string | null;
  ageAppearance?: number | string | null;
  birthday?: string | null;
  occupation?: LocalizedText | string | null;
  catchphrase?: LocalizedText | string | null;
  worldName?: LocalizedText | string | null;
  worldAtmosphere?: LocalizedText | string | null;
  personality?: LocalizedText | string | null;
  appearance?: LocalizedText | string | null;
  hobbies?: LocalizedList | string[] | null;
  flaws?: LocalizedList | string[] | null;
  motifs?: LocalizedList | string[] | null;
  mainColor?: string | null;
  secondaryColor?: string | null;
  artStyle?: LocalizedText | string | null;
}

export interface ShowcaseCase {
  id: string;
  tier: ShowcaseTier;
  upstream: { name: string; url: string };
  character: { name: string };
  hasLanding: boolean;
  assets: {
    foundation: string;
    icon?: string;
    poster?: string;
    landing?: string;
  };
  blurb: LocalizedText;
  persona: ShowcasePersona;
}

/** Resolve a bilingual string/list for the active locale. */
export function tText(value: LocalizedText | string | null | undefined, locale: Locale): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[locale] || value.zh || value.en || "";
}

export function tList(value: LocalizedList | string[] | null | undefined, locale: Locale): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  const list = value[locale] || value.zh || value.en || [];
  return list.filter(Boolean);
}

type PersonaMap = Record<string, ShowcasePersona>;
const personas = personaById as PersonaMap;

function withPersona(partial: Omit<ShowcaseCase, "persona">): ShowcaseCase {
  const persona = personas[partial.id];
  if (!persona) {
    throw new Error(`Missing showcase persona for ${partial.id}`);
  }
  return { ...partial, persona };
}

export const showcaseCases: ShowcaseCase[] = [
  withPersona({
    id: "redis",
    tier: "featured",
    upstream: { name: "Redis", url: "https://github.com/redis/redis" },
    character: { name: "Redi" },
    hasLanding: true,
    assets: {
      foundation: "/showcase/redis/foundation.jpg",
      icon: "/showcase/redis/icon.jpg",
      poster: "/showcase/redis/poster.jpg",
      landing: "/showcase/redis/landing.webp",
    },
    blurb: {
      zh: "内存速度具象成会闪现的仓库娘——缓存、结构、实时，一脸干劲。",
      en: "In-memory speed as a lightning-quick harbor girl — cache, structures, real-time energy.",
    },
  }),
  withPersona({
    id: "caddy",
    tier: "featured",
    upstream: { name: "Caddy", url: "https://github.com/caddyserver/caddy" },
    character: { name: "Caddy" },
    hasLanding: true,
    assets: {
      foundation: "/showcase/caddy/foundation.jpg",
      icon: "/showcase/caddy/icon.jpg",
      poster: "/showcase/caddy/poster.jpg",
      landing: "/showcase/caddy/landing.webp",
    },
    blurb: {
      zh: "默认 HTTPS 的秩序感：拱廊、证书、自动正确。",
      en: "HTTPS-by-default composure — arches, certificates, automagic correctness.",
    },
  }),
  withPersona({
    id: "marktext",
    tier: "featured",
    upstream: { name: "MarkText", url: "https://github.com/marktext/marktext" },
    character: { name: "Sumine" },
    hasLanding: true,
    assets: {
      foundation: "/showcase/marktext/foundation.jpg",
      icon: "/showcase/marktext/icon.jpg",
      poster: "/showcase/marktext/poster.jpg",
      landing: "/showcase/marktext/landing.webp",
    },
    blurb: {
      zh: "让 Markdown 变美的编辑器，排印与装饰艺术同框。",
      en: "A Markdown editor that makes text beautiful — typography meets art deco calm.",
    },
  }),
  withPersona({
    id: "ripgrep",
    tier: "gallery",
    upstream: { name: "ripgrep", url: "https://github.com/BurntSushi/ripgrep" },
    character: { name: "Riva" },
    hasLanding: false,
    assets: {
      foundation: "/showcase/ripgrep/foundation.jpg",
      icon: "/showcase/ripgrep/icon.jpg",
      poster: "/showcase/ripgrep/poster.jpg",
    },
    blurb: {
      zh: "在信息湍流里极速检索——CLI 神器的反差萌。",
      en: "Searching the information rapids — a CLI legend with unexpected charm.",
    },
  }),
  withPersona({
    id: "2048",
    tier: "gallery",
    upstream: { name: "2048", url: "https://github.com/gabrielecirulli/2048" },
    character: { name: "Niko" },
    hasLanding: false,
    assets: {
      // *-r5.jpg: cache-busted filenames from test-results round5 archive
      foundation: "/showcase/2048/foundation-r5.jpg",
      icon: "/showcase/2048/icon-r5.jpg",
      poster: "/showcase/2048/poster-r5.jpg",
    },
    blurb: {
      zh: "两个二在一起就成了四——双倍庭院里的温柔访客（round5）。",
      en: "Two twos become four — a gentle visitor in Doubling Courtyard (round5).",
    },
  }),
  withPersona({
    id: "wasm-pack",
    tier: "gallery",
    upstream: { name: "wasm-pack", url: "https://github.com/rustwasm/wasm-pack" },
    character: { name: "Paxi" },
    hasLanding: false,
    assets: {
      foundation: "/showcase/wasm-pack/foundation.jpg",
      icon: "/showcase/wasm-pack/icon.jpg",
      poster: "/showcase/wasm-pack/poster.jpg",
    },
    blurb: {
      zh: "渡口镇的打包向导——把 Rust 装过边境，送进 npm。",
      en: "A packing guide from Port of Crossings — Rust across the border into npm.",
    },
  }),
];

export function getShowcaseCase(id: string): ShowcaseCase | undefined {
  return showcaseCases.find((c) => c.id === id);
}

export function showcasePath(locale: Locale, id?: string): string {
  const base = locale === "zh" ? "/showcase" : "/en/showcase";
  return id ? `${base}/${id}/` : `${base}/`;
}

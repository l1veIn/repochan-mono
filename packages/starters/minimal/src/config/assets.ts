/**
 * Asset registry — maps logical asset keys to files in /public/assets/.
 * Images are copied from .repochan/orders/ into public/assets/ during
 * the site build prep step. Textures live in /public/textures/.
 */

export type RepoChanAsset = {
  key: string;
  label: string;
  src?: string;
  status: "pending" | "ready";
  usage: "hero" | "gallery" | "icon" | "chibi" | "poster";
  fit?: "cover" | "contain";
};

export const assets: RepoChanAsset[] = [
  {
    key: "foundation",
    label: "Foundation sheet",
    src: "/assets/foundation.png",
    status: "ready",
    usage: "gallery",
    fit: "contain",
  },
  {
    key: "banner",
    label: "Hero banner",
    src: "/assets/banner.png",
    status: "ready",
    usage: "hero",
    fit: "cover",
  },
  {
    key: "chibi",
    label: "Chibi sticker sheet",
    src: "/assets/chibi-3x3.png",
    status: "ready",
    usage: "chibi",
    fit: "contain",
  },
  {
    key: "icon",
    label: "Icon grid",
    src: "/assets/icon-grid.png",
    status: "ready",
    usage: "icon",
    fit: "contain",
  },
  {
    key: "poster",
    label: "Poster",
    src: "/assets/poster.png",
    status: "ready",
    usage: "poster",
    fit: "cover",
  },
];

export function getAsset(key: string): RepoChanAsset | undefined {
  return assets.find((a) => a.key === key);
}

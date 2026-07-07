export type RepoChanAsset = {
  key: string;
  label: string;
  orderId: string;
  versionId?: string;
  file?: string;
  src?: string;
  status: "pending" | "ready";
  usage: "hero" | "section-prototype" | "gallery" | "icon" | "pattern" | "chibi" | "poster";
  fit?: "cover" | "contain";
};

export const assets: RepoChanAsset[] = [
  {
    key: "foundation",
    label: "Foundation sheet",
    orderId: "ord-found-001",
    versionId: "v-foundation-20260707-switchbase",
    file: "ord-found-001-foundation-short.png",
    src: "/repochan-assets/ord-found-001/v-foundation-20260707-switchbase/ord-found-001-foundation-short.png",
    status: "ready",
    usage: "gallery",
    fit: "contain",
  },
  {
    key: "banner",
    label: "RepoChan hero banner",
    orderId: "ord-banner-001",
    versionId: "v-banner-20260707-switchbase",
    file: "repochan-banner.png",
    src: "/repochan-assets/ord-banner-001/v-banner-20260707-switchbase/repochan-banner.png",
    status: "ready",
    usage: "hero",
    fit: "cover",
  },
  {
    key: "chibi",
    label: "Chibi sticker sheet",
    orderId: "ord-chibi-3x3-001",
    versionId: "v-chibi-20260707-switchbase",
    file: "luma-chibi-3x3.png",
    src: "/repochan-assets/ord-chibi-3x3-001/v-chibi-20260707-switchbase/luma-chibi-3x3.png",
    status: "ready",
    usage: "chibi",
    fit: "contain",
  },
  {
    key: "pattern",
    label: "2x2 brand pattern matrix",
    orderId: "ord-pattern-001",
    versionId: "v-pattern-20260707-switchbase",
    file: "repochan-pattern-2x2.png",
    src: "/repochan-assets/ord-pattern-001/v-pattern-20260707-switchbase/repochan-pattern-2x2.png",
    status: "ready",
    usage: "pattern",
    fit: "contain",
  },
  {
    key: "poster",
    label: "Luma Protocol poster",
    orderId: "ord-poster-001",
    versionId: "v-poster-20260707-switchbase",
    file: "luma-poster.png",
    src: "/repochan-assets/ord-poster-001/v-poster-20260707-switchbase/luma-poster.png",
    status: "ready",
    usage: "poster",
    fit: "cover",
  },
  {
    key: "icon",
    label: "RepoChan icon",
    orderId: "ord-icon-001",
    versionId: "v-icon-20260707-switchbase",
    file: "repochan-icon.png",
    src: "/repochan-assets/ord-icon-001/v-icon-20260707-switchbase/repochan-icon.png",
    status: "ready",
    usage: "icon",
    fit: "contain",
  },
  {
    key: "site-hero-prototype",
    label: "Hero section prototype",
    orderId: "ord-site-hero-prototype",
    status: "pending",
    usage: "section-prototype",
  },
  {
    key: "site-pipeline-prototype",
    label: "Pipeline section prototype",
    orderId: "ord-site-pipeline-prototype",
    status: "pending",
    usage: "section-prototype",
  },
  {
    key: "site-protocol-prototype",
    label: "Artifact protocol prototype",
    orderId: "ord-site-protocol-prototype",
    status: "pending",
    usage: "section-prototype",
  },
  {
    key: "site-gallery-prototype",
    label: "Asset gallery prototype",
    orderId: "ord-site-gallery-prototype",
    status: "pending",
    usage: "section-prototype",
  },
  {
    key: "site-how-it-works-prototype",
    label: "How it works prototype",
    orderId: "ord-site-how-it-works-prototype",
    status: "pending",
    usage: "section-prototype",
  },
  {
    key: "site-cta-prototype",
    label: "CTA section prototype",
    orderId: "ord-site-cta-prototype",
    status: "pending",
    usage: "section-prototype",
  },
];

export function getAsset(key: string): RepoChanAsset | undefined {
  return assets.find((asset) => asset.key === key);
}

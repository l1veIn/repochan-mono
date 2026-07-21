export type Locale = "zh" | "en";

/** 一件展品的展签（题名 / 材料 / 藏品号 / 年份） */
export interface ExhibitLabel {
  no: string;
  title: string;
  material: string;
  orderId: string;
  year: string;
  note?: string;
}

export interface ShopCard {
  title: string;
  desc: string;
  command: string;
}

export interface NoteStep {
  title: string;
  desc: string;
  command: string;
}

export interface SiteContent {
  locale: Locale;
  meta: { title: string; description: string };
  nav: {
    brand: string;
    tag: string;
    links: { label: string; href: string }[];
    cta: string;
    localeSwitch: string;
  };
  lobby: {
    kicker: string;
    headlineA: string;
    headlineB: string;
    manifesto: string;
    portrait: ExhibitLabel;
    noteTitle: string;
    noteBody: string;
    ctaPrimary: string;
    ctaPrimaryCommand: string;
    ctaSecondary: string;
    copied: string;
  };
  galleryA: { kicker: string; title: string; intro: string; exhibit: ExhibitLabel };
  galleryB: {
    kicker: string;
    title: string;
    intro: string;
    main: ExhibitLabel;
    studies: ExhibitLabel[];
    propsTitle: string;
    props: ExhibitLabel[];
  };
  galleryC: {
    kicker: string;
    title: string;
    intro: string;
    stickers: ExhibitLabel;
    webstates: ExhibitLabel;
  };
  galleryD: {
    kicker: string;
    title: string;
    intro: string;
    main: ExhibitLabel;
    pair: ExhibitLabel[];
  };
  notes: { kicker: string; title: string; intro: string; steps: NoteStep[] };
  shop: {
    kicker: string;
    title: string;
    intro: string;
    copyLabel: string;
    copiedLabel: string;
    cards: ShopCard[];
  };
  colophon: {
    title: string;
    built: string;
    credits: { label: string; value: string }[];
    links: { label: string; href: string }[];
    localeSwitch: string;
    protocol: string;
  };
  lightbox: { close: string; prev: string; next: string };
}

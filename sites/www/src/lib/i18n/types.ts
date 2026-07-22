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
    ctaSecondaryHref?: string;
    ctaGithub?: string;
    ctaGithubHref?: string;
    copied: string;
  };
  artist: {
    kicker: string;
    title: string;
    intro: string;
    name: string;
    nameZh: string;
    alsoKnown: string;
    catchphrase: string;
    paletteLabel: string;
    colors: string[];
    banner: ExhibitLabel;
    rows: { label: string; value: string; note?: string }[];
    blocks: { label: string; title?: string; value?: string; items?: string[] }[];
    motifsLabel: string;
    motifs: string[];
    motto: string;
    footnotesLabel: string;
    footnotes: string[];
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
  showcase: {
    kicker: string;
    title: string;
    intro: string;
    viewAll: string;
    unofficial: string;
    pageTitle: string;
    pageDescription: string;
    back: string;
    upstream: string;
    character: string;
    foundation: string;
    poster: string;
    icon: string;
    landing: string;
    installCta: string;
    persona: {
      dossier: string;
      alsoKnown: string;
      age: string;
      birthday: string;
      occupation: string;
      world: string;
      catchphrase: string;
      personality: string;
      appearance: string;
      hobbies: string;
      flaws: string;
      motifs: string;
      artStyle: string;
      palette: string;
    };
  };
  colophon: {
    title: string;
    built: string;
    credits: { label: string; value: string }[];
    links: { label: string; href: string }[];
    localeSwitch: string;
    protocol: string;
    disclaimer: string;
  };
  lightbox: { close: string; prev: string; next: string };
}

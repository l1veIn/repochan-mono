export type Locale = "zh" | "en";

export interface FooterLink {
  label: string;
  href: string;
}

export interface BoardShot {
  kind: "terminal" | "pr" | "json";
  title: string;
  caption: string;
}

export interface BoardNote {
  id: string;
  title: string;
  body: string;
  command?: string;
  copyLabel?: string;
  copiedLabel?: string;
  shots?: BoardShot[];
  links?: FooterLink[];
}

export interface SiteContent {
  locale: Locale;
  meta: { title: string; description: string };
  tape: { items: string[] };
  nav: {
    brand: string;
    tag: string;
    newBadge: string;
    readableOn: string;
    readableOff: string;
    localeSwitch: string;
    localeSwitchLabel: string;
  };
  dialog: { title: string; body1: string; body2: string; ok: string; close: string };
  hero: {
    kicker: string;
    headlineA: string;
    headlineB: string;
    headlineC: string;
    sub: string;
    ctaPrimary: string;
    ctaPrimaryCommand: string;
    ctaSecondary: string;
    copied: string;
    stackTraceTitle: string;
    stackTrace: string[];
    stackNote: string;
    marquee: string[];
    huoxing: string[];
    cutoutAlt: string;
  };
  board: { title: string; intro: string; notes: BoardNote[] };
  cta: {
    windowTitle: string;
    progressLabel: string;
    progressValue: string;
    headline: string;
    sub: string;
    command: string;
    copy: string;
    copied: string;
    repoLink: string;
    cutoutAlt: string;
  };
  footer: {
    tagline: string;
    fake404: string;
    badges: string[];
    updated: string;
    links: FooterLink[];
    localeSwitch: string;
    colophon: string;
  };
}

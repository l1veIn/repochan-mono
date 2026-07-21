export type Locale = "zh" | "en";

export interface NavLink {
  shape: "circle" | "triangle" | "square";
  label: string;
  href: string;
}

export interface PipelineStep {
  verb: string;
  name: string;
  desc: string;
  command: string;
  shape: "zigzag" | "semicircle" | "circle" | "arch" | "wave" | "ring";
}

export interface RuleCard {
  title: string;
  desc: string;
  command: string;
  shape: "circle" | "triangle" | "square";
}

export interface SiteContent {
  locale: Locale;
  meta: { title: string; description: string };
  nav: {
    brand: string;
    tag: string;
    links: NavLink[];
    cta: string;
    localeSwitch: string;
  };
  hero: {
    kicker: string;
    headlineA: string;
    headlineB: string;
    sub: string;
    ctaPrimary: string;
    ctaPrimaryCommand: string;
    ctaSecondary: string;
    stageNote: string;
    copied: string;
  };
  pipeline: { title: string; intro: string; steps: PipelineStep[] };
  carousel: {
    title: string;
    intro: string;
    orbitCaption: string;
    statesCaption: string;
    posterCaption: string;
  };
  rules: { title: string; intro: string; copyLabel: string; copiedLabel: string; cards: RuleCard[] };
  cta: {
    headline: string;
    sub: string;
    command: string;
    copy: string;
    copied: string;
    repoLink: string;
  };
  footer: {
    tagline: string;
    built: string;
    links: { label: string; href: string }[];
    localeSwitch: string;
    colophon: string;
  };
}

export interface LocaleMeta {
  title: string;
  description: string;
}

export interface A11yContent {
  skipToContent: string;
  navLabel: string;
  langSwitchLabel: string;
}

export interface NavLink {
  href: string;
  label: string;
}

export interface HeroTitle {
  line1: string;
  line2Pre: string;
  line2Grad: string;
  line2Post: string;
}

export interface PipelineStep {
  num: string;
  en: string;
  title: string;
  desc: string;
  cmd: string;
}

export interface AssetOrb {
  /** Asset slot key in repochan/assets.json — the component resolves the src. */
  slot: string;
  alt: string;
  tag: string;
  size: string;
  float: number;
  drift: number;
}

export interface LocaleContent {
  a11y: A11yContent;
  nav: {
    links: NavLink[];
    langSwitch: { href: string; label: string };
  };
  hero: {
    eyebrow: string;
    title: HeroTitle;
    lead: string;
    primaryCta: string;
    secondaryCta: string;
    dogfood: string;
    scrollHint: string;
  };
  pipeline: {
    kicker: string;
    headingPre: string;
    headingEm: string;
    headingPost: string;
    lead: string;
    steps: PipelineStep[];
  };
  assets: {
    kicker: string;
    heading: string;
    lead: string;
    orbs: AssetOrb[];
    notePre: string;
    noteCode: string;
  };
  persona: {
    kicker: string;
    quoteLine1: string;
    quoteLine2Pre: string;
    quoteLine2Em: string;
    quoteLine2Post: string;
    body: string;
    mood: string;
    cutoutAlt: string;
    /** Alt template for web-state tiles; `{n}` is replaced with the 1-based tile number. */
    stateAltTemplate: string;
  };
  cta: {
    headingLine1: string;
    headingGrad: string;
    lead: string;
    installCmd: string;
    copy: string;
    copied: string;
    github: string;
  };
  footer: {
    copyright: string;
    notePre: string;
    noteLink: string;
    notePost: string;
  };
}

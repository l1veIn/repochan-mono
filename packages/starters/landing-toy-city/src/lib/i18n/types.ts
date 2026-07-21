export type Locale = "zh" | "en";

export type StageId =
  | "gate"
  | "tower"
  | "cafe"
  | "studio"
  | "hall"
  | "shed"
  | "shop"
  | "dock";

export interface StageContent {
  /** 面板角标，如 STAGE A */
  code: string;
  /** 建筑名 */
  name: string;
  /** 产品映射，如 analysis */
  product: string;
  /** 一句话 */
  tagline: string;
  input: string;
  output: string;
  command: string;
  /** 资产缩略图 key（对应 assets.json） */
  thumbs: string[];
  /** 下一站 stage id */
  next: StageId;
  nextLabel: string;
}

export interface SiteContent {
  locale: Locale;
  meta: { title: string; description: string };
  nav: { brand: string; brandSub: string; localeSwitch: string; github: string };
  hero: { kicker: string; title: string; lead: string; hint: string };
  plaza: { caption: string };
  panel: {
    inputLabel: string;
    outputLabel: string;
    commandLabel: string;
    assetsLabel: string;
    nextLabel: string;
    copyLabel: string;
    copiedLabel: string;
    ariaLabel: string;
  };
  stages: Record<StageId, StageContent>;
  souvenir: { title: string; lead: string };
  footer: { line: string; protocol: string; credits: string };
}

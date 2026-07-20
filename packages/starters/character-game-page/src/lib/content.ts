import enRaw from "../../repochan/i18n/en.json";
import zhRaw from "../../repochan/i18n/zh.json";

// Locale files follow the repochan.starter-content.v1 schema: meta holds
// title/description, everything else lives under content. toContent() flattens
// that schema back into the shape the components consume.

function toContent(raw: typeof zhRaw) {
  const { meta, content } = raw;
  const { htmlLang, ogLocale, ...rest } = content;
  return { meta: { ...meta, htmlLang, ogLocale }, ...rest };
}

const zh = toContent(zhRaw);
const en = toContent(enRaw as unknown as typeof zhRaw);

export type Locale = "zh" | "en";
export type Content = typeof zh;

export const defaultLocale: Locale = "zh";
export const supportedLocales: Locale[] = ["zh", "en"];

export const locales: Record<Locale, Content> = {
  zh,
  en,
};

export function getContent(locale: Locale): Content {
  return locales[locale] ?? zh;
}
